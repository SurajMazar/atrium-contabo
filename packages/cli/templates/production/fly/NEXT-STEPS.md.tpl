# Atrium on Fly.io — {{domain}}

Generated {{generatedAt}}. Guide: {{doc}}

```bash
for s in api worker renderer admin; do fly apps create atrium-$s; done
fly postgres create --name atrium-pg            # or Fly Managed Postgres / Neon / Supabase
fly redis create                                 # Upstash Redis; set maxmemory policy to noeviction
# secrets (same for every app; values from .env)
for s in api worker renderer admin; do fly secrets import -a atrium-$s < .env; done
fly machine run {{registry}}/atrium-migrate:{{tag}} --app atrium-api --rm --restart no   # migrations
cd <repo root> && for s in api worker renderer admin; do fly deploy . --config deploy/fly/fly.$s.toml --dockerfile infra/containers/$s.Containerfile -a atrium-$s; done
fly certs add {{apiHost}} -a atrium-api && fly certs add {{adminHost}} -a atrium-admin
fly certs add {{sitesDomain}} -a atrium-renderer && fly certs add "*.{{sitesDomain}}" -a atrium-renderer   # wildcard: DNS-01 via _acme-challenge CNAME
```
Object storage: Tigris (`fly storage create`, S3-compatible) or any S3 provider — set S3_* secrets.
Internal traffic uses `http://atrium-api.internal:4000` over Fly's private network.
