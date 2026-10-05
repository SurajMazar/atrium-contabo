# cPanel and shared hosting

**Read this first.** Atrium is a platform of four processes plus PostgreSQL, Redis and object storage.
Typical shared cPanel plans cannot host all of it:

| Requirement                                                                                           | Shared cPanel reality                                                                                          |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Long-running worker (BullMQ: email, webhooks, form workflows, media processing, deployments, AI jobs) | no persistent processes; Passenger may idle-stop Node apps                                                     |
| Redis 7                                                                                               | not available on most plans                                                                                    |
| PostgreSQL 15+ (17 recommended)                                                                       | cPanel ships MySQL/MariaDB, which Atrium does **not** support; PostgreSQL, if offered, is often an old version |
| Root, open ports, container runtime                                                                   | not available                                                                                                  |

So the recommended topology is a **split**:

| Piece              | Where                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| API, worker, admin | a VPS or container platform — `atrium setup production --target podman` ([VPS guide](vps-podman.md)), `docker`, `fly`, `render`, `railway`, `aws`… |
| PostgreSQL, Redis  | managed (Neon, Supabase, Aiven, DigitalOcean, RDS, Upstash) or the VPS                                                                             |
| Public websites    | **your cPanel account**: Option A (static export) or Option B (renderer as a Node.js app)                                                          |

