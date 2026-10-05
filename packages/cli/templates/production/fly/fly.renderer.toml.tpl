# Fly.io app for the Atrium renderer. Deploy from the repo root:
#   fly deploy . --config deploy/fly/fly.renderer.toml --dockerfile infra/containers/renderer.Containerfile
app = "atrium-renderer"
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
  PORT = "3001"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = "off"
  min_machines_running = 2

[[vm]]
  memory = "1024mb"
  cpu_kind = "shared"
  cpus = 1
