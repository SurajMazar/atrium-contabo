import { execSync } from 'node:child_process';
import { API, EMAIL, PASSWORD } from './session';
import { REPO } from './shell';

/** Facts about the seeded world that scenes need (ids, slugs). */
export interface World {
  orgId: string;
  sites: Record<'aranya' | 'northwind' | 'rosewood', string>;
  token: string;
}

let world: World | null = null;

async function api<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const TUTORIAL_SITES = /^(Himalaya Lodge|Lakeside Café|Aranya Lake Retreat)$/;

/**
 * Reset to a known state: remove websites created by previous takes, recreate the
 * Aranya demo (the builder chapters edit it), then re-run the idempotent seed.
 */
export async function resetWorld(): Promise<World> {
  const login = await api<{ accessToken: string }>('POST', '/auth/login', undefined, { email: EMAIL, password: PASSWORD });
  const me = await api<{ memberships: Array<{ organization: { id: string; slug: string } }> }>('GET', '/auth/me', login.accessToken);
  const org = me.memberships.find((m) => m.organization.slug === 'atrium-demo')!.organization;
  const sites = await api<Array<{ id: string; name: string; slug: string }>>('GET', `/organizations/${org.id}/websites`, login.accessToken);
  for (const s of sites) if (TUTORIAL_SITES.test(s.name)) await api('DELETE', `/websites/${s.id}`, login.accessToken);
  await clearTutorialUploads(org.id, login.accessToken);
  execSync('pnpm db:seed', { cwd: REPO, stdio: 'ignore', env: { ...process.env, SEED_DEMO_SITES: '1' } });
  return getWorld(true);
}

/** Files the media scene uploads (tools/tutorial/.cache/upload). Removed so a re-take isn't a "duplicate upload". */
const TUTORIAL_UPLOADS = new Set(['fine-dining.jpg', 'lake-view-room.jpg', 'spa-massage.jpg']);

export async function clearTutorialUploads(orgId: string, token: string) {
  const res = await api<{ items: Array<{ id: string; filename: string }> }>('GET', `/organizations/${orgId}/media?limit=200`, token);
  for (const m of res.items) if (TUTORIAL_UPLOADS.has(m.filename)) await api('DELETE', `/media/${m.id}`, token);
}

export async function getWorld(fresh = false): Promise<World> {
  if (world && !fresh) return world;
  const login = await api<{ accessToken: string }>('POST', '/auth/login', undefined, { email: EMAIL, password: PASSWORD });
  const me = await api<{ memberships: Array<{ organization: { id: string; slug: string } }> }>('GET', '/auth/me', login.accessToken);
  const org = me.memberships.find((m) => m.organization.slug === 'atrium-demo')!.organization;
  const list = await api<Array<{ id: string; slug: string }>>('GET', `/organizations/${org.id}/websites`, login.accessToken);
  const id = (slug: string) => list.find((s) => s.slug === slug)?.id ?? '';
  world = { orgId: org.id, sites: { aranya: id('aranya'), northwind: id('northwind'), rosewood: id('rosewood') }, token: login.accessToken };
  return world;
}

export { api };
