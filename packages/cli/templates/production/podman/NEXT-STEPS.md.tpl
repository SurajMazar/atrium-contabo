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
- `.env` already has fresh secrets (JWT, ENCRYPTION_KEY, RENDERER_SECRET, ANALYTICS_SALT, Postgres owner +
  app role, Redis password, S3, admin password). Only api, worker and migrate read it in full; caddy,
  postgres, redis, renderer and admin get just their own variables (see the header of `compose.yaml`).
- Fill `SMTP_*` (REPLACE_ME) and optionally `ANTHROPIC_API_KEY` / `VERCEL_TOKEN`.
- `atrium setup check --env-file .env` must report **ready**. The API, worker and renderer refuse to
  start with NODE_ENV=production if a secret is missing/weak/a placeholder or a public URL is not https.
- Postgres: migrations run as the owner role (`MIGRATE_DATABASE_URL`); the app connects as the DML-only
  `atrium_app` role (`DATABASE_URL`), created by `postgres/initdb/10-app-role.sh` on the first start.

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
Copy `.env` to `~/.config/atrium/atrium.env` and the per-service `env/*.env`, `redis/`, `postgres/`
next to it; renderer/admin/caddy/postgres/redis never see the full `.env`. To seed with Quadlet, add
`Network=atrium.network` + `PublishPort=127.0.0.1:5433:5432` to `atrium-postgres.container` temporarily.

## 5. First login
Seed plans, permissions, templates and the super-admin once, from a checkout that can reach the
database (runtime images ship no dev tooling), **using this generated `.env`** — it carries
NODE_ENV=production and the generated SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD. (Outside local development
the seed refuses the .env.example credentials; without SEED_ADMIN_PASSWORD it prints a one-time password.)
Postgres only listens on the internal `data` network, so publish it on loopback temporarily:
```bash
printf "services:\n  postgres:\n    ports: ['127.0.0.1:5433:5432']\n    networks: [data, edge]\n" > compose.seed.yaml
podman compose -f compose.yaml -f compose.seed.yaml up -d postgres
# (from your workstation instead: ssh -L 5433:127.0.0.1:5433 you@server)
DEPLOY="$PWD"; PGAPP="$(grep '^POSTGRES_APP_PASSWORD=' .env | cut -d= -f2-)"
cd "$(grep '^ATRIUM_SRC_DIR=' .env | cut -d= -f2-)"           # the Atrium checkout
pnpm atrium seed --env-file "$DEPLOY/.env" \
  --database-url "postgresql://atrium_app:$PGAPP@127.0.0.1:5433/atrium"
cd "$DEPLOY" && podman compose -f compose.yaml up -d postgres && rm compose.seed.yaml   # data network only again
```
Then sign in at https://{{adminHost}} as SEED_ADMIN_EMAIL with SEED_ADMIN_PASSWORD from `.env`, and change it.

## 6. Operate
- Backups: `scripts/backup.sh --env-file .env --with-files` nightly (cron/systemd timer), copy off-site.
- Upgrade: bump ATRIUM_IMAGE_TAG → `podman compose pull && podman compose up -d` (migrations run first).
- Health: `curl https://{{apiHost}}/v1/health/ready`.
