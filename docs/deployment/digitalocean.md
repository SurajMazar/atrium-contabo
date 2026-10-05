# DigitalOcean

Two good options:

|                      | Option A: App Platform                                    | Option B: Droplet                                                |
| -------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| api, renderer, admin | App Platform services built from the Containerfiles       | containers on one Droplet ([single-server guide](vps-podman.md)) |
| worker               | App Platform **worker** component                         | container                                                        |
| migrations           | App Platform **pre-deploy job**                           | `migrate` compose service                                        |
| PostgreSQL / Redis   | DO Managed PostgreSQL 17 / Managed Caching (Valkey/Redis) | managed, or the bundled containers                               |
| storage              | Spaces (S3-compatible) + CDN                              | Spaces, or the bundled SeaweedFS                                 |
| TLS                  | automatic, incl. wildcard domains                         | Caddy (automatic + on-demand)                                    |

## Shared: managed data services

```bash
doctl databases create atrium-pg --engine pg --version 17 --region fra1 --size db-s-2vcpu-4gb --num-nodes 1
doctl databases create atrium-redis --engine valkey --region fra1 --size db-s-1vcpu-2gb --num-nodes 1
doctl databases config update <redis-id> --engine valkey --config-json '{"valkey_maxmemory_policy":"noeviction"}'
doctl databases connection <pg-id>    # → DATABASE_URL (append ?sslmode=require)
doctl databases connection <redis-id> # → REDIS_URL (rediss://…:25061)
```

The eviction policy can also be set in the control panel (Settings → Eviction policy → `noeviction`);
BullMQ loses jobs under any other policy. Restrict both clusters to your app/Droplet with trusted sources.

