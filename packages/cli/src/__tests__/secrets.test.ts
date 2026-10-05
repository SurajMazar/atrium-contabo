import { describe, expect, it } from 'vitest';
import { APP_SECRETS, INFRA_SECRETS, assessSecret, generateSecret, isSecretKey, randomSecret } from '../lib/secrets';

describe('secret generation', () => {
  it('generates every app secret strong enough to pass its own check', () => {
    for (const key of [...Object.keys(APP_SECRETS), ...Object.keys(INFRA_SECRETS)]) {
      const v = generateSecret(key);
      expect(assessSecret(key, v), key).toEqual({ ok: true });
    }
  });

  it('ENCRYPTION_KEY is 32 random bytes in base64', () => {
    const k = generateSecret('ENCRYPTION_KEY');
    expect(Buffer.from(k, 'base64')).toHaveLength(32);
    expect(generateSecret('ENCRYPTION_KEY')).not.toBe(k);
  });

  it('POSTGRES_PASSWORD is URL-safe hex', () => {
    expect(generateSecret('POSTGRES_PASSWORD')).toMatch(/^[0-9a-f]{48}$/);
  });

  it('randomSecret honours encoding', () => {
    expect(randomSecret(16, 'hex')).toMatch(/^[0-9a-f]{32}$/);
    expect(randomSecret(32, 'base64url')).not.toMatch(/[+/=]/);
  });
});

describe('assessSecret', () => {
  it('flags missing, example and placeholder values', () => {
    expect(assessSecret('JWT_ACCESS_SECRET', undefined).reason).toBe('missing');
    expect(assessSecret('JWT_ACCESS_SECRET', 'change-me-access-secret-change-me-access-secret').reason).toBe('example');
    expect(assessSecret('RENDERER_SECRET', 'please-change-me-now-1234567890abcdef').reason).toBe('placeholder');
    expect(assessSecret('ENCRYPTION_KEY', 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=').reason).toBe('example');
  });

  it('checks ENCRYPTION_KEY length', () => {
    expect(assessSecret('ENCRYPTION_KEY', Buffer.alloc(16, 7).toString('base64')).reason).toBe('wrong-length');
    expect(assessSecret('ENCRYPTION_KEY', 'not base64 at all!!!!!!!!!!!!!!!!!!!!!!!!!!').reason).toBe('wrong-length');
  });

  it('checks length and entropy', () => {
    expect(assessSecret('JWT_ACCESS_SECRET', 'abc').reason).toBe('too-short');
    expect(assessSecret('JWT_ACCESS_SECRET', 'a'.repeat(64)).reason).toBe('low-entropy');
  });
});

describe('isSecretKey', () => {
  it('classifies keys', () => {
    for (const k of ['JWT_ACCESS_SECRET', 'SMTP_PASSWORD', 'VERCEL_TOKEN', 'ANTHROPIC_API_KEY', 'ENCRYPTION_KEY', 'S3_ACCESS_KEY_ID', 'ANALYTICS_SALT']) expect(isSecretKey(k), k).toBe(true);
    for (const k of ['API_URL', 'NODE_ENV', 'SMTP_HOST', 'S3_BUCKET', 'ANTHROPIC_MODEL']) expect(isSecretKey(k), k).toBe(false);
  });
});
