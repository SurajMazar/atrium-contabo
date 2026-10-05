import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';
import { productionChecks, summarize } from '../lib/checks';
import { EnvFile } from '../lib/env';
import {
  TARGET_IDS,
  buildProductionEnv,
  generateProduction,
  productionVars,
  rewriteArtifact,
} from '../lib/production';
import { REPO_ROOT } from './helpers';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) =>
    statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : [join(dir, e)],
  );
}

const example = EnvFile.read(join(REPO_ROOT, '.env.example'))!;

describe.each(TARGET_IDS)('setup production --target %s', (target) => {
  const out = mkdtempSync(join(tmpdir(), `atrium-prod-${target}-`));
  const res = generateProduction(
    {
      target,
      domain: 'acme.dev',
      email: 'ops@acme.dev',
      registry: 'ghcr.io/acme',
      tag: '1.2.3',
      namespace: 'atrium',
      appDir: '/opt/atrium',
      outDir: out,
      root: REPO_ROOT,
    },
    example,
  );
  const files = walk(out);

  it('writes artifacts, an env file and next steps', () => {
    expect(files.length).toBeGreaterThan(1);
    expect(res.envFiles.length).toBeGreaterThan(0);
    for (const f of res.envFiles) expect(statSync(f).mode & 0o777).toBe(0o600);
    expect(res.nextSteps).toContain('acme.dev');
  });

  it('leaves no unrendered placeholders and parses YAML/JSON', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, relative(out, f)).not.toMatch(/(?<!\$)\{\{\s*[A-Za-z_]/);
      if (/\.ya?ml$/.test(f)) {
        for (const doc of parseAllDocuments(text)) expect(doc.errors, relative(out, f)).toEqual([]);
      }
      if (f.endsWith('.json')) expect(() => JSON.parse(text), relative(out, f)).not.toThrow();
    }
  });

  it('uses the domain, not example.com, in generated configuration', () => {
    const env = [...res.envFiles].map((f) => readFileSync(f, 'utf8')).join('\n');
    if (!env.includes('"identities"')) expect(env).toContain('admin.acme.dev');
    expect(env).not.toMatch(/change-me/);
  });
});

describe('production env', () => {
  it('compose mode passes the readiness lint except for SMTP placeholders', () => {
    const vars = productionVars({
      target: 'podman',
      domain: 'acme.dev',
      email: 'ops@acme.dev',
      registry: 'r',
      tag: 't',
      namespace: 'n',
      appDir: '/opt',
      outDir: '/tmp/x',
      root: REPO_ROOT,
    });
    const env = buildProductionEnv(example, vars, 'compose').toObject();
    expect(env.DATABASE_URL).toMatch(/^postgresql:\/\/atrium:[0-9a-f]{48}@postgres:5432\/atrium$/);
    expect(env.COOKIE_DOMAIN).toBe('admin.acme.dev');
    const failing = productionChecks(env)
      .filter((c) => c.status === 'fail')
      .map((c) => c.label);
    expect(failing).toEqual(['No REPLACE_ME placeholders']);
  });

  it('the dev .env.example is flagged as not production-ready', () => {
    const s = summarize(productionChecks(example.toObject()));
    expect(s.fail).toBeGreaterThan(5);
  });

  it('flags cookie domains that would leak to tenant sites', () => {
    const env = {
      ...example.toObject(),
      PLATFORM_SITES_DOMAIN: 'sites.acme.dev',
      COOKIE_DOMAIN: 'acme.dev',
    };
    expect(productionChecks(env).find((c) => c.label.startsWith('COOKIE_DOMAIN'))?.status).toBe(
      'fail',
    );
  });

  it('rewrites copied infra files', () => {
    expect(
      rewriteArtifact('Image=ghcr.io/your-org/atrium-api:latest\nserver_name admin.example.com;', {
        domain: 'acme.dev',
        registry: 'reg.io/x',
        tag: '9',
      }),
    ).toBe('Image=reg.io/x/atrium-api:9\nserver_name admin.acme.dev;');
  });

  it('k8s overlay points at the repository base', () => {
    const out = mkdtempSync(join(tmpdir(), 'atrium-k8s-'));
    generateProduction(
      {
        target: 'k8s',
        domain: 'acme.dev',
        email: 'o@acme.dev',
        registry: 'ghcr.io/acme',
        tag: '1',
        namespace: 'prod',
        appDir: '/opt',
        outDir: out,
        root: REPO_ROOT,
      },
      example,
    );
    const k = readFileSync(join(out, 'kustomization.yaml'), 'utf8');
    const base = /resources:\n\s+- (.+)\n/.exec(k)![1]!;
    expect(existsSync(join(out, base, 'kustomization.yaml'))).toBe(true);
    expect(readFileSync(join(out, 'secrets.env'), 'utf8')).toContain('JWT_ACCESS_SECRET=');
    expect(readFileSync(join(out, 'config.env'), 'utf8')).not.toContain('JWT_ACCESS_SECRET');
  });
});
