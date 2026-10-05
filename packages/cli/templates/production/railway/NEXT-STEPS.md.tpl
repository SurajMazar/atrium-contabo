# Atrium on Railway — {{domain}}

Generated {{generatedAt}}. Guide: {{doc}}

Create one project with: **PostgreSQL** and **Redis** plugins, plus four services from this repo:

| Service | Dockerfile path (Settings → Build) | Healthcheck | Public domain |
|---|---|---|---|
| api | `infra/containers/api.Containerfile` | `/v1/health` | {{apiHost}} |
| worker | `infra/containers/worker.Containerfile` | — | — |
| renderer | `infra/containers/renderer.Containerfile` | — | {{sitesDomain}}, `*.{{sitesDomain}}` |
| admin | `infra/containers/admin.Containerfile` (build arg `ATRIUM_API_INTERNAL_URL=http://api.railway.internal:4000`) | — | {{adminHost}} |

- `railway.json` is the api config-as-code example; copy it per service and change `dockerfilePath`.
- Variables: paste `.env` into each service's Raw Editor; use `${{Postgres.DATABASE_URL}}` and `${{Redis.REDIS_URL}}` references.
- Migrations: add a pre-deploy command on the api service or run the migrate image as a one-off service
  (`infra/containers/api.Containerfile`, target `migrate`).
- Object storage: Railway Buckets / Cloudflare R2 / S3 — set S3_*.
