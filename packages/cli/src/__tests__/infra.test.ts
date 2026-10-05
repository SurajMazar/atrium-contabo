import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, parseAllDocuments } from 'yaml';
import { REPO_ROOT } from './helpers';

const infra = join(REPO_ROOT, 'infra');
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : [join(dir, e)]));
}

describe('infra YAML', () => {
  const yamlFiles = walk(infra).filter((f) => /\.ya?ml$/.test(f));
  it.each(yamlFiles.map((f) => [relative(REPO_ROOT, f), f]))('%s parses', (_rel, file) => {
    for (const doc of parseAllDocuments(readFileSync(file, 'utf8'))) expect(doc.errors).toEqual([]);
  });

  it('every kustomization references files/dirs that exist', () => {
    const ks = walk(join(infra, 'k8s')).filter((f) => f.endsWith('kustomization.yaml'));
    expect(ks.length).toBeGreaterThanOrEqual(4);
    for (const k of ks) {
      const doc = parse(readFileSync(k, 'utf8')) as { resources?: string[]; components?: string[]; patches?: Array<{ path?: string }>; configMapGenerator?: Array<{ envs?: string[] }>; secretGenerator?: Array<{ envs?: string[] }> };
      const dir = dirname(k);
      for (const r of [...(doc.resources ?? []), ...(doc.components ?? [])]) expect(existsSync(join(dir, r)), `${relative(REPO_ROOT, k)} → ${r}`).toBe(true);
      for (const p of doc.patches ?? []) if (p.path) expect(existsSync(join(dir, p.path)), p.path).toBe(true);
      for (const g of [...(doc.configMapGenerator ?? []), ...(doc.secretGenerator ?? [])]) {
        for (const e of g.envs ?? []) expect(existsSync(join(dir, e)) || existsSync(join(dir, `${e}.example`)), `${relative(REPO_ROOT, k)} env ${e}`).toBe(true);
      }
    }
  });

  it('every Deployment runs as non-root with probes (except the worker) and resource limits', () => {
    for (const f of walk(join(infra, 'k8s', 'base')).filter((x) => x.endsWith('.yaml'))) {
      for (const doc of parseAllDocuments(readFileSync(f, 'utf8'))) {
        const o = doc.toJS() as { kind?: string; metadata?: { name: string }; spec?: { template: { spec: { securityContext: { runAsNonRoot: boolean }; containers: Array<{ readinessProbe?: unknown; resources?: { limits?: { memory?: string } } }> } } } };
        if (o?.kind !== 'Deployment') continue;
        const pod = o.spec!.template.spec;
        expect(pod.securityContext.runAsNonRoot, o.metadata!.name).toBe(true);
        for (const c of pod.containers) {
          expect(c.resources?.limits?.memory, o.metadata!.name).toBeTruthy();
          if (o.metadata!.name !== 'atrium-worker') expect(c.readinessProbe, o.metadata!.name).toBeTruthy();
        }
      }
    }
  });

  it('compose files declare the expected services', () => {
    const dev = parse(readFileSync(join(infra, 'compose.yaml'), 'utf8')) as { services: Record<string, unknown> };
    expect(Object.keys(dev.services)).toEqual(expect.arrayContaining(['postgres', 'redis', 's3', 'mailpit', 'api', 'worker', 'renderer', 'admin']));
    const prod = parse(readFileSync(join(infra, 'compose.prod.yaml'), 'utf8')) as { services: Record<string, { depends_on?: Record<string, { condition: string }> }> };
    expect(Object.keys(prod.services)).toEqual(expect.arrayContaining(['caddy', 'postgres', 'redis', 'migrate', 'api', 'worker', 'renderer', 'admin']));
    expect(prod.services.api!.depends_on!.migrate!.condition).toBe('service_completed_successfully');
  });

  it('Containerfiles exist for every app and run as a non-root user', () => {
    for (const app of ['api', 'worker', 'renderer', 'admin']) {
      const f = readFileSync(join(infra, 'containers', `${app}.Containerfile`), 'utf8');
      expect(f).toContain(`turbo prune @atrium/${app} --docker`);
      expect(f).toMatch(/^USER node$/m);
      expect(f).toContain('org.opencontainers.image.title');
    }
  });

  it('the Caddyfile asks the API before issuing on-demand certificates', () => {
    const c = readFileSync(join(infra, 'caddy', 'Caddyfile'), 'utf8');
    expect(c).toContain('ask http://api:4000/v1/public/domains/check');
    expect(c).toMatch(/tls \{\s*on_demand\s*\}/);
  });
});
