# Atrium on one server with Docker Compose — {{domain}}

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
- `compose.yaml` runs **only the application** (migrate, api, worker, renderer, admin). Point `.env` at
  your own services: `DATABASE_URL` + `MIGRATE_DATABASE_URL` (PostgreSQL), `REDIS_URL`, storage
  (`STORAGE_DRIVER=local` or `S3_*`) and `SMTP_*`, and put your reverse proxy in front of
  127.0.0.1:3000 (admin), :4000 (api) and :3001 (sites). Bundled Caddy, PostgreSQL, Redis and SeaweedFS
  are in `compose.yaml`, commented out — uncomment a service with its `depends_on` entries and volume.
- The API adds missing reference data, built-in roles and the first super admin (SEED_ADMIN_EMAIL /
  SEED_ADMIN_PASSWORD) on every start; existing data is never changed.
- `.env` already has fresh secrets (JWT, ENCRYPTION_KEY, RENDERER_SECRET, ANALYTICS_SALT, Postgres owner +
  app role, Redis password, S3, admin password). Only api, worker and migrate read it in full; caddy,
  postgres, redis, renderer and admin get just their own variables (see the header of `compose.yaml`).
- Fill `SMTP_*` (REPLACE_ME) and optionally `ANTHROPIC_API_KEY` / `VERCEL_TOKEN`.
- `atrium setup check --env-file .env` must report **ready**. The API, worker and renderer refuse to
  start with NODE_ENV=production if a secret is missing/weak/a placeholder or a public URL is not https.
- Postgres: migrations run as the owner role (`MIGRATE_DATABASE_URL`); the app connects as the DML-only
  `atrium_app` role (`DATABASE_URL`), created by `postgres/initdb/10-app-role.sh` on the first start.

## 3. Images
Pull from your registry (`docker login {{registry}}`; images `{{registry}}/atrium-{api,worker,renderer,admin,migrate}:{{tag}}`)
or build on the server from the checkout at ATRIUM_SRC_DIR (needs ≥ 6 GiB RAM):
```bash
docker compose build
```

## 4. Run (compose)
```bash
docker compose up -d            # migrate runs first, then api/worker/renderer/admin, Caddy gets certificates
docker compose ps
docker compose logs -f api
```


## 5. First login
Seed plans, permissions, templates and the super-admin once, from a checkout that can reach the
database (runtime images ship no dev tooling), **using this generated `.env`** — it carries
NODE_ENV=production and the generated SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD. (Outside local development
the seed refuses the .env.example credentials; without SEED_ADMIN_PASSWORD it prints a one-time password.)
Postgres only listens on the internal `data` network, so publish it on loopback temporarily:
```bash
printf "services:\n  postgres:\n    ports: ['127.0.0.1:5433:5432']\n    networks: [data, edge]\n" > compose.seed.yaml
docker compose -f compose.yaml -f compose.seed.yaml up -d postgres
# (from your workstation instead: ssh -L 5433:127.0.0.1:5433 you@server)
DEPLOY="$PWD"; PGAPP="$(grep '^POSTGRES_APP_PASSWORD=' .env | cut -d= -f2-)"
cd "$(grep '^ATRIUM_SRC_DIR=' .env | cut -d= -f2-)"           # the Atrium checkout
pnpm atrium seed --env-file "$DEPLOY/.env" \
  --database-url "postgresql://atrium_app:$PGAPP@127.0.0.1:5433/atrium"
cd "$DEPLOY" && docker compose -f compose.yaml up -d postgres && rm compose.seed.yaml   # data network only again
```
Then sign in at https://{{adminHost}} as SEED_ADMIN_EMAIL with SEED_ADMIN_PASSWORD from `.env`, and change it.

Users and super admins can also be managed from inside the running API container (no checkout needed):
```bash
docker compose exec api node dist/cli.js create-user --email you@example.com --name "You" --super-admin
docker compose exec api node dist/cli.js super-admin --email you@example.com     # promote an existing account
docker compose exec api node dist/cli.js set-password --email you@example.com
docker compose exec api node dist/cli.js reset-mfa --email you@example.com       # lost authenticator
docker compose exec api node dist/cli.js list-users --super-admins
```
Super admins must turn on two-factor authentication (Account → Security) before platform admin pages open.

## 6. Operate
- Backups: `scripts/backup.sh --env-file .env --with-files` nightly (cron/systemd timer), copy off-site.
- Upgrade: bump ATRIUM_IMAGE_TAG → `docker compose pull && docker compose up -d` (migrations run first).
- Health: `curl https://{{apiHost}}/v1/health/ready`.
