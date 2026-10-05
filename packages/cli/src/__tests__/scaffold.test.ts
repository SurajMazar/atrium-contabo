import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureWorkspaceGlob } from '../commands/scaffold';
import { fakeRoot, runCli } from './helpers';

describe('scaffolds', () => {
  it('new-component writes a definition, test and renderer', async () => {
    const root = fakeRoot();
    const r = await runCli(['--root', root, 'new-component', 'Pricing Table', '--category', 'marketing']);
    expect(r.code, r.stderr).toBe(0);
    const def = readFileSync(join(root, 'packages/component-registry/src/components/pricing-table.ts'), 'utf8');
    expect(def).toContain("type: 'pricing-table'");
    expect(def).toContain('export const pricingTableDefinition');
    expect(def).toContain('...sectionBase');
    expect(existsSync(join(root, 'packages/component-registry/src/components/pricing-table.test.ts'))).toBe(true);
    expect(readFileSync(join(root, 'packages/renderer-core/src/components/pricing-table.tsx'), 'utf8')).toContain('export function PricingTableRenderer');
    // refuses to overwrite
    expect((await runCli(['--root', root, 'new-component', 'pricing-table'])).code).not.toBe(0);
  });

  it('block components do not use section fields', async () => {
    const root = fakeRoot();
    await runCli(['--root', root, 'new-component', 'room-card', '--level', 'block']);
    const def = readFileSync(join(root, 'packages/component-registry/src/components/room-card.ts'), 'utf8');
    expect(def).not.toContain('sectionBase');
    expect(def).toContain("level: 'block'");
  });

  it.each(['email', 'sms', 'storage', 'ai', 'deployment', 'captcha'])('new-provider %s', async (kind) => {
    const root = fakeRoot();
    const r = await runCli(['--root', root, 'new-provider', kind, 'acme-relay']);
    expect(r.code, r.stderr).toBe(0);
    const src = readFileSync(join(root, `packages/providers/src/${kind}/acme-relay.ts`), 'utf8');
    expect(src).toContain('export const acmeRelayDriver = defineDriver(');
    expect(src).toContain(`kind: '${kind}'`);
    expect(existsSync(join(root, `packages/providers/src/${kind}/acme-relay.test.ts`))).toBe(true);
  });

  it('rejects unknown provider kinds', async () => {
    expect((await runCli(['--root', fakeRoot(), 'new-provider', 'fax', 'x'])).code).not.toBe(0);
  });

  it('new-plugin creates a package, registers the workspace glob, and hosts scaffolds', async () => {
    const root = fakeRoot();
    expect((await runCli(['--root', root, 'new-plugin', 'hotel-kit'])).code).toBe(0);
    const pkg = JSON.parse(readFileSync(join(root, 'plugins/hotel-kit/package.json'), 'utf8')) as { name: string };
    expect(pkg.name).toBe('@atrium-plugin/hotel-kit');
    expect(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('  - plugins/*');
    expect((await runCli(['--root', root, 'new-component', 'room-card', '--level', 'block', '--plugin', 'hotel-kit'])).code).toBe(0);
    const def = readFileSync(join(root, 'plugins/hotel-kit/src/components/hotel-kit-room-card.ts'), 'utf8');
    expect(def).toContain("type: 'hotel-kit-room-card'");
    expect(def).toContain("from '@atrium/component-registry'");
    expect((await runCli(['--root', root, 'new-provider', 'sms', 'msg91', '--plugin', 'hotel-kit'])).code).toBe(0);
    expect(readFileSync(join(root, 'plugins/hotel-kit/src/providers/msg91.ts'), 'utf8')).toContain("from '@atrium/providers'");
  });

  it('ensureWorkspaceGlob is idempotent and keeps other settings', () => {
    const dir = fakeRoot();
    const f = join(dir, 'pnpm-workspace.yaml');
    expect(ensureWorkspaceGlob(f)).toBe(true);
    expect(ensureWorkspaceGlob(f)).toBe(false);
    const text = readFileSync(f, 'utf8');
    expect(text).toContain('onlyBuiltDependencies:\n  - prisma');
    expect(text.match(/plugins\/\*/g)).toHaveLength(1);
    mkdirSync(join(dir, 'x'));
    writeFileSync(join(dir, 'x', 'w.yaml'), 'packages:\n  - "apps/*"\n');
    expect(ensureWorkspaceGlob(join(dir, 'x', 'w.yaml'))).toBe(true);
  });
});
