import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CryptoConfigError,
  DecryptionError,
  decryptJson,
  decryptSecret,
  deriveSecret,
  deriveSecretCandidates,
  derivationKeyId,
  encryptJson,
  encryptSecret,
  hashToken,
  keyringFromEnv,
  needsReencryption,
  randomToken,
  reencryptSecret,
  SecretBox,
  signHmac,
  signWebhookPayload,
  verifyHmac,
  verifyWebhookSignature,
  webhookHeaders,
} from '../src/crypto';

const k1 = randomBytes(32).toString('base64');
const k2 = randomBytes(32).toString('base64');
const saved = { ...process.env };

beforeEach(() => {
  delete process.env.ENCRYPTION_KEYS;
  delete process.env.ENCRYPTION_KEY_ID;
  process.env.ENCRYPTION_KEY = k1;
});
afterEach(() => {
  process.env = { ...saved };
});

describe('secret encryption', () => {
  it('round-trips strings, objects and JSON', () => {
    const enc = encryptSecret('hunter2');
    expect(enc).toMatch(/^v1:default:[\w-]+:[\w-]+:[\w-]+$/);
    expect(enc).not.toContain('hunter2');
    expect(decryptSecret(enc)).toBe('hunter2');
    expect(JSON.parse(decryptSecret(encryptSecret({ a: 1 })))).toEqual({ a: 1 });
    const value = { apiKey: 'sk-123', nested: { list: [1, 'two'] } };
    expect(decryptJson(encryptJson(value))).toEqual(value);
    expect(encryptSecret('same')).not.toBe(encryptSecret('same')); // random IV
  });

  it('detects tampering in every part', () => {
    const enc = encryptSecret('payload');
    const parts = enc.split(':');
    for (const i of [2, 3, 4]) {
      const p = [...parts];
      const buf = Buffer.from(p[i]!, 'base64url');
      buf[0] = buf[0]! ^ 0xff;
      p[i] = buf.toString('base64url');
      expect(() => decryptSecret(p.join(':'))).toThrow(DecryptionError);
    }
    expect(() => decryptSecret(enc.replace('v1:default', 'v1:other'))).toThrow(/Unknown encryption key/);
    expect(() => decryptSecret('garbage')).toThrow(DecryptionError);
  });

  it('header is authenticated (moving ciphertext to another key id with same key fails)', () => {
    const box = new SecretBox({ activeKeyId: 'a', keys: new Map([['a', Buffer.from(k1, 'base64')], ['b', Buffer.from(k1, 'base64')]]) });
    const enc = box.encrypt('x');
    expect(() => box.decrypt(enc.replace('v1:a:', 'v1:b:'))).toThrow(DecryptionError);
  });

  it('supports key rotation', () => {
    const old = encryptSecret('legacy');
    process.env.ENCRYPTION_KEYS = `k2:${k2}`;
    process.env.ENCRYPTION_KEY_ID = 'k2';
    const fresh = encryptSecret('new');
    expect(fresh.startsWith('v1:k2:')).toBe(true);
    expect(decryptSecret(old)).toBe('legacy');
    expect(needsReencryption(old)).toBe(true);
    expect(needsReencryption(fresh)).toBe(false);
    const rotated = reencryptSecret(old);
    expect(rotated.startsWith('v1:k2:')).toBe(true);
    expect(decryptSecret(rotated)).toBe('legacy');
    // once the old key is removed, legacy ciphertext can no longer be read but rotated can
    delete process.env.ENCRYPTION_KEY;
    expect(() => decryptSecret(old)).toThrow(/Unknown encryption key/);
    expect(decryptSecret(rotated)).toBe('legacy');
  });

  it('validates key configuration', () => {
    expect(() => keyringFromEnv({})).toThrow(CryptoConfigError);
    expect(() => keyringFromEnv({ ENCRYPTION_KEY: Buffer.from('short').toString('base64') })).toThrow(/32 bytes/);
    expect(() => keyringFromEnv({ ENCRYPTION_KEYS: 'bad' })).toThrow(/keyId:base64key/);
    expect(() => keyringFromEnv({ ENCRYPTION_KEY: k1, ENCRYPTION_KEY_ID: 'missing' })).toThrow(/not present/);
    expect(keyringFromEnv({ ENCRYPTION_KEYS: `a:${k1},b:${k2}` }).activeKeyId).toBe('a');
    // the repo's example key decodes to 32 bytes
    expect(keyringFromEnv({ ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' }).keys.get('default')!.length).toBe(32);
  });

  it('derives stable purpose-specific secrets', () => {
    expect(deriveSecret('x')).toBe(deriveSecret('x'));
    expect(deriveSecret('x')).not.toBe(deriveSecret('y'));
  });

  it('derived secrets survive rotating the active encryption key', () => {
    const before = deriveSecret('local-storage-urls', { ENCRYPTION_KEY: k1 });
    // rotation: new key added and made active, old (default) key kept
    const rotated = { ENCRYPTION_KEY: k1, ENCRYPTION_KEYS: `k2:${k2}`, ENCRYPTION_KEY_ID: 'k2' };
    expect(deriveSecret('local-storage-urls', rotated)).toBe(before);
    expect(derivationKeyId(rotated)).toBe('default');
    // explicit derivation key id; candidates include every key (stable one first)
    const explicit = { ...rotated, ENCRYPTION_DERIVE_KEY_ID: 'k2' };
    expect(deriveSecret('local-storage-urls', explicit)).not.toBe(before);
    expect(deriveSecretCandidates('local-storage-urls', explicit)).toEqual([deriveSecret('local-storage-urls', explicit), before]);
    expect(() => deriveSecret('x', { ...rotated, ENCRYPTION_DERIVE_KEY_ID: 'nope' })).toThrow(/not present/);
  });
});

describe('tokens + hmac', () => {
  it('hashToken / randomToken', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const t = randomToken();
    expect(t).toMatch(/^[\w-]{43}$/);
    expect(randomToken(16)).toHaveLength(22);
  });

  it('verifies HMAC in constant time with/without prefix', () => {
    const sig = signHmac('s3cret', 'payload');
    expect(verifyHmac('s3cret', 'payload', sig)).toBe(true);
    expect(verifyHmac('s3cret', 'payload', `sha256=${sig}`)).toBe(true);
    expect(verifyHmac('s3cret', 'payload2', sig)).toBe(false);
    expect(verifyHmac('other', 'payload', sig)).toBe(false);
    expect(verifyHmac('s3cret', 'payload', 'zz')).toBe(false);
    expect(verifyHmac('s3cret', 'payload', sig.slice(0, 10))).toBe(false);
  });

  it('webhook signatures over `${timestamp}.${body}`', () => {
    const body = JSON.stringify({ event: 'form.submitted' });
    const ts = 1_760_000_000;
    const sig = signWebhookPayload('whsec', ts, body);
    expect(sig).toBe(`sha256=${signHmac('whsec', `${ts}.${body}`)}`);
    expect(verifyWebhookSignature('whsec', ts, body, sig, 300, ts * 1000 + 10_000)).toBe(true);
    expect(verifyWebhookSignature('whsec', ts, body, sig, 300, ts * 1000 + 600_000)).toBe(false); // replay window
    expect(verifyWebhookSignature('whsec', ts, `${body} `, sig, 300, ts * 1000)).toBe(false);
    const headers = webhookHeaders('whsec', { event: 'form.submitted', deliveryId: 'd1', body, timestamp: ts });
    expect(headers).toMatchObject({ 'X-Atrium-Event': 'form.submitted', 'X-Atrium-Delivery': 'd1', 'X-Atrium-Timestamp': String(ts), 'X-Atrium-Signature': sig });
  });
});
