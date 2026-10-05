# Atrium on one server with Podman — {{domain}}

Generated {{generatedAt}} by `atrium setup production --target {{target}}`. Full guide: {{doc}}

## 1. DNS (A/AAAA → this server)
| Host | Purpose |
|---|---|
| {{adminHost}} | admin + visual builder |
| {{apiHost}} | REST API |
| {{mediaHost}} | public media (self-hosted S3) |
| {{sitesDomain}} and `*.{{sitesDomain}}` | published websites |
| customer domains | CNAME → {{sitesDomain}} (TLS is issued on demand after the API verifies the domain) |

## 2. Configure
- `.env` already has fresh secrets (JWT, ENCRYPTION_KEY, RENDERER_SECRET, ANALYTICS_SALT, Postgres, S3, admin password).
- Fill `SMTP_*` (REPLACE_ME) and optionally `ANTHROPIC_API_KEY` / `VERCEL_TOKEN`.
- `atrium setup check --env-file .env` must report **ready**.

## 3. Images
Pull from your registry (`podman login {{registry}}`; images `{{registry}}/atrium-{api,worker,renderer,admin,migrate}:{{tag}}`)
or build on the server from the checkout at ATRIUM_SRC_DIR (needs ≥ 6 GiB RAM):
```bash
podman compose build
```

## 4. Run (compose)
```bash
podman compose up -d            # migrate runs first, then api/worker/renderer/admin, Caddy gets certificates
podman compose ps
podman compose logs -f api
```
Rootless Podman cannot bind :80/:443 by default: `sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80`
(persist it in /etc/sysctl.d/99-atrium.conf).

## 4b. Or run with systemd (Quadlet)
See `quadlet/README.md` — the same stack as rootless systemd services with `podman auto-update`.

## 5. First login
Seed plans/permissions/super-admin once (from a checkout that can reach the database, or the migrate image):
```bash
podman compose run --rm migrate node_modules/.bin/tsx prisma/seed.ts   # when the seed only needs @atrium/db
# or from a workstation through an SSH tunnel: DATABASE_URL=... pnpm atrium seed
```
Then sign in at https://{{adminHost}} as SEED_ADMIN_EMAIL with SEED_ADMIN_PASSWORD from `.env`, and change it.

## 6. Operate
- Backups: `scripts/backup.sh --env-file .env --with-files` nightly (cron/systemd timer), copy off-site.
- Upgrade: bump ATRIUM_IMAGE_TAG → `podman compose pull && podman compose up -d` (migrations run first).
- Health: `curl https://{{apiHost}}/v1/health/ready`.
