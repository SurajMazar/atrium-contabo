import { describe, expect, it } from 'vitest';
import { EnvFile, displayValue, formatValue, mergeEnv, parseValue } from '../lib/env';
import { assessSecret } from '../lib/secrets';

const SAMPLE = `# Header comment
NODE_ENV=development

# Database
DATABASE_URL=postgresql://atrium:atrium@localhost:55432/atrium
MAIL_FROM=Atrium <no-reply@atrium.localhost>
QUOTED="hello # not a comment"
SINGLE='$literal'
INLINE=value # trailing comment
export EXPORTED=yes
EMPTY=
JWT_ACCESS_SECRET=change-me-access-secret-change-me-access-secret
`;

describe('EnvFile', () => {
  it('round-trips byte-for-byte', () => {
    expect(EnvFile.parse(SAMPLE).toString()).toBe(SAMPLE);
  });

  it('parses values like dotenv', () => {
    const env = EnvFile.parse(SAMPLE);
    expect(env.get('MAIL_FROM')).toBe('Atrium <no-reply@atrium.localhost>');
    expect(env.get('QUOTED')).toBe('hello # not a comment');
    expect(env.get('SINGLE')).toBe('$literal');
    expect(env.get('INLINE')).toBe('value');
    expect(env.get('EXPORTED')).toBe('yes');
    expect(env.get('EMPTY')).toBe('');
    expect(env.has('MISSING')).toBe(false);
  });

  it('sets in place, keeping comments and order', () => {
    const env = EnvFile.parse(SAMPLE);
    env.set('NODE_ENV', 'production');
    env.set('NEW_KEY', 'with space');
    const text = env.toString();
    expect(text.split('\n')[1]).toBe('NODE_ENV=production');
    expect(text).toContain('# Database');
    expect(text.trimEnd().endsWith('NEW_KEY="with space"')).toBe(true);
    expect(EnvFile.parse(text).get('NEW_KEY')).toBe('with space');
  });

  it('unsets keys', () => {
    const env = EnvFile.parse(SAMPLE);
    expect(env.unset('EMPTY')).toBe(true);
    expect(env.has('EMPTY')).toBe(false);
    expect(env.unset('EMPTY')).toBe(false);
  });

  it('rejects invalid keys', () => {
    expect(() => EnvFile.parse('').set('bad key', 'x')).toThrow();
  });

  it('quotes only when needed and survives a round trip', () => {
    for (const v of [
      'plain',
      'a b',
      'with"quote',
      'has#hash',
      'multi\nline',
      '$dollar',
      'base64+/==',
      '',
    ]) {
      const env = EnvFile.parse('');
      env.set('K', v);
      expect(EnvFile.parse(env.toString()).get('K')).toBe(v);
    }
    expect(formatValue('abc123+/=')).toBe('abc123+/=');
    expect(parseValue('"a\\nb"')).toBe('a\nb');
  });

  it('handles multi-line double-quoted values', () => {
    const env = EnvFile.parse('KEY="line1\nline2"\nNEXT=1\n');
    expect(env.get('KEY')).toBe('line1\nline2');
    expect(env.get('NEXT')).toBe('1');
  });
});

describe('mergeEnv', () => {
  const example = EnvFile.parse(
    `# App\nNODE_ENV=development\nAPI_URL=http://localhost:4000\nJWT_ACCESS_SECRET=change-me-access-secret-change-me-access-secret\nENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=\nNEW_SETTING=default\n`,
  );

  it('creates a fresh env with generated secrets', () => {
    const r = mergeEnv(example, null, { generateSecrets: true });
    expect(r.generated.sort()).toEqual(['ENCRYPTION_KEY', 'JWT_ACCESS_SECRET']);
    expect(assessSecret('ENCRYPTION_KEY', r.file.get('ENCRYPTION_KEY')).ok).toBe(true);
    expect(assessSecret('JWT_ACCESS_SECRET', r.file.get('JWT_ACCESS_SECRET')).ok).toBe(true);
    expect(r.file.get('API_URL')).toBe('http://localhost:4000');
    expect(r.file.toString()).toContain('# App');
  });

  it('never overwrites existing values and keeps local-only keys', () => {
    const existing = EnvFile.parse(
      `API_URL=https://api.example.com\nJWT_ACCESS_SECRET=${'x'.repeat(20)}abcdefghijklmnopqrstuvwxyz\nCUSTOM=1\n`,
    );
    const r = mergeEnv(example, existing, { generateSecrets: true });
    expect(r.file.get('API_URL')).toBe('https://api.example.com');
    expect(r.file.get('JWT_ACCESS_SECRET')).toBe(existing.get('JWT_ACCESS_SECRET'));
    expect(r.file.get('NEW_SETTING')).toBe('default');
    expect(r.added).toContain('NEW_SETTING');
    expect(r.extra).toEqual(['CUSTOM']);
    expect(r.file.get('CUSTOM')).toBe('1');
    expect(r.generated).toEqual(['ENCRYPTION_KEY']);
  });

  it('replaces example-value secrets but keeps custom weak ones unless asked', () => {
    const existing = EnvFile.parse(
      'JWT_ACCESS_SECRET=short\nENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=\n',
    );
    const keep = mergeEnv(example, existing, { generateSecrets: true });
    expect(keep.file.get('JWT_ACCESS_SECRET')).toBe('short');
    expect(keep.generated).toEqual(['ENCRYPTION_KEY']);
    const regen = mergeEnv(example, existing, { generateSecrets: true, regenerateWeak: true });
    expect(regen.file.get('JWT_ACCESS_SECRET')).not.toBe('short');
    expect(regen.generated.sort()).toEqual(['ENCRYPTION_KEY', 'JWT_ACCESS_SECRET']);
  });

  it('applies overrides', () => {
    const r = mergeEnv(example, EnvFile.parse('API_URL=http://localhost:4000\n'), {
      overrides: { API_URL: 'http://localhost:4100', EXTRA: 'y' },
    });
    expect(r.file.get('API_URL')).toBe('http://localhost:4100');
    expect(r.overridden).toContain('API_URL');
    expect(r.file.get('EXTRA')).toBe('y');
  });
});

describe('displayValue', () => {
  it('masks secrets and URL credentials', () => {
    expect(displayValue('JWT_ACCESS_SECRET', 'abcdefghijklmnopqrstuvwxyz')).toBe('••••••••wxyz');
    expect(displayValue('DATABASE_URL', 'postgresql://atrium:hunter2@db:5432/atrium')).toBe(
      'postgresql://atrium:••••@db:5432/atrium',
    );
    expect(displayValue('API_URL', 'http://localhost:4000')).toBe('http://localhost:4000');
    expect(displayValue('SMTP_PASSWORD', 'pw', true)).toBe('pw');
    expect(displayValue('ANTHROPIC_API_KEY', '')).toBe('');
  });
});
