import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { APP_SECRETS, assessSecret, generateSecret, isSecretKey, isUrlKey } from './secrets';
import { mask, maskUrl } from './ui';

/**
 * A comment- and order-preserving .env document. Unchanged lines round-trip
 * byte-for-byte, so editing one key never reformats the rest of the file.
 */
export type EnvLine =
  | { kind: 'blank'; raw: string }
  | { kind: 'comment'; raw: string }
  | { kind: 'entry'; key: string; value: string; raw: string };

const ENTRY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;
export const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseValue(rawValue: string): string {
  const v = rawValue.trim();
  if (v.startsWith('"')) {
    const end = findClosingQuote(v, '"');
    const inner = end > 0 ? v.slice(1, end) : v.slice(1);
    return inner
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (v.startsWith("'")) {
    const end = v.indexOf("'", 1);
    return end > 0 ? v.slice(1, end) : v.slice(1);
  }
  if (v.startsWith('`')) {
    const end = v.indexOf('`', 1);
    return end > 0 ? v.slice(1, end) : v.slice(1);
  }
  // Unquoted: a `#` preceded by whitespace starts an inline comment.
  const hash = v.search(/\s#/);
  return (hash >= 0 ? v.slice(0, hash) : v).trim();
}

function findClosingQuote(s: string, q: string): number {
  for (let i = 1; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] === q) return i;
  }
  return -1;
}

/** Serialize a value, quoting only when needed. */
export function formatValue(value: string): string {
  if (value === '') return '';
  if (/^[A-Za-z0-9_\-.:/@,+=%*?~^!<>[\]{}]+$/.test(value) && !value.includes('#')) return value;
  if (!value.includes("'") && /[$`\\]/.test(value) && !value.includes('\n')) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

export class EnvFile {
  constructor(public lines: EnvLine[] = []) {}

  static parse(text: string): EnvFile {
    const lines: EnvLine[] = [];
    const src = text.replace(/\r\n/g, '\n').split('\n');
    if (src.length && src[src.length - 1] === '') src.pop();
    for (let i = 0; i < src.length; i++) {
      let raw = src[i]!;
      if (!raw.trim()) {
        lines.push({ kind: 'blank', raw });
        continue;
      }
      if (raw.trimStart().startsWith('#')) {
        lines.push({ kind: 'comment', raw });
        continue;
      }
      const m = ENTRY.exec(raw);
      if (!m) {
        lines.push({ kind: 'comment', raw });
        continue;
      }
      let rest = m[2]!;
      // multi-line double-quoted values
      if (rest.trimStart().startsWith('"') && findClosingQuote(rest.trimStart(), '"') < 0) {
        while (i + 1 < src.length) {
          i++;
          raw += `\n${src[i]}`;
          rest += `\n${src[i]}`;
          if (findClosingQuote(rest.trimStart(), '"') >= 0) break;
        }
        lines.push({
          kind: 'entry',
          key: m[1]!,
          value: parseValue(rest.replace(/\n/g, '\\n')),
          raw,
        });
        continue;
      }
      lines.push({ kind: 'entry', key: m[1]!, value: parseValue(rest), raw });
    }
    return new EnvFile(lines);
  }

  static read(file: string): EnvFile | null {
    if (!existsSync(file)) return null;
    return EnvFile.parse(readFileSync(file, 'utf8'));
  }

  clone(): EnvFile {
    return new EnvFile(this.lines.map((l) => ({ ...l })));
  }

  private entry(key: string) {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]!;
      if (l.kind === 'entry' && l.key === key) return l;
    }
    return undefined;
  }

  has(key: string): boolean {
    return !!this.entry(key);
  }

  get(key: string): string | undefined {
    return this.entry(key)?.value;
  }

  keys(): string[] {
    const seen = new Set<string>();
    for (const l of this.lines) if (l.kind === 'entry') seen.add(l.key);
    return [...seen];
  }

  toObject(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const l of this.lines) if (l.kind === 'entry') out[l.key] = l.value;
    return out;
  }

  /** Set a value in place (keeping position) or append it. Returns the previous value. */
  set(key: string, value: string, opts: { comment?: string } = {}): string | undefined {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid env key "${key}"`);
    const e = this.entry(key);
    if (e) {
      const prev = e.value;
      if (prev !== value) {
        e.value = value;
        e.raw = `${key}=${formatValue(value)}`;
      }
      return prev;
    }
    while (this.lines.length && this.lines[this.lines.length - 1]!.kind === 'blank')
      this.lines.pop();
    if (opts.comment) this.lines.push({ kind: 'comment', raw: `# ${opts.comment}` });
    this.lines.push({ kind: 'entry', key, value, raw: `${key}=${formatValue(value)}` });
    return undefined;
  }

  unset(key: string): boolean {
    const before = this.lines.length;
    this.lines = this.lines.filter((l) => !(l.kind === 'entry' && l.key === key));
    return this.lines.length !== before;
  }

  toString(): string {
    return `${this.lines.map((l) => l.raw).join('\n')}\n`;
  }

  /** Write atomically-ish with 0600 permissions (the file holds secrets). */
  write(file: string, opts: { backup?: boolean } = {}): string | undefined {
    let backupPath: string | undefined;
    if (opts.backup && existsSync(file)) {
      backupPath = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      copyFileSync(file, backupPath);
      chmodSync(backupPath, 0o600);
    }
    writeFileSync(file, this.toString(), { mode: 0o600 });
    try {
      chmodSync(file, 0o600);
    } catch {
      /* non-POSIX fs */
    }
    return backupPath;
  }
}