Spaces (create the bucket and an access key in the control panel, enable the CDN):

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://fra1.digitaloceanspaces.com
S3_REGION=fra1
S3_BUCKET=atrium-media
S3_FORCE_PATH_STYLE=false
S3_ACCESS_KEY_ID=<spaces key>
S3_SECRET_ACCESS_KEY=<spaces secret>
S3_PUBLIC_URL=https://atrium-media.fra1.cdn.digitaloceanspaces.com
```

The `digitalocean-spaces` preset in the admin's storage provider form pre-fills these for organizations
that bring their own Space.

## Option A — App Platform

Generate secrets first (`pnpm atrium setup production --target docker --domain example.com` gives a
`.env` you can copy values from), then create `.do/app.yaml`:

```yaml
name: atrium
region: fra
envs:
  - { key: NODE_ENV, value: production, scope: RUN_AND_BUILD_TIME }
  - { key: ADMIN_URL, value: https://admin.example.com }
  - { key: API_URL, value: https://api.example.com }
  - { key: RENDERER_URL, value: https://sites.example.com }
  - { key: PLATFORM_SITES_DOMAIN, value: sites.example.com }
  - { key: PREVIEW_URL, value: https://sites.example.com }
  - { key: CORS_ORIGINS, value: https://admin.example.com }
  - { key: COOKIE_DOMAIN, value: admin.example.com }
  - { key: DATABASE_URL, value: '${atrium-pg.DATABASE_URL}' }
  - { key: REDIS_URL, value: '${atrium-redis.DATABASE_URL}' }
  - { key: JWT_ACCESS_SECRET, type: SECRET, value: '<generated>' }
  - { key: JWT_REFRESH_SECRET, type: SECRET, value: '<generated>' }
  - { key: ENCRYPTION_KEY, type: SECRET, value: '<32 bytes base64>' }
  - { key: RENDERER_SECRET, type: SECRET, value: '<generated>' }
  - { key: ANALYTICS_SALT, type: SECRET, value: '<generated>' }
  - { key: STORAGE_DRIVER, value: s3 }
  - { key: S3_ENDPOINT, value: https://fra1.digitaloceanspaces.com }
  - { key: S3_REGION, value: fra1 }
  - { key: S3_BUCKET, value: atrium-media }
  - { key: S3_ACCESS_KEY_ID, type: SECRET, value: '<key>' }
  - { key: S3_SECRET_ACCESS_KEY, type: SECRET, value: '<secret>' }
  - { key: S3_PUBLIC_URL, value: https://atrium-media.fra1.cdn.digitaloceanspaces.com }
  - { key: SMTP_HOST, value: smtp.postmarkapp.com }
  - { key: SMTP_PORT, value: '587' }
  - { key: SMTP_USER, type: SECRET, value: '<user>' }
  - { key: SMTP_PASSWORD, type: SECRET, value: '<password>' }
services:
  - name: api
    dockerfile_path: infra/containers/api.Containerfile
    source_dir: /
    github: { repo: your-org/atrium, branch: main, deploy_on_push: true }
    http_port: 4000
    instance_count: 2
    instance_size_slug: apps-s-1vcpu-2gb
    health_check: { http_path: /v1/health }
    envs: [{ key: PORT, value: '4000' }]
  - name: renderer
    dockerfile_path: infra/containers/renderer.Containerfile
    source_dir: /
    github: { repo: your-org/atrium, branch: main, deploy_on_push: true }
    http_port: 3001
    instance_count: 2
    instance_size_slug: apps-s-1vcpu-1gb
    envs: [{ key: PORT, value: '3001' }, { key: ATRIUM_API_INTERNAL_URL, value: 'http://api:4000' }]
  - name: admin
    dockerfile_path: infra/containers/admin.Containerfile
    source_dir: /
    github: { repo: your-org/atrium, branch: main, deploy_on_push: true }
    http_port: 3000
    instance_size_slug: apps-s-1vcpu-1gb
    envs:
      [
        { key: PORT, value: '3000' },
        { key: ATRIUM_API_INTERNAL_URL, value: 'http://api:4000', scope: RUN_AND_BUILD_TIME },
      ]
workers:
  - name: worker
    dockerfile_path: infra/containers/worker.Containerfile
    source_dir: /
    github: { repo: your-org/atrium, branch: main, deploy_on_push: true }
    instance_count: 1
    instance_size_slug: apps-s-1vcpu-2gb
jobs:
  - name: migrate
    kind: PRE_DEPLOY
    dockerfile_path: infra/containers/api.Containerfile
    source_dir: /
    github: { repo: your-org/atrium, branch: main }
    build_command: '' # App Platform builds the last stage; use a separate Containerfile target if you need `migrate`
    run_command: node_modules/.bin/prisma migrate deploy
ingress:
  rules:
    - { match: { authority: { exact: api.example.com } }, component: { name: api } }
    - { match: { authority: { exact: admin.example.com } }, component: { name: admin } }
    - { match: { path: { prefix: / } }, component: { name: renderer } }
domains:
  - { domain: api.example.com, type: PRIMARY }
  - { domain: admin.example.com, type: ALIAS }
  - { domain: sites.example.com, type: ALIAS }
  - { domain: '*.sites.example.com', type: ALIAS, wildcard: true }
databases:
  - { name: atrium-pg, engine: PG, production: true, cluster_name: atrium-pg }
  - { name: atrium-redis, engine: VALKEY, production: true, cluster_name: atrium-redis }
```

```bash
doctl apps create --spec .do/app.yaml      # later: doctl apps update <app-id> --spec .do/app.yaml
```

Notes:

- The `migrate` job needs the **migrate** image stage (Prisma CLI). App Platform builds the final stage of
  a Dockerfile, so either point the job at a prebuilt `atrium-migrate` image from your registry
  (`image: { registry_type: GHCR, registry: your-org, repository: atrium-migrate, tag: <sha> }`) or keep a
  small Containerfile whose last stage is `migrate`. Check the App Platform spec reference for the current
  field names (`jobs.kind`, `ingress.rules`, `domains.wildcard`).
- Wildcard domains on App Platform require DigitalOcean to manage the domain's DNS.
- Customer domains: add each verified domain to the app's `domains` (App Platform issues the certificate);
  automate via the DO API from a webhook if you onboard many.
- Seed once from a checkout with the managed database URL: `DATABASE_URL=... pnpm db:seed`.

## Option B — Droplet

```bash
doctl compute droplet create atrium --region fra1 --size s-4vcpu-8gb --image ubuntu-24-04-x64 --ssh-keys <id>
pnpm atrium setup production --target podman --domain example.com
```

Follow [vps-podman.md](vps-podman.md). To use the managed services instead of the bundled containers, set
`DATABASE_URL`, `REDIS_URL` and the Spaces `S3_*` values in `deploy/podman/.env`, then remove the
`postgres`, `redis`, `s3` and `s3-init` services (and their `depends_on` entries) from `compose.yaml`.
Add a Cloud Firewall allowing 22/80/443 only, and enable Droplet backups.

## Releases, backups, scaling

- Releases: App Platform redeploys on push (pre-deploy migrate job first); on a Droplet, bump
  `ATRIUM_IMAGE_TAG` and `podman compose pull && podman compose up -d`. Keep migrations backward
  compatible (expand → migrate → contract).
- Backups: managed PostgreSQL has daily backups + PITR (7 days); add `atrium backup` for portable dumps;
  enable Spaces versioning or copy to another region.
- Scaling: raise `instance_count` for api/worker; each renderer instance keeps its own ISR cache and the
  API revalidates `RENDERER_URL` once — keep renderer instances few or add a shared cache handler.

## Troubleshooting

| Symptom                                   | Fix                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| App cannot connect to the database        | add the app as a trusted source; `?sslmode=require`                     |
| Jobs disappear                            | Redis/Valkey eviction policy must be `noeviction`                       |
| Uploads fail with `SignatureDoesNotMatch` | `S3_REGION` must match the Space region and `S3_FORCE_PATH_STYLE=false` |
| Admin requests fail                       | admin built with the wrong `ATRIUM_API_INTERNAL_URL` (build-time)       |
| Wildcard domain not issuing               | DO must host the zone's DNS                                             |
