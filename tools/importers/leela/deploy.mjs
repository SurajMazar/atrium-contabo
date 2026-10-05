// Import a bundle into the local Atrium API, publish it, and delete the copy it supersedes.
// Usage: node deploy.mjs <leela-garden|vilasa-by-leela> [--keep]
// Local dev only: signs in with the seeded super-admin (admin@atrium.localhost) from apps/api/scripts/seed.ts.
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.ATRIUM_API ?? 'http://localhost:4000/v1';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const key = process.argv[2];
const keep = process.argv.includes('--keep');
const NAMES = { 'leela-garden': 'Leela Garden', 'vilasa-by-leela': 'Vilasa by Leela' };
if (!NAMES[key]) throw new Error('usage: node deploy.mjs <leela-garden|vilasa-by-leela>');
const stateFile = path.join(HERE, 'out', 'imports.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};

async function call(method, url, { token, json, form } = {}, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${API}${url}`, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}) },
        body: json ? JSON.stringify(json) : form,
      });
      const text = await res.text();
      if (!res.ok) throw Object.assign(new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 2000)}`), { status: res.status });
      return text ? JSON.parse(text) : null;
    } catch (e) {
      if (e.status || i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 3000)); // API dev server restarting
    }
  }
}

const { accessToken: token } = await call('POST', '/auth/login', { json: { email: 'admin@atrium.localhost', password: process.env.ATRIUM_PASSWORD ?? 'Atrium!2026' } });
const me = await call('GET', '/auth/me', { token });
const memberships = me.memberships ?? me.organizations ?? [];
const org = memberships.find((m) => (m.organization?.slug ?? m.slug) === 'atrium-demo');
const orgId = org?.organization?.id ?? org?.organizationId ?? org?.id;
if (!orgId) throw new Error(`atrium-demo org not found in ${JSON.stringify(memberships).slice(0, 500)}`);

const zip = fs.readFileSync(path.join(HERE, 'out', `${key}.zip`));
const form = new FormData();
form.append('file', new Blob([zip], { type: 'application/zip' }), `${key}.zip`);
form.append('name', NAMES[key]);
const t0 = Date.now();
const site = await call('POST', `/organizations/${orgId}/websites/import`, { token, form });
const id = site.id ?? site.website?.id;
const slug = site.slug ?? site.website?.slug;
console.log(`imported ${NAMES[key]} → ${id} (${slug}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const pub = await call('POST', `/websites/${id}/publish`, { token, json: { message: 'Imported from the Next.js source' } });
console.log('published', pub?.version?.version ?? pub?.version ?? '', pub?.issues?.length ? `issues: ${JSON.stringify(pub.issues).slice(0, 800)}` : '');

const prev = state[key];
if (prev && prev.id !== id && !keep) {
  try {
    await call('DELETE', `/websites/${prev.id}`, { token });
    console.log('deleted superseded import', prev.id);
  } catch (e) {
    console.warn('could not delete', prev.id, e.message);
  }
}
let finalSlug = slug;
if (slug !== key) {
  try {
    const upd = await call('PATCH', `/websites/${id}`, { token, json: { slug: key } });
    finalSlug = upd?.slug ?? key;
    await call('POST', `/websites/${id}/publish`, { token, json: { message: 'Slug restored' } });
  } catch (e) {
    console.warn('slug kept as', slug, '-', e.message.slice(0, 200));
  }
}
state[key] = { id, slug: finalSlug, orgId, at: new Date().toISOString() };
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log(`renderer: http://localhost:3001/_site/${finalSlug}`);
console.log(`editor:   http://localhost:3000/w/${id}/editor`);