If you have **WHM / a VPS with cPanel and root**, you can run everything on that server — see
[WHM / root servers](#whm--vps-with-cpanel-root-access) at the end.

Generate the cPanel helpers first:

```bash
pnpm atrium setup production --target cpanel --domain example.com --out deploy/cpanel
```

| File              | Purpose                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `.htaccess`       | HTTPS redirect, clean URLs for static exports, 404 page, caching and security headers   |
| `build-static.sh` | exports one site and builds it as static files into `public_html/`                      |
| `app.cjs`         | Passenger startup file for the renderer (Option B)                                      |
| `renderer.env`    | environment for the cPanel Node.js app                                                  |
| `.env`            | production settings for the API/worker host (secrets generated; fill REPLACE_ME values) |
| `NEXT-STEPS.md`   | this guide's checklist with your hostnames                                              |

## Option A — static export of a site (any cPanel plan)

Each published website becomes plain HTML/CSS/JS uploaded to `public_html`. No Node.js is needed on the
host. Best for a handful of brochure sites per account.

### 1. Build the export (on your workstation or CI)

```bash
pnpm atrium login --email you@example.com           # against your API host (--api https://api.example.com)
cd deploy/cpanel && ./build-static.sh <site-slug>
```

The script:

1. `atrium export-site <slug> --format json` — downloads the published snapshot;
2. builds the renderer in single-site file mode: `ATRIUM_SNAPSHOT_SOURCE=file`,
   `ATRIUM_SNAPSHOT_FILE=apps/renderer/site-snapshot.json`, `ATRIUM_STATIC_EXPORT=1` → `apps/renderer/out/`;
3. copies the output plus `.htaccess` into `public_html/`.

Alternatively `atrium export-site <slug> --format nextjs -o site.zip` produces a standalone Next.js
project you can build anywhere (`pnpm install && ATRIUM_STATIC_EXPORT=1 pnpm build`).

### 2. Upload

- cPanel **File Manager** → `public_html` → Upload → extract; or
- FTP/SFTP; or `rsync -avz --delete public_html/ user@host:public_html/` when SSH access is enabled; or
- cPanel **Git Version Control**: push the built files to a repository and deploy with a `.cpanel.yml`:

```yaml
---
deployment:
  tasks:
    - export DEPLOYPATH=/home/<cpanel-user>/public_html/
    - /bin/rsync -a --delete --exclude '.git' --exclude '.cpanel.yml' ./ $DEPLOYPATH
```

### 3. Domain and SSL

1. cPanel → **Domains** → add the site's domain (or use the account's primary domain).
2. DNS: an A record to the hosting server IP (or the host's documented CNAME).
3. cPanel → **SSL/TLS Status** → _Run AutoSSL_. The `.htaccess` redirects HTTP to HTTPS once the
   certificate is active.

### 4. What still talks to the API

Static pages are self-contained, but interactive features call the API host directly:

| Feature   | Endpoint                                                      | Requirement                                      |
| --------- | ------------------------------------------------------------- | ------------------------------------------------ |
| Forms     | `POST https://api.example.com/v1/public/forms/:formId/submit` | API reachable; the site's origin allowed by CORS |
| Analytics | `POST https://api.example.com/v1/public/analytics/collect`    | optional                                         |
| Media     | `S3_PUBLIC_URL` / CDN                                         | public bucket or CDN                             |

Preview links and on-publish revalidation do not apply to static exports — **re-export after every
publish**. Automate it from CI (a job that runs `build-static.sh` and rsyncs on each `website.published`
webhook) or a cron on the VPS.

## Option B — renderer as a cPanel Node.js app (CloudLinux "Setup Node.js App")

Some plans include CloudLinux's Node.js Selector (Phusion Passenger). The renderer then serves sites live
from the API (platform mode) or from a snapshot file (single-site mode).

1. **Build elsewhere.** Shared hosts rarely have the memory for `next build`. Build the renderer on CI or
   your workstation with Node 24 and copy `apps/renderer/` including `.next/` and production
   `node_modules/` — the simplest source is the container image:
   ```bash
   podman build --format docker -f infra/containers/renderer.Containerfile -t atrium-renderer .
   podman create --name r atrium-renderer && podman cp r:/app ./renderer-app && podman rm r
   ```
   Upload `renderer-app/` to e.g. `~/atrium` and copy `app.cjs` into `~/atrium/apps/renderer/`.
2. cPanel → **Setup Node.js App** → _Create application_:
   - Node.js version: 22 or newer (24 recommended)
   - Application mode: Production
   - Application root: `atrium/apps/renderer`
   - Application URL: the site domain (or `sites.example.com`)
   - Application startup file: `app.cjs`
3. Add the variables from `renderer.env`:
   - platform mode: `API_URL`, `ATRIUM_API_INTERNAL_URL` (both the public API URL), `RENDERER_URL`,
     `PLATFORM_SITES_DOMAIN`, `RENDERER_SECRET` (same value as on the API);
   - single-site mode: `ATRIUM_SNAPSHOT_SOURCE=file`, `ATRIUM_SNAPSHOT_FILE=./site-snapshot.json`.
4. Start the app. Restart after updates with the _Restart_ button or `touch tmp/restart.txt` in the
   application root. Logs: the app's `stderr.log` (path shown in the Node.js App page) and
   `~/logs/`.

Caveats: Passenger stops idle apps, so the first request after a pause is slow; memory limits (LVE) may
kill the process under load; wildcard subdomains (`*.sites.example.com`) are usually not supported for
AutoSSL on shared plans, so prefer one app per domain or keep the multi-tenant renderer on the VPS.

## Scheduled tasks (cPanel → Cron Jobs)

Cron can run short tasks — re-exporting and syncing static sites, `curl -fsS https://api.example.com/v1/health/ready`
checks, pulling a backup from the VPS. Queue processing cannot run from cron; it stays on the VPS worker.

## Email

Use an external SMTP provider for platform mail (`SMTP_*` on the API host) or per-organization email
providers in the admin. Shared-host mail servers often have low sending limits and poor deliverability.

## WHM / VPS with cPanel (root access)

With root you can run the whole platform next to cPanel:

1. Install Podman (or Docker) and run `atrium setup production --target podman`, **or** install Node 24,
   PostgreSQL 17 and Redis 7 from the OS packages and use `atrium setup production --target systemd`
   (units in `infra/systemd/`).
2. Do not publish the app containers on 80/443 — cPanel's Apache owns them. Bind them to localhost
   (`127.0.0.1:3000`, `127.0.0.1:3001`, `127.0.0.1:4000`) and proxy from Apache with a vhost include, e.g.
   `/etc/apache2/conf.d/userdata/ssl/2_4/<user>/admin.example.com/atrium.conf` (EasyApache 4 path):
   ```apache
   ProxyPreserveHost On
   ProxyPass        / http://127.0.0.1:3000/
   ProxyPassReverse / http://127.0.0.1:3000/
   RequestHeader set X-Forwarded-Proto "https"
   ```
   Repeat for `api.example.com` → 4000 and `sites.example.com` → 3001, then
   `/scripts/rebuildhttpdconf && systemctl restart httpd`. For the API add `ProxyTimeout 120` and disable
   buffering for `/v1/ai/generations/*/events` (Server-Sent Events).
3. AutoSSL covers domains configured in cPanel. Customer domains must be added as parked/addon domains so
   AutoSSL issues them, or run Caddy on another IP for on-demand TLS.
4. PostgreSQL: WHM's PostgreSQL may be old — install PostgreSQL 17 from the PGDG repository or use a
   managed database.

## Troubleshooting

| Symptom                                                      | Fix                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Deep links return 404 on a static site                       | `.htaccess` missing or `AllowOverride` disabled; upload the generated file                 |
| Mixed-content warnings                                       | media must be served over https (`S3_PUBLIC_URL` with https / CDN)                         |
| Form submit fails with a CORS error                          | add the site origin to the API's allowed origins; check the API is reachable from browsers |
| Passenger shows 503 / "Web application could not be started" | wrong startup file or Node version; check `stderr.log`; `.next/` missing from the upload   |
| App killed under load                                        | LVE memory limit — move the renderer to the VPS or use Option A                            |
| `next build` fails on the host                               | expected on shared plans; build on CI and upload the output                                |
