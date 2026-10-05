# Fly.io app for the Atrium worker. Deploy from the repo root:
#   fly deploy . --config deploy/fly/fly.worker.toml --dockerfile infra/containers/worker.Containerfile
app = "atrium-worker"
primary_region = "iad"

[env]
  NODE_ENV = "production"
  ADMIN_URL = "https://{{adminHost}}"
  API_URL = "https://{{apiHost}}"
  RENDERER_URL = "https://{{sitesDomain}}"
  PLATFORM_SITES_DOMAIN = "{{sitesDomain}}"
  PREVIEW_URL = "https://{{sitesDomain}}"
  CORS_ORIGINS = "https://{{adminHost}}"
  COOKIE_DOMAIN = "{{adminHost}}"
  ATRIUM_API_INTERNAL_URL = "http://atrium-api.internal:4000"

[[vm]]
  memory = "2048mb"
  cpu_kind = "shared"
  cpus = 1
