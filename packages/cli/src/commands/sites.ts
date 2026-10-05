import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { Command } from 'commander';
import { ApiError, ApiUnreachableError, findWebsite, getMe, itemsOf, listOrgWebsites, pickOrg, type ApiClient, type WebsiteSummary } from '../lib/api';
import { clearSession, credentialsPath, updateProjectConfig } from '../lib/config';
import { context, type Context } from '../lib/context';
import { withPg } from '../lib/db';
import { examples } from '../lib/help';
import { CliError, ask, color, isJson, log, printJson, readStdin, table, task } from '../lib/ui';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function requireApi(ctx: Context): Promise<ApiClient> {
  const api = ctx.api();
  if (!(await api.isUp())) throw new ApiUnreachableError(api.base, 'health check failed');
  if (!api.hasAuth()) throw new CliError(`Not logged in to ${api.base}`, 'Run `atrium login --email you@example.com` or pass --token.');
  return api;
}

function siteArg(ctx: Context, site?: string): string {
  const s = site ?? ctx.globals.site ?? ctx.config.currentSite;
  if (!s) throw new CliError('No site given', 'Pass a site slug, use --site <slug>, or set a default with `atrium use <site>`.');
  return s;
}

/** Direct-DB fallback for listing (admin view across all organizations). */
async function listSitesFromDb(ctx: Context, org?: string) {
  const url = ctx.vars.DATABASE_URL;
  if (!url) throw new CliError('DATABASE_URL is not set');
  return withPg(ctx.root, url, async (c) => {
    const { rows } = await c.query<{ id: string; name: string; slug: string; status: string; org: string; updated_at: Date; domain: string | null }>(
      `select w.id, w.name, w.slug, w.status, o.slug as org, w.updated_at,
              (select d.hostname from domains d where d.website_id = w.id and d.is_primary limit 1) as domain
         from websites w join organizations o on o.id = w.organization_id
        where w.deleted_at is null and ($1::text is null or o.slug = $1 or o.id = $1)
        order by o.slug, w.slug`,
      [org ?? null],
    );
    return rows;
  });
}