export interface MergeOptions {
  /** Explicit values that win over everything (ports, URLs chosen by init). */
  overrides?: Record<string, string>;
  /** Generate secrets that are missing, placeholders or example values. */
  generateSecrets?: boolean;
  /** Also replace existing secrets that fail the strength check. */
  regenerateWeak?: boolean;
  /** Which keys count as generated secrets (default: APP_SECRETS). */
  secretKeys?: string[];
}

export interface MergeResult {
  file: EnvFile;
  added: string[];
  generated: string[];
  kept: string[];
  extra: string[];
  overridden: string[];
}

/**
 * Merge `.env.example` with an existing `.env` non-destructively: the example
 * dictates layout and comments, existing values are always kept (unless
 * overridden or a weak secret is regenerated), new keys are added with their
 * example defaults, and local-only keys are preserved at the end.
 */
export function mergeEnv(
  example: EnvFile,
  existing: EnvFile | null,
  opts: MergeOptions = {},
): MergeResult {
  const out = example.clone();
  const res: MergeResult = {
    file: out,
    added: [],
    generated: [],
    kept: [],
    extra: [],
    overridden: [],
  };
  const secretKeys = new Set(opts.secretKeys ?? Object.keys(APP_SECRETS));
  const exampleKeys = new Set(example.keys());

  for (const line of out.lines) {
    if (line.kind !== 'entry') continue;
    const key = line.key;
    const override = opts.overrides?.[key];
    if (override !== undefined) {
      const prev = existing?.get(key);
      setLine(line, override);
      if (prev !== undefined && prev !== override) res.overridden.push(key);
      else if (prev === undefined) res.added.push(key);
      else res.kept.push(key);
      continue;
    }
    const current = existing?.get(key);
    if (current !== undefined) {
      const weak = secretKeys.has(key) && !assessSecret(key, current).ok;
      if (
        weak &&
        (opts.regenerateWeak ||
          (opts.generateSecrets && (current === '' || current === line.value)))
      ) {
        setLine(line, generateSecret(key));
        res.generated.push(key);
      } else {
        const src = existing!.lines.find((l) => l.kind === 'entry' && l.key === key) as
          Extract<EnvLine, { kind: 'entry' }> | undefined;
        line.value = current;
        line.raw =
          src && src.value === current
            ? src.raw.replace(/^\s*export\s+/, '')
            : `${key}=${formatValue(current)}`;
        res.kept.push(key);
      }
      continue;
    }
    if (opts.generateSecrets && secretKeys.has(key)) {
      setLine(line, generateSecret(key));
      res.generated.push(key);
    } else res.added.push(key);
  }

  if (existing) {
    const extras = existing.lines.filter(
      (l): l is Extract<EnvLine, { kind: 'entry' }> =>
        l.kind === 'entry' && !exampleKeys.has(l.key),
    );
    const unique = new Map(extras.map((l) => [l.key, l]));
    for (const [key, override] of Object.entries(opts.overrides ?? {})) {
      if (!exampleKeys.has(key) && unique.has(key))
        unique.set(key, {
          kind: 'entry',
          key,
          value: override,
          raw: `${key}=${formatValue(override)}`,
        });
    }
    if (unique.size) {
      while (out.lines.length && out.lines[out.lines.length - 1]!.kind === 'blank') out.lines.pop();
      out.lines.push(
        { kind: 'blank', raw: '' },
        { kind: 'comment', raw: '# ─── Local additions (not in .env.example) ───' },
      );
      for (const l of unique.values()) {
        out.lines.push({ ...l });
        res.extra.push(l.key);
      }
    }
  }
  for (const [key, value] of Object.entries(opts.overrides ?? {})) {
    if (!out.has(key)) {
      out.set(key, value);
      res.added.push(key);
    }
  }
  return res;
}

function setLine(line: Extract<EnvLine, { kind: 'entry' }>, value: string) {
  line.value = value;
  line.raw = `${line.key}=${formatValue(value)}`;
}

/** Display form of a value: secrets masked, credentials in URLs hidden. */
export function displayValue(key: string, value: string, reveal = false): string {
  if (reveal) return value;
  if (isUrlKey(key) && /:\/\//.test(value)) return maskUrl(value);
  if (isSecretKey(key)) return value ? mask(value) : '';
  return value;
}

/** Load a .env file into an object (does not touch process.env). */
export function loadEnvObject(file: string): Record<string, string> {
  return EnvFile.read(file)?.toObject() ?? {};
}

/** Environment for child processes: process.env overlaid with the project .env. */
export function childEnv(
  envFile: string,
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const fromFile = loadEnvObject(envFile);
  return { ...fromFile, ...process.env, ...stripUndefined(extra) };
}

function stripUndefined(o: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<
    string,
    string
  >;
}
