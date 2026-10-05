import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, getSession, saveSession, updateProjectConfig, readProjectConfig } from '../lib/config';
import { EnvFile } from '../lib/env';
import { fakeRoot, runCli } from './helpers';

describe('atrium config', () => {
  let root: string;
  beforeEach(() => {
    root = fakeRoot();
    writeFileSync(join(root, '.env'), readFileSync(join(root, '.env.example')));
  });

  it('set writes the value in place and keeps comments', async () => {
    const r = await runCli(['--root', root, 'config', 'set', 'API_URL', 'http://localhost:4100']);
    expect(r.code).toBe(0);
    const text = readFileSync(join(root, '.env'), 'utf8');
    expect(EnvFile.parse(text).get('API_URL')).toBe('http://localhost:4100');
    expect(text).toContain('# Public URLs');
    expect(statSync(join(root, '.env')).mode & 0o777).toBe(0o600);
  });

  it('get masks secrets unless --reveal', async () => {
    await runCli(['--root', root, 'config', 'set', 'SMTP_PASSWORD', 'super-secret-password-1234']);
    const masked = await runCli(['--root', root, 'config', 'get', 'SMTP_PASSWORD']);
    expect(masked.stdout.trim()).toBe('••••••••1234');
    const clear = await runCli(['--root', root, 'config', 'get', 'SMTP_PASSWORD', '--reveal']);
    expect(clear.stdout.trim()).toBe('super-secret-password-1234');
  });

  it('list never prints secrets', async () => {
    const r = await runCli(['--root', root, '--json', 'config', 'list']);
    const data = JSON.parse(r.stdout) as Record<string, string>;
    expect(data.API_URL).toBe('http://localhost:4000');
    expect(data.JWT_ACCESS_SECRET).toMatch(/^•+/);
    expect(data.DATABASE_URL).toBe('postgresql://atrium:••••@localhost:55432/atrium');
    expect(r.stdout).not.toContain('change-me-access-secret');
  });

  it('validates values', async () => {
    const bad = await runCli(['--root', root, 'config', 'set', 'API_PORT', 'abc']);
    expect(bad.code).not.toBe(0);
    const badKey = await runCli(['--root', root, 'config', 'set', 'ENCRYPTION_KEY', 'tooshort']);
    expect(badKey.code).not.toBe(0);
    const gen = await runCli(['--root', root, 'config', 'set', 'ENCRYPTION_KEY', '--generate']);
    expect(gen.code).toBe(0);
    expect(Buffer.from(EnvFile.read(join(root, '.env'))!.get('ENCRYPTION_KEY')!, 'base64')).toHaveLength(32);
  });

  it('unset removes a key; get of a missing key fails', async () => {
    expect((await runCli(['--root', root, 'config', 'unset', 'GEMINI_API_KEY'])).code).toBe(0);
    expect((await runCli(['--root', root, 'config', 'get', 'GEMINI_API_KEY'])).code).toBe(2);
  });
});

describe('setup env', () => {
  it('creates .env with strong secrets and is idempotent', async () => {
    const root = fakeRoot();
    expect((await runCli(['--root', root, '--yes', 'setup', 'env'])).code).toBe(0);
    const first = readFileSync(join(root, '.env'), 'utf8');
    const env = EnvFile.parse(first);
    expect(env.get('JWT_ACCESS_SECRET')).not.toContain('change-me');
    expect(Buffer.from(env.get('ENCRYPTION_KEY')!, 'base64')).toHaveLength(32);
    await runCli(['--root', root, '--yes', 'setup', 'env']);
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe(first);
  });
});

describe('credentials + project config', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atrium-cred-'));
  });
  afterEach(() => undefined);

  it('stores sessions per API URL with 0600 permissions', () => {
    const file = join(dir, 'credentials.json');
    saveSession('http://localhost:4000/v1/', { email: 'a@b.c', accessToken: 't', savedAt: 'now' }, file);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(getSession('http://localhost:4000', file)?.email).toBe('a@b.c');
    expect(clearSession('http://localhost:4000', file)).toBe(true);
    expect(getSession('http://localhost:4000', file)).toBeUndefined();
  });

  it('use-style project config merges and drops empty keys', () => {
    const file = join(dir, '.atrium', 'config.json');
    updateProjectConfig(file, { currentSite: 'demo', defaultOrg: 'acme' });
    updateProjectConfig(file, { currentSite: undefined });
    expect(readProjectConfig(file)).toEqual({ defaultOrg: 'acme' });
  });
});
