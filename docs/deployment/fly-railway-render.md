# Fly.io, Railway and Render

All three run the four Atrium services from `infra/containers/*.Containerfile` with managed PostgreSQL and
Redis. `atrium setup production --target fly|railway|render --domain example.com` writes the platform
config plus a `.env` with fresh secrets into `deploy/<target>/`.

|                     | Fly.io                                        | Railway                              | Render                        |
| ------------------- | --------------------------------------------- | ------------------------------------ | ----------------------------- |
| Pricing model       | per machine (pay for running VMs)             | usage-based (CPU/RAM per minute)     | per instance plan             |
| Long-running worker | yes (machine without services)                | yes (service without a domain)       | yes (`worker` service type)   |
| PostgreSQL          | Fly Managed Postgres or external              | PostgreSQL service                   | Render Postgres               |
| Redis               | Upstash for Redis (`fly redis create`)        | Redis service                        | Key Value (Redis-compatible)  |
| Object storage      | Tigris (S3-compatible)                        | Buckets or external S3/R2            | external S3/R2                |
| Wildcard domains    | yes (`fly certs add "*.…"`, DNS-01 via CNAME) | yes (wildcard custom domains)        | yes (wildcard custom domains) |
| Migrations          | `fly machine run` the migrate image           | pre-deploy command / one-off service | pre-deploy command or job     |

Common rules on every platform:

- The admin's `/api/*` rewrite target (`ATRIUM_API_INTERNAL_URL`) is baked in **at build time** — pass it
  as a build argument (private network URL of the API).
- `ENCRYPTION_KEY` must be 32 random bytes, base64 (`openssl rand -base64 32`), identical for api and worker.
- `COOKIE_DOMAIN` is the admin host, never the parent of `sites.example.com`.
- Redis must not evict keys (`noeviction`) — BullMQ stores jobs there.
- The renderer's ISR cache is per instance and the API revalidates `RENDERER_URL` once; run one renderer
  instance per region or add a shared cache handler before scaling out.

## Fly.io

Generated: `deploy/fly/fly.{api,worker,renderer,admin}.toml` and `.env`.

```bash
for s in api worker renderer admin; do fly apps create atrium-$s; done
fly postgres create --name atrium-pg            # or `fly mpg create`, Neon, Supabase…
fly redis create                                 # Upstash; disable eviction in its settings
fly storage create                               # Tigris bucket → prints S3 credentials

# secrets (values from deploy/fly/.env, adjusted for the managed services)
for s in api worker renderer admin; do fly secrets import -a atrium-$s < deploy/fly/.env; done

# migrations (the API image has no Prisma CLI — run the migrate image once per release)
fly machine run ghcr.io/your-org/atrium-migrate:1.0.0 --app atrium-api --rm --restart no

# deploy from the repo root
for s in api worker renderer admin; do
  fly deploy . --config deploy/fly/fly.$s.toml --dockerfile infra/containers/$s.Containerfile -a atrium-$s
done

fly certs add api.example.com -a atrium-api
fly certs add admin.example.com -a atrium-admin
fly certs add sites.example.com -a atrium-renderer
fly certs add "*.sites.example.com" -a atrium-renderer   # follow the _acme-challenge CNAME instructions
```

Apps talk over Fly's private network: the TOML files set `ATRIUM_API_INTERNAL_URL=http://atrium-api.internal:4000`
(also passed as a build arg to the admin). Tigris: `STORAGE_DRIVER=s3`,
`S3_ENDPOINT=https://fly.storage.tigris.dev`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=false` (check the
values `fly storage create` prints). Customer domains: `fly certs add www.customer.com -a atrium-renderer`
per verified domain (automate through the Fly GraphQL API if needed). Scale with
`fly scale count 2 -a atrium-api` and per-region `fly scale count 1 --region fra -a atrium-renderer`.

## Railway

Generated: `deploy/railway/railway.json` (config as code for the api) and `.env`.

1. New project → add **PostgreSQL** and **Redis** services.
2. Add four services from the GitHub repo. In each service's settings set the Dockerfile path
   (`infra/containers/<svc>.Containerfile`) or copy `railway.json` per service with the right
   `dockerfilePath` and health check (`/v1/health` for the api).
3. Variables (Raw editor): paste the generated `.env`, then use references
   `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `REDIS_URL=${{Redis.REDIS_URL}}`.
4. Private networking: services reach each other at `<service>.railway.internal`; set
   `ATRIUM_API_INTERNAL_URL=http://api.railway.internal:4000` on renderer/admin (admin: as a build variable too).
5. Migrations: set the api's **pre-deploy command** to run migrations from an image that contains the
   Prisma CLI, or add a one-off `migrate` service built with target `migrate`
   (`infra/containers/api.Containerfile`) and redeploy it before each release.
6. Domains: `api.example.com` → api, `admin.example.com` → admin, `sites.example.com` and
   `*.sites.example.com` → renderer (Railway shows the CNAME/TXT records).
7. Storage: Railway Buckets or any S3/R2 (`S3_*`).

## Render

Generated: `deploy/render/render.yaml` (Blueprint) and `.env`.

1. Copy `render.yaml` to the repository root and commit it; Render dashboard → **Blueprints** → New.
2. The Blueprint creates web services `atrium-api`, `atrium-renderer`, `atrium-admin`, a background worker
   `atrium-worker`, Postgres `atrium-pg` and Key Value `atrium-redis` (`maxmemoryPolicy: noeviction`).
   `JWT_*`, `RENDERER_SECRET`, `ANALYTICS_SALT` are generated by Render; enter the `sync: false` values
   (`ENCRYPTION_KEY`, `S3_*`, `SMTP_*`) from the generated `.env`.
3. Migrations: the generated `atrium-migrate` service must build the **migrate** stage. Set its Docker
   target to `migrate` in the service settings (or use a prebuilt `atrium-migrate` image) and trigger it
   before releases; alternatively use the api's pre-deploy command with an image that contains the
   Prisma CLI.
4. Domains: add `api.`, `admin.`, `sites.` and `*.sites.` custom domains to the matching services; Render
   verifies them and issues certificates (wildcards need the DNS records Render shows).
5. The renderer and admin reach the API over its public URL in the generated file
   (`ATRIUM_API_INTERNAL_URL=https://api.example.com`); you can switch to the private network hostname
   Render shows for `atrium-api`.

## Seeding and backups

Seed once from a checkout with the platform's PostgreSQL URL: `DATABASE_URL=... pnpm db:seed` (Fly:
`fly proxy 5433:5432 -a atrium-pg`). All three platforms snapshot their managed PostgreSQL; add
`atrium backup` for portable dumps and keep object-storage versioning on.

## Troubleshooting

| Symptom                                  | Fix                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Admin shows network errors               | rebuild the admin with the right `ATRIUM_API_INTERNAL_URL` build argument          |
| Worker idle while jobs pile up           | worker not deployed/running, or Redis evicting keys                                |
| `migrate` fails with "prisma: not found" | it ran the api image; use the `migrate` target/image                               |
| Login cookie not set                     | `COOKIE_DOMAIN`, `CORS_ORIGINS` and `ADMIN_URL` must use the admin host with https |
| Wildcard certificate pending             | add the `_acme-challenge` CNAME the platform shows                                 |
