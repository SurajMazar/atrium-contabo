import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, humanSize, listBackups, resolveBackup, rotate, rotationVictims, sha256File, timestampName, type BackupManifest } from '../lib/backup';

function makeBackup(dir: string, name: string, createdAt: string) {
  const p = join(dir, name);
  mkdirSync(p, { recursive: true });
  const m: BackupManifest = { format: BACKUP_FORMAT, createdAt, host: 'test', atrium: { cli: '0.1.0' }, database: { file: 'database.sql.gz', sha256: 'x', size: 1, migrations: [], method: 'local' } };
  writeFileSync(join(p, 'manifest.json'), JSON.stringify(m));
}

describe('backups', () => {
  it('names backups with sortable timestamps', () => {
    expect(timestampName(new Date(2026, 9, 5, 3, 4, 5))).toBe('20261005-030405');
  });

  it('rotates oldest first and ignores foreign folders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-'));
    makeBackup(dir, '20260101-000000', '2026-01-01T00:00:00Z');
    makeBackup(dir, '20260102-000000', '2026-01-02T00:00:00Z');
    makeBackup(dir, '20260103-000000', '2026-01-03T00:00:00Z');
    mkdirSync(join(dir, 'not-a-backup'));
    expect(rotationVictims(listBackups(dir), 2).map((b) => b.name)).toEqual(['20260101-000000']);
    expect(rotationVictims(listBackups(dir), 0)).toEqual([]);
    expect(rotate(dir, 1)).toEqual(['20260101-000000', '20260102-000000']);
    expect(listBackups(dir).map((b) => b.name)).toEqual(['20260103-000000']);
    expect(resolveBackup('latest', dir).manifest.createdAt).toBe('2026-01-03T00:00:00Z');
    expect(resolveBackup('20260103-000000', dir).path).toBe(join(dir, '20260103-000000'));
    expect(() => resolveBackup('missing', dir)).toThrow();
  });

  it('hashes files and formats sizes', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'h-')), 'x');
    writeFileSync(f, 'abc');
    expect(await sha256File(f)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(humanSize(1536)).toBe('1.5 KiB');
    expect(humanSize(10)).toBe('10 B');
  });
});
