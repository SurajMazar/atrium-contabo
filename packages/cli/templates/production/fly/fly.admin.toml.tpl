# Fly.io app for the Atrium admin. Deploy from the repo root:
#   fly deploy . --config deploy/fly/fly.admin.toml --dockerfile infra/containers/admin.Containerfile
app = "atrium-admin"
primary_region = "iad"

[build]
  [build.args]
    ATRIUM_API_INTERNAL_URL = "http://atrium-api.internal:4000"

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
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"
  min_machines_running = 1

[[vm]]
  memory = "1024mb"
  cpu_kind = "shared"
  cpus = 1
