import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStorageProvider, localStorageConfigSchema } from '../src/storage/local';
import { S3StorageProvider, s3ConfigSchema } from '../src/storage/s3';
import { normalizeKey, verifyLocalSignedUrl } from '../src/storage/shared';

describe('local storage', () => {
  let dir: string;
  let p: LocalStorageProvider;
  const secret = 'local-signing-secret-123';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'atrium-local-'));
    p = new LocalStorageProvider(localStorageConfigSchema.parse({ directory: dir, publicBaseUrl: 'http://localhost:4000/v1/storage/' }), { signingSecret: secret });
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('round-trips buffer and stream uploads, copy, move, delete', async () => {
    const stored = await p.upload({ key: 'org/a/hello world.txt', body: Buffer.from('hello'), contentType: 'text/plain' });
    expect(stored).toMatchObject({ key: 'org/a/hello world.txt', size: 5 });
    expect((await p.download('org/a/hello world.txt')).toString()).toBe('hello');
    await p.upload({ key: 'org/b.txt', body: Readable.from([Buffer.from('str'), Buffer.from('eam')]), contentType: 'text/plain' });
    expect((await p.download('org/b.txt')).toString()).toBe('stream');
    await p.copy('org/b.txt', 'org/c.txt');
    await p.move('org/c.txt', 'org/d/e.txt');
    expect(await p.exists('org/c.txt')).toBe(false);
    expect(await p.exists('org/d/e.txt')).toBe(true);
    await p.delete('org/d/e.txt');
    expect(await p.exists('org/d/e.txt')).toBe(false);
    await expect(p.download('missing.txt')).rejects.toThrow(/not found/);
    await expect(p.test()).resolves.toMatchObject({ ok: true });
  });

  it('builds public URLs and verifiable signed URLs', async () => {
    expect(p.getPublicUrl('org/a/hello world.txt')).toBe('http://localhost:4000/v1/storage/org/a/hello%20world.txt');
    const signed = new URL(await p.getSignedUrl('org/a/hello world.txt', { expiresInSeconds: 60, disposition: 'attachment' }));
    const key = decodeURIComponent(signed.pathname.replace('/v1/storage/', ''));
    const params = { expires: signed.searchParams.get('expires'), sig: signed.searchParams.get('sig'), disposition: signed.searchParams.get('disposition') };
    expect(verifyLocalSignedUrl(secret, key, params)).toBe(true);
    expect(verifyLocalSignedUrl('other-secret-xxxxxxx', key, params)).toBe(false);
    expect(verifyLocalSignedUrl(secret, 'org/other.txt', params)).toBe(false);
    expect(verifyLocalSignedUrl(secret, key, params, Date.now() + 120_000)).toBe(false);
  });

  it('rejects traversal keys', () => {
    expect(() => normalizeKey('../etc/passwd')).toThrow();
    expect(() => normalizeKey('a//b')).toThrow();
    expect(() => p.pathFor('a/../../x')).toThrow();
    expect(normalizeKey('/a/b.png')).toBe('a/b.png');
  });
});

// Integration against the local SeaweedFS S3 gateway (skipped when unreachable).
const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:59000';
const reachable = await fetch(S3_ENDPOINT, { signal: AbortSignal.timeout(5000) })
  .then(() => true)
  .catch(() => false);

describe.skipIf(!reachable)('s3 storage (SeaweedFS integration)', () => {
  const p = new S3StorageProvider(
    s3ConfigSchema.parse({ bucket: process.env.S3_BUCKET ?? 'atrium-media', endpoint: S3_ENDPOINT, forcePathStyle: true, region: 'us-east-1', accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'atrium', publicUrl: `${S3_ENDPOINT}/atrium-media`, keyPrefix: 'test-suite' }),
    { secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'atrium-secret' },
  );
  const key = `providers/${Date.now()}/file one.txt`;

  it('upload/download/exists/copy/move/delete + signed + public URLs', async () => {
    await p.upload({ key, body: Buffer.from('s3 hello'), contentType: 'text/plain', visibility: 'public' });
    expect(await p.exists(key)).toBe(true);
    expect((await p.download(key)).toString()).toBe('s3 hello');
    const signed = await p.getSignedUrl(key, { expiresInSeconds: 120 });
    expect(await (await fetch(signed)).text()).toBe('s3 hello');
    const pub = p.getPublicUrl(key);
    expect(pub).toContain('/atrium-media/test-suite/providers/');
    expect(await (await fetch(pub)).text()).toBe('s3 hello');
    await p.copy(key, `${key}.copy`);
    await p.move(`${key}.copy`, `${key}.moved`);
    expect(await p.exists(`${key}.copy`)).toBe(false);
    expect((await p.download(`${key}.moved`)).toString()).toBe('s3 hello');
    const upload = await p.getUploadUrl(key + '.direct', 'text/plain');
    const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: 'direct' });
    expect(put.ok).toBe(true);
    expect((await p.download(key + '.direct')).toString()).toBe('direct');
    for (const k of [key, `${key}.moved`, `${key}.direct`]) await p.delete(k);
    expect(await p.exists(key)).toBe(false);
    await expect(p.test()).resolves.toMatchObject({ ok: true });
  });
});
