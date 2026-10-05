# Render Blueprint for Atrium ({{domain}}). Commit as render.yaml at the repo root, then
# Render dashboard → Blueprints → New. Secrets marked sync:false are entered in the dashboard.
envVarGroups:
  - name: atrium-shared
    envVars:
      - { key: NODE_ENV, value: production }
      - { key: ADMIN_URL, value: "https://{{adminHost}}" }
      - { key: API_URL, value: "https://{{apiHost}}" }
      - { key: RENDERER_URL, value: "https://{{sitesDomain}}" }
      - { key: PLATFORM_SITES_DOMAIN, value: "{{sitesDomain}}" }
      - { key: PREVIEW_URL, value: "https://{{sitesDomain}}" }
      - { key: CORS_ORIGINS, value: "https://{{adminHost}}" }
      - { key: COOKIE_DOMAIN, value: "{{adminHost}}" }
      - { key: JWT_ACCESS_SECRET, generateValue: true }
      - { key: JWT_REFRESH_SECRET, generateValue: true }
      - { key: RENDERER_SECRET, generateValue: true }
      - { key: ANALYTICS_SALT, generateValue: true }
      - { key: ENCRYPTION_KEY, sync: false }   # must be 32 bytes base64: openssl rand -base64 32
      - { key: STORAGE_DRIVER, value: s3 }
      - { key: S3_ENDPOINT, sync: false }
      - { key: S3_BUCKET, sync: false }
      - { key: S3_ACCESS_KEY_ID, sync: false }
      - { key: S3_SECRET_ACCESS_KEY, sync: false }
      - { key: S3_PUBLIC_URL, sync: false }
      - { key: SMTP_HOST, sync: false }
      - { key: SMTP_USER, sync: false }
      - { key: SMTP_PASSWORD, sync: false }
      - { key: MAIL_FROM, value: "Atrium <no-reply@{{domain}}>" }

services:
  - type: web
    name: atrium-api
    runtime: docker
    dockerfilePath: ./infra/containers/api.Containerfile
    healthCheckPath: /v1/health
    plan: standard
    numInstances: 2
    preDeployCommand: "true"   # migrations: run the atrium-migrate job below before deploys
    envVars:
      - fromGroup: atrium-shared
      - { key: PORT, value: "4000" }
      - { key: DATABASE_URL, fromDatabase: { name: atrium-pg, property: connectionString } }
      - { key: REDIS_URL, fromService: { type: keyvalue, name: atrium-redis, property: connectionString } }
    domains: ["{{apiHost}}"]

  - type: worker
    name: atrium-worker
    runtime: docker
    dockerfilePath: ./infra/containers/worker.Containerfile
    plan: standard
    envVars:
      - fromGroup: atrium-shared
      - { key: DATABASE_URL, fromDatabase: { name: atrium-pg, property: connectionString } }
      - { key: REDIS_URL, fromService: { type: keyvalue, name: atrium-redis, property: connectionString } }

  - type: web
    name: atrium-renderer
    runtime: docker
    dockerfilePath: ./infra/containers/renderer.Containerfile
    plan: standard
    numInstances: 2
    envVars:
      - fromGroup: atrium-shared
      - { key: PORT, value: "3001" }
      - { key: ATRIUM_API_INTERNAL_URL, value: "https://{{apiHost}}" }
    domains: ["{{sitesDomain}}", "*.{{sitesDomain}}"]

  - type: web
    name: atrium-admin
    runtime: docker
    dockerfilePath: ./infra/containers/admin.Containerfile
    plan: starter
    envVars:
      - fromGroup: atrium-shared
      - { key: PORT, value: "3000" }
      - { key: ATRIUM_API_INTERNAL_URL, value: "https://{{apiHost}}" }
    domains: ["{{adminHost}}"]

  - type: keyvalue
    name: atrium-redis
    plan: standard
    maxmemoryPolicy: noeviction
    ipAllowList: []

  - type: cron
    name: atrium-migrate
    runtime: docker
    dockerfilePath: ./infra/containers/api.Containerfile
    dockerContext: .
    schedule: "0 0 1 1 *"   # effectively manual: trigger "Run now" before each release
    dockerCommand: node_modules/.bin/prisma migrate deploy
    envVars:
      - { key: DATABASE_URL, fromDatabase: { name: atrium-pg, property: connectionString } }

databases:
  - name: atrium-pg
    databaseName: atrium
    user: atrium
    postgresMajorVersion: "17"
    plan: basic-1gb
