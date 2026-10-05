# Atrium + cPanel — {{domain}}

Generated {{generatedAt}}. Full guide (read the limits section first): {{doc}}

Shared hosting cannot run the API's long-lived **worker** or **Redis**, and cPanel's MySQL is **not
supported** (Atrium requires PostgreSQL 15+). Recommended split:

| Piece | Where |
|---|---|
| API + worker + admin | a VPS / container platform (`atrium setup production --target podman|docker|fly|render…`) |
| PostgreSQL / Redis | managed (Neon, Supabase, RDS, DO, Upstash…) or the VPS |
| Public websites | **this cPanel account** — static export (Option A) or the renderer as a Node.js app (Option B) |

## Option A — static export of one site (any cPanel plan)
1. `chmod +x build-static.sh && ./build-static.sh <site-slug>`
2. Upload `public_html/` (includes `.htaccess`). Enable AutoSSL for the domain in cPanel → SSL/TLS Status.
3. Re-run after each publish (or automate from CI).

## Option B — live renderer via "Setup Node.js App" (CloudLinux/Passenger plans)
1. Upload the built renderer (`apps/renderer` with `.next/` and production node_modules — e.g. from
   `podman build -f infra/containers/renderer.Containerfile` → copy `/app` out, or `pnpm --filter @atrium/renderer deploy --prod`).
2. cPanel → Setup Node.js App → Node 22+/24, Application root `{{appDir}}/apps/renderer`,
   startup file `app.cjs` (this folder), variables from `renderer.env`.
3. Point {{sitesDomain}} (and a wildcard subdomain if the plan allows) at the app; AutoSSL covers them.

## Scheduled tasks
cPanel → Cron Jobs can call your API host's backup or maintenance endpoints, but queue processing must stay on the VPS worker.
