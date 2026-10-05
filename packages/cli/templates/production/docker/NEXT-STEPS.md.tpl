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
- `.env` already has fresh secrets (JWT, ENCRYPTION_KEY, RENDERER_SECRET, ANALYTICS_SALT, Postgres, S3, admin password).
- Fill `SMTP_*` (REPLACE_ME) and optionally `ANTHROPIC_API_KEY` / `VERCEL_TOKEN`.
- `atrium setup check --env-file .env` must report **ready**.

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
database (runtime images ship no dev tooling). Postgres is not published on the host, so tunnel into it:
```bash
docker compose exec postgres sh -c 'echo ok'          # sanity check
ssh -L 5433:<postgres container IP>:5432 you@server   # or temporarily add ports: ["127.0.0.1:5433:5432"]
DATABASE_URL=postgresql://atrium:<POSTGRES_PASSWORD>@localhost:5433/atrium pnpm db:seed
```
Then sign in at https://{{adminHost}} as SEED_ADMIN_EMAIL with SEED_ADMIN_PASSWORD from `.env`, and change it.

## 6. Operate
- Backups: `scripts/backup.sh --env-file .env --with-files` nightly (cron/systemd timer), copy off-site.
- Upgrade: bump ATRIUM_IMAGE_TAG → `docker compose pull && docker compose up -d` (migrations run first).
- Health: `curl https://{{apiHost}}/v1/health/ready`.
