# Fly.io app for the Atrium api. Deploy from the repo root:
#   fly deploy . --config deploy/fly/fly.api.toml --dockerfile infra/containers/api.Containerfile
app = "atrium-api"
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
  PORT = "4000"

# Migrations: the API image does not contain the Prisma CLI, so run the migrate image first:
#   fly machine run {{registry}}/atrium-migrate:{{tag}} --app atrium-api --rm --restart no
# (it inherits the app's secrets: fly secrets import < .env)

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = "off"
  min_machines_running = 2
  [[http_service.checks]]
    grace_period = "30s"
    interval = "15s"
    method = "GET"
    path = "/v1/health"
    timeout = "5s"

[[vm]]
  memory = "1024mb"
  cpu_kind = "shared"
  cpus = 1
