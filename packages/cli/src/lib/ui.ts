import * as p from '@clack/prompts';
import pc from 'picocolors';

/** Error type for expected failures: printed without a stack trace, with an optional hint. */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

const state = { yes: false, verbose: false, json: false };

export function setUiOptions(opts: { yes?: boolean; verbose?: boolean; json?: boolean }) {
  if (opts.yes !== undefined) state.yes = opts.yes;
  if (opts.verbose !== undefined) state.verbose = opts.verbose;
  if (opts.json !== undefined) state.json = opts.json;
}

export const isVerbose = () => state.verbose || !!process.env.ATRIUM_DEBUG;
export const isJson = () => state.json;

/** True when we may prompt: a TTY on both ends, not CI, and not `--yes`. */
export function isInteractive(): boolean {
  return !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.CI && !state.yes;
}

export const color = pc;

export const log = {
  info: (msg: string) => p.log.info(msg),
  step: (msg: string) => p.log.step(msg),
  success: (msg: string) => p.log.success(msg),
  warn: (msg: string) => p.log.warn(pc.yellow(msg)),
  error: (msg: string) => p.log.error(pc.red(msg)),
  message: (msg: string) => p.log.message(msg),
  debug: (msg: string) => {
    if (isVerbose()) p.log.message(pc.dim(msg));
  },
  /** Raw line (no gutter) — for machine-readable output and tables. */
  raw: (msg = '') => process.stdout.write(`${msg}\n`),
};

export function intro(title: string) {
  if (isJson()) return;
  p.intro(pc.bgCyan(pc.black(` ${title} `)));
}

export function outro(msg: string) {
  if (isJson()) return;
  p.outro(msg);
}

export function note(body: string, title?: string) {
  if (isJson()) return;
  p.note(body, title);
}

/**
 * Run a step with a spinner (TTY) or a plain progress line (CI/pipes). The
 * callback may update the message through `update`. Errors are re-thrown after
 * the spinner is marked as failed.
 */
export async function task<T>(
  title: string,
  fn: (update: (msg: string) => void) => Promise<T>,
  done?: (result: T) => string,
): Promise<T> {
  if (!process.stdout.isTTY || isJson()) {
    if (!isJson()) process.stdout.write(`${pc.cyan('◇')} ${title}…\n`);
    try {
      const res = await fn((m) => isVerbose() && process.stdout.write(`  ${pc.dim(m)}\n`));
      if (!isJson()) process.stdout.write(`${pc.green('◆')} ${done ? done(res) : title}\n`);
      return res;
    } catch (err) {
      if (!isJson()) process.stdout.write(`${pc.red('■')} ${title} — failed\n`);
      throw err;
    }
  }
  const s = p.spinner();
  s.start(title);
  try {
    const res = await fn((m) => s.message(`${title} ${pc.dim(`· ${m}`)}`));
    s.stop(done ? done(res) : title);
    return res;
  } catch (err) {
    s.error(`${title} — ${pc.red('failed')}`);
    throw err;
  }
}

const ANSI = /\u001b\[[0-9;]*m/g;
const visibleLength = (s: string) => s.replace(ANSI, '').length;

/** Render an aligned text table. */
export function table(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const cells = rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))));
  const widths = headers.map((h, i) =>
    Math.max(visibleLength(h), ...cells.map((r) => visibleLength(r[i] ?? ''))),
  );
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - visibleLength(s)));
  const line = (r: string[]) =>
    r
      .map((c, i) => pad(c, widths[i] ?? 0))
      .join('  ')
      .trimEnd();
  return [
    pc.bold(line(headers)),
    pc.dim(widths.map((w) => '─'.repeat(w)).join('  ')),
    ...cells.map(line),
  ].join('\n');
}

export function statusIcon(status: 'ok' | 'warn' | 'fail' | 'info' | 'skip'): string {
  switch (status) {
    case 'ok':
      return pc.green('✔');
    case 'warn':
      return pc.yellow('▲');
    case 'fail':
      return pc.red('✖');
    case 'skip':
      return pc.dim('○');
    default:
      return pc.cyan('ℹ');
  }
}

function unwrap<T>(value: T | symbol): T {
  // clack returns a cancel symbol when the user hits Ctrl+C
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    throw new CliError('Cancelled by user', undefined, 130);
  }
  return value as T;
}

/** Prompt helpers that fall back to defaults when not interactive. */
export const ask = {
  async text(
    message: string,
    opts: {
      initial?: string;
      placeholder?: string;
      validate?: (v: string) => string | undefined;
      required?: boolean;
    } = {},
  ): Promise<string> {
    if (!isInteractive()) {
      if (opts.initial === undefined && opts.required)
        throw new CliError(
          `Missing value for "${message}" in non-interactive mode`,
          'Pass the corresponding flag.',
        );
      return opts.initial ?? '';
    }
    return unwrap<string>(
      await p.text({
        message,
        initialValue: opts.initial,
        placeholder: opts.placeholder,
        validate: (v) => {
          const val = v ?? '';
          if (opts.required && !val.trim()) return 'Required';
          return opts.validate?.(val);
        },
      }),
    );
  },
  async password(
    message: string,
    opts: { validate?: (v: string) => string | undefined; optional?: boolean } = {},
  ): Promise<string> {
    if (!isInteractive()) {
      if (opts.optional) return '';
      throw new CliError(
        `Cannot prompt for "${message}" in non-interactive mode`,
        'Pass --password or --password-stdin.',
      );
    }
    return unwrap<string>(await p.password({ message, validate: (v) => opts.validate?.(v ?? '') }));
  },
  async confirm(message: string, initial = true): Promise<boolean> {
    if (!isInteractive()) return state.yes ? true : initial;
    return unwrap<boolean>(await p.confirm({ message, initialValue: initial }));
  },
  async select<T extends string>(
    message: string,
    options: Array<{ value: T; label: string; hint?: string }>,
    initial?: T,
  ): Promise<T> {
    if (!isInteractive()) return initial ?? options[0]!.value;
    return unwrap<T>(
      await p.select<T>({ message, options: options as never, initialValue: initial }),
    );
  },
};

/** Mask a secret for display, e.g. `••••••••abcd` (matches the API's masking). */
export function mask(value: string | undefined | null): string {
  if (!value) return '';
  if (value.length < 12) return '••••••••';
  return `••••••••${value.slice(-4)}`;
}

/** Hide the password component of a URL: postgresql://user:••••@host/db */
export function maskUrl(value: string): string {
  return value.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:/@\s]*:)[^@/\s]+@/i, '$1••••@');
}

export function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Read all of stdin (for --password-stdin). */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}
