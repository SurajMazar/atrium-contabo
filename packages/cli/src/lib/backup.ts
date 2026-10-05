import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const BACKUP_FORMAT = 'atrium-backup/1';

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  label?: string;
  host: string;
  atrium: { version?: string; cli: string; gitCommit?: string | null };
  database: { file: string; sha256: string; size: number; serverVersion?: string; migrations: string[]; method: string };
  files?: { file: string; sha256: string; size: number; driver: string; bucket?: string; objects: number };
}

export function timestampName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function sha256File(file: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', rej)
      .on('end', () => res(h.digest('hex')));
  });
}

/** Backup directories (those containing manifest.json), oldest first. */
export function listBackups(dir: string): Array<{ name: string; path: string; manifest: BackupManifest }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => ({ name, path: join(dir, name) }))
    .filter((b) => statSync(b.path).isDirectory() && existsSync(join(b.path, 'manifest.json')))
    .map((b) => {
      try {
        return { ...b, manifest: JSON.parse(readFileSync(join(b.path, 'manifest.json'), 'utf8')) as BackupManifest };
      } catch {
        return null;
      }
    })
    .filter((b): b is { name: string; path: string; manifest: BackupManifest } => !!b && b.manifest.format === BACKUP_FORMAT)
    .sort((a, b) => a.manifest.createdAt.localeCompare(b.manifest.createdAt) || a.name.localeCompare(b.name));
}

/** Which backups to delete to keep the newest `keep`. */
export function rotationVictims<T extends { manifest: BackupManifest }>(backups: T[], keep: number): T[] {
  if (keep <= 0 || backups.length <= keep) return [];
  return backups.slice(0, backups.length - keep);
}

export function rotate(dir: string, keep: number): string[] {
  const victims = rotationVictims(listBackups(dir), keep);
  for (const v of victims) rmSync(v.path, { recursive: true, force: true });
  return victims.map((v) => v.name);
}

/** Resolve `latest`, a backup name under backupsDir, or a path. */
export function resolveBackup(arg: string, backupsDir: string): { path: string; manifest: BackupManifest } {
  if (arg === 'latest') {
    const all = listBackups(backupsDir);
    const last = all.at(-1);
    if (!last) throw new Error(`No backups in ${backupsDir}`);
    return last;
  }
  const candidates = [resolve(arg), join(backupsDir, arg)];
  for (const c of candidates) {
    const m = join(c, 'manifest.json');
    if (existsSync(m)) {
      const manifest = JSON.parse(readFileSync(m, 'utf8')) as BackupManifest;
      if (manifest.format !== BACKUP_FORMAT) throw new Error(`${m} is not an Atrium backup manifest`);
      return { path: c, manifest };
    }
  }
  throw new Error(`Backup "${arg}" not found (looked in ${candidates.join(', ')})`);
}

export function humanSize(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}