async function pollGeneration(api: ApiClient, id: string, update: (m: string) => void) {
  const deadline = Date.now() + 15 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const g = await api.get<{ status: string; progress?: Array<{ label?: string; step?: string; status?: string }>; error?: string; result?: unknown }>(`/ai/generations/${id}`);
    const step = g.progress?.filter((p) => p.status !== 'pending').at(-1);
    const msg = step ? `${step.label ?? step.step}` : g.status.toLowerCase();
    if (msg !== last) update((last = msg));
    if (g.status === 'SUCCEEDED') return g;
    if (g.status === 'FAILED' || g.status === 'REVERTED') throw new CliError(`AI generation ${g.status.toLowerCase()}: ${g.error ?? 'unknown error'}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new CliError('Timed out waiting for AI generation', `Check progress with GET /v1/ai/generations/${id}`);
}

export function registerSites(program: Command) {
  // ── session ──────────────────────────────────────────────────────────────
  program
    .command('login')
    .description('Log in to the Atrium API; tokens are stored in ~/.config/atrium/credentials.json (0600)')
    .option('--email <email>', 'account email')
    .option('--password-stdin', 'read the password from stdin')
    .addHelpText('after', examples([['atrium login --email admin@atrium.localhost'], ['atrium --api https://api.example.com login --email me@example.com'], ['echo "$PW" | atrium login --email ci@example.com --password-stdin']]))
    .action(async function (this: Command, opts: { email?: string; passwordStdin?: boolean }) {
      const ctx = context(this);
      const api = ctx.api();
      const email = opts.email ?? (await ask.text('Email', { initial: ctx.vars.SEED_ADMIN_EMAIL, required: true }));
      const password = opts.passwordStdin ? await readStdin() : await ask.password('Password');
      const s = await task(`Logging in to ${api.base}`, () => api.login(email, password, () => ask.text('MFA code', { required: true })));
      if (!s.refreshToken) log.warn('No refresh cookie received — you will need to log in again when the access token expires.');
      log.success(`Logged in as ${color.cyan(s.email)} → ${color.dim(credentialsPath())}`);
    });

  program
    .command('logout')
    .description('Revoke and forget the stored API session')
    .action(async function (this: Command) {
      const api = context(this).api();
      await api.logout();
      log.success(clearSession(api.base) ? `Logged out of ${api.base}` : 'No stored session');
    });

  program
    .command('whoami')
    .description('Show the logged-in user and organizations')
    .action(async function (this: Command) {
      const ctx = context(this);
      const me = await getMe(await requireApi(ctx));
      if (isJson()) return printJson(me);
      log.raw(`${color.bold(me.user.name)} <${me.user.email}>${me.user.isSuperAdmin ? color.magenta('  super-admin') : ''}`);
      log.raw(table(['ORGANIZATION', 'SLUG', 'ROLE'], me.memberships.map((m) => [m.organization.name, m.organization.slug, m.role.name])));
    });

  // ── sites ────────────────────────────────────────────────────────────────
  program
    .command('new-site <name>')
    .description('Create a website (blank, from a blueprint template, or generated by AI) — like `bench new-site`')
    .option('--org <org>', 'organization slug or id (default: your only org / `atrium use --org`)')
    .option('--slug <slug>', 'subdomain slug (default: from name)')
    .option('--template <key>', 'blueprint/template key (see `atrium templates`)')
    .option('--ai <prompt>', 'generate the site with the AI agent from a brief')
    .option('--business-type <type>', 'AI brief: business type (e.g. "boutique hotel")')
    .option('--domain <hostname>', 'attach a custom domain and print the DNS records')
    .option('--use', 'make it the current site')
    .addHelpText(
      'after',
      examples([
        ['atrium new-site "Lakeside Inn" --org acme --template hotel'],
        ['atrium new-site "Bean There" --ai "Specialty coffee shop in Pokhara, warm and minimal, menu + contact form"'],
        ['atrium new-site "Acme" --domain www.acme.com --use'],
      ]),
    )
    .action(async function (this: Command, name: string, opts: { org?: string; slug?: string; template?: string; ai?: string; businessType?: string; domain?: string; use?: boolean }) {
      const ctx = context(this);
      const api = await requireApi(ctx);
      const me = await getMe(api);
      const org = pickOrg(me, opts.org ?? ctx.config.defaultOrg);
      const slug = opts.slug ?? slugify(name);
      let site: WebsiteSummary;
      if (opts.ai) {
        const res = await api.post<{ generationId: string; websiteId: string }>(`/organizations/${org.id}/ai/generate-site`, {
          brief: { businessName: name, businessType: opts.businessType ?? '', description: opts.ai },
          prompt: opts.ai,
        });
        await task('Generating website with AI', (update) => pollGeneration(api, res.generationId, update), () => 'AI generation finished');
        site = await api.get<WebsiteSummary>(`/websites/${res.websiteId}`);
      } else {
        site = await task(`Creating ${name} in ${org.slug}`, () =>
          api.post<WebsiteSummary>(`/organizations/${org.id}/websites`, { name, slug, source: opts.template ? { type: 'template', templateKey: opts.template } : { type: 'blank' } }),
        );
      }
      log.success(`Created ${color.cyan(site.slug)} (${site.id}) → http://${site.slug}.${ctx.vars.PLATFORM_SITES_DOMAIN ?? 'sites.localhost'} (after publishing)`);
      log.info(`Edit it: ${ctx.vars.ADMIN_URL ?? 'http://localhost:3000'}/websites/${site.id}`);
      if (opts.domain) {
        const d = await api.post<{ hostname: string; dnsRecords?: Array<{ type: string; name: string; value: string; reason?: string }> }>(`/websites/${site.id}/domains`, { hostname: opts.domain });
        log.success(`Domain ${d.hostname} added — create these DNS records, then run verification in the admin:`);
        log.raw(table(['TYPE', 'NAME', 'VALUE', 'WHY'], (d.dnsRecords ?? []).map((r) => [r.type, r.name, r.value, r.reason ?? ''])));
      }
      if (opts.use) {
        updateProjectConfig(ctx.p.config, { currentSite: site.slug, currentSiteId: site.id, defaultOrg: org.slug });
        log.success(`Current site → ${site.slug}`);
      }
      if (isJson()) printJson(site);
    });

  program
    .command('list-sites')
    .alias('sites')
    .description('List websites you can access (falls back to a direct database read when the API is down)')
    .option('--org <org>', 'only this organization')
    .option('--db', 'read directly from the database (admin view of all organizations)')
    .action(async function (this: Command, opts: { org?: string; db?: boolean }) {
      const ctx = context(this);
      const api = ctx.api();
      const useDb = opts.db || !(await api.isUp()) || !api.hasAuth();
      if (useDb) {
        if (!opts.db) log.warn(`API ${api.hasAuth() ? 'unreachable' : 'session missing'} — reading directly from the database ${color.dim('(admin fallback)')}`);
        const rows = await listSitesFromDb(ctx, opts.org);
        if (isJson()) return printJson(rows);
        if (!rows.length) return log.info('No websites yet. Create one with `atrium new-site <name>`.');
        log.raw(table(['', 'SLUG', 'NAME', 'STATUS', 'ORG', 'DOMAIN', 'UPDATED'], rows.map((r) => [r.slug === ctx.config.currentSite ? color.green('●') : '', r.slug, r.name, r.status, r.org, r.domain ?? '', new Date(r.updated_at).toISOString().slice(0, 16).replace('T', ' ')])));
        return;
      }
      const me = await getMe(api);
      const orgs = opts.org ? [pickOrg(me, opts.org)] : me.memberships.map((m) => m.organization);
      const rows: Array<WebsiteSummary & { org: string }> = [];
      for (const o of orgs) for (const w of await listOrgWebsites(api, o.id)) rows.push({ ...w, org: o.slug });
      if (isJson()) return printJson(rows);
      if (!rows.length) return log.info('No websites yet. Create one with `atrium new-site <name>`.');
      log.raw(table(['', 'SLUG', 'NAME', 'STATUS', 'ORG', 'DOMAIN', 'UPDATED'], rows.map((r) => [r.slug === ctx.config.currentSite ? color.green('●') : '', r.slug, r.name, r.status, r.org, r.primaryDomain ?? '', (r.updatedAt ?? '').slice(0, 16).replace('T', ' ')])));
    });

  program
    .command('use [site]')
    .description('Set the default site (and/or organization) for subsequent commands — stored in .atrium/config.json')
    .option('--org <org>', 'set the default organization')
    .option('--clear', 'clear the current site')
    .action(async function (this: Command, site: string | undefined, opts: { org?: string; clear?: boolean }) {
      const ctx = context(this);
      if (opts.clear) {
        updateProjectConfig(ctx.p.config, { currentSite: undefined, currentSiteId: undefined });
        return log.success('Cleared current site');
      }
      if (!site && !opts.org) {
        log.raw(`site: ${ctx.config.currentSite ?? color.dim('(none)')}  org: ${ctx.config.defaultOrg ?? color.dim('(none)')}`);
        return;
      }
      const patch: Record<string, string | undefined> = {};
      if (opts.org) patch.defaultOrg = opts.org;
      if (site) {
        const api = ctx.api();
        if ((await api.isUp()) && api.hasAuth()) {
          const w = await findWebsite(api, site, opts.org);
          Object.assign(patch, { currentSite: w.slug, currentSiteId: w.id, defaultOrg: opts.org ?? w.orgSlug });
        } else {
          const rows = await listSitesFromDb(ctx).catch(() => []);
          const w = rows.find((r) => r.slug === site || r.id === site);
          if (!w) throw new CliError(`Website "${site}" not found`);
          log.warn('API unavailable — verified the site directly in the database');
          Object.assign(patch, { currentSite: w.slug, currentSiteId: w.id, defaultOrg: opts.org ?? w.org });
        }
      }
      const cfg = updateProjectConfig(ctx.p.config, patch);
      log.success(`Current site: ${color.cyan(cfg.currentSite ?? '(none)')} · org: ${color.cyan(cfg.defaultOrg ?? '(none)')}`);
    });

  program
    .command('drop-site <site>')
    .description('Delete a website (soft delete; falls back to the database when the API is down)')
    .option('--force', 'required — skip the confirmation')
    .action(async function (this: Command, site: string, opts: { force?: boolean }) {
      const ctx = context(this);
      if (!opts.force && !(await ask.confirm(`Delete website ${site}? It disappears from the platform immediately.`, false))) throw new CliError('Aborted (use --force to skip confirmation)');
      const api = ctx.api();
      if ((await api.isUp()) && api.hasAuth()) {
        const w = await findWebsite(api, site);
        await api.delete(`/websites/${w.id}`);
        log.success(`Deleted ${w.slug}`);
      } else {
        log.warn('API unavailable — soft-deleting directly in the database (no audit log entry, renderer cache not purged)');
        const n = await withPg(ctx.root, ctx.vars.DATABASE_URL!, async (c) => (await c.query(`update websites set deleted_at = now(), status = 'ARCHIVED' where (slug = $1 or id = $1) and deleted_at is null`, [site])).rowCount);
        if (!n) throw new CliError(`Website "${site}" not found`);
        log.success(`Soft-deleted ${site}`);
      }
      if (ctx.config.currentSite === site) updateProjectConfig(ctx.p.config, { currentSite: undefined, currentSiteId: undefined });
    });

  program
    .command('publish [site]')
    .description('Validate and publish the draft as a new immutable version (renderer revalidates; INDEPENDENT sites deploy)')
    .option('-m, --message <msg>', 'version message')
    .action(async function (this: Command, site: string | undefined, opts: { message?: string }) {
      const ctx = context(this);
      const api = await requireApi(ctx);
      const w = await findWebsite(api, siteArg(ctx, site));
      try {
        const res = await task(`Publishing ${w.slug}`, () => api.post<{ version: { id: string; number: number }; report?: { warnings?: unknown[]; issues?: unknown[] } }>(`/websites/${w.id}/publish`, { message: opts.message }));
        log.success(`Published ${color.cyan(w.slug)} as version ${res.version.number}`);
        const warnings = res.report?.warnings ?? [];
        if (Array.isArray(warnings) && warnings.length) log.warn(`${warnings.length} warning(s) in the build report`);
        log.info(`Live at http://${w.slug}.${ctx.vars.PLATFORM_SITES_DOMAIN ?? 'sites.localhost'}${w.primaryDomain ? ` and https://${w.primaryDomain}` : ''}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) {
          log.error('Publishing blocked by validation failures:');
          log.raw(JSON.stringify(e.details, null, 2));
        }
        throw e;
      }
    });

  program
    .command('export-site [site]')
    .description('Export a website as site.json, a zip bundle, or a standalone Next.js project')
    .option('-f, --format <format>', 'json | zip | nextjs', 'zip')
    .option('-o, --out <file>', 'output file')
    .addHelpText('after', examples([['atrium export-site lakeside --format nextjs -o lakeside-next.zip', 'deploy anywhere (Vercel, cPanel static export…)'], ['atrium export-site --format json', 'current site, schema only']]))
    .action(async function (this: Command, site: string | undefined, opts: { format: string; out?: string }) {
      const ctx = context(this);
      if (!['json', 'zip', 'nextjs'].includes(opts.format)) throw new CliError(`Unknown format "${opts.format}"`, 'Use json | zip | nextjs');
      const api = await requireApi(ctx);
      const w = await findWebsite(api, siteArg(ctx, site));
      const res = await task(`Exporting ${w.slug} (${opts.format})`, () => api.request<Response>('GET', `/websites/${w.id}/export`, { query: { format: opts.format }, raw: true, timeoutMs: 300_000 }));
      const ext = opts.format === 'json' ? 'json' : 'zip';
      const file = resolve(opts.out ?? `${w.slug}-${opts.format}-${new Date().toISOString().slice(0, 10)}.${ext}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      log.success(`Wrote ${file} (${(buf.length / 1024).toFixed(1)} KiB)`);
      if (opts.format === 'nextjs') log.info('Build it with `pnpm install && pnpm build` inside the extracted folder — see docs/deployment/vercel.md and docs/deployment/cpanel.md.');
    });

  program
    .command('import-site <file>')
    .description('Import a website from a site.json or export zip into an organization')
    .option('--org <org>', 'target organization slug or id')
    .action(async function (this: Command, file: string, opts: { org?: string }) {
      const ctx = context(this);
      const api = await requireApi(ctx);
      const org = pickOrg(await getMe(api), opts.org ?? ctx.config.defaultOrg);
      const path = resolve(file);
      const data = readFileSync(path);
      let created: WebsiteSummary;
      if (path.endsWith('.json')) {
        created = await task(`Importing ${basename(path)} into ${org.slug}`, () => api.post<WebsiteSummary>(`/organizations/${org.id}/websites/import`, { definition: JSON.parse(data.toString('utf8')) }));
      } else {
        const form = new FormData();
        form.append('file', new Blob([data], { type: 'application/zip' }), basename(path));
        created = await task(`Importing ${basename(path)} into ${org.slug}`, () => api.request<WebsiteSummary>('POST', `/organizations/${org.id}/websites/import`, { form, timeoutMs: 300_000 }));
      }
      log.success(`Imported as ${color.cyan(created.slug ?? created.id)}`);
    });

  program
    .command('templates')
    .description('List available site blueprints/templates (for `new-site --template`)')
    .option('--kind <kind>', 'SITE | PAGE | SECTION | THEME', 'SITE')
    .action(async function (this: Command, opts: { kind: string }) {
      const ctx = context(this);
      const api = ctx.api();
      const rows = itemsOf<{ key?: string; id: string; name: string; category?: string; description?: string }>(await api.get('/templates', { kind: opts.kind }));
      if (isJson()) return printJson(rows);
      log.raw(table(['KEY', 'NAME', 'CATEGORY'], rows.map((t) => [t.key ?? t.id, t.name, t.category ?? ''])));
    });
}
