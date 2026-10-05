# Single server (VPS) with Podman or Docker

**When to choose this:** one VM (4 vCPU / 8 GB RAM is comfortable for a few hundred sites) running the
whole platform: Caddy, PostgreSQL, Redis, SeaweedFS, api, worker, renderer and admin. Lowest cost and
complexity; scale up the VM, or move PostgreSQL/Redis/storage to managed services as you grow.

| Component                         | Where                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Caddy 2                           | container, ports 80/443, automatic HTTPS + on-demand TLS for tenant/custom domains |
| PostgreSQL 17, Redis 7, SeaweedFS | containers on a private network (or managed services)                              |
| migrate                           | one-shot container (`prisma migrate deploy`) that runs before api/worker start     |
| api, worker, renderer, admin      | containers from `infra/containers/*.Containerfile`                                 |

Three ways to run the same stack: **compose** (podman or docker), **Quadlet** (rootless systemd units,
recommended with Podman), or **systemd + Node on the host** (no containers, nginx in front).

## 1. DNS

Point these records at the server (A/AAAA):

| Host                                       | Purpose                       |
| ------------------------------------------ | ----------------------------- |
| `admin.example.com`                        | admin and builder             |
| `api.example.com`                          | REST API                      |
| `media.example.com`                        | public media (self-hosted S3) |
| `sites.example.com`, `*.sites.example.com` | published websites            |

Customer domains are added in the admin and pointed (CNAME or A) at `sites.example.com`.

## 2. Server preparation

```bash
# Debian 12 / Ubuntu 24.04
sudo apt update && sudo apt install -y podman podman-compose git ufw
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
# rootless Podman binding :80/:443
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/99-atrium.conf && sudo sysctl --system
sudo loginctl enable-linger "$USER"
```

With Docker instead: install Docker Engine + the compose plugin and use `docker compose` below.

## 3. Generate the deployment directory

On your workstation (or on the server in a checkout):

```bash
pnpm atrium setup production --target podman --domain example.com --email ops@example.com \
  --registry ghcr.io/your-org --tag 1.0.0
```

`deploy/podman/` now contains:

| File                | Purpose                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml`      | copy of `infra/compose.prod.yaml`                                                                                                                 |
| `.env`              | production settings with fresh secrets (JWT, `ENCRYPTION_KEY`, `RENDERER_SECRET`, `ANALYTICS_SALT`, Postgres, S3 keys, admin password); mode 0600 |
| `caddy/Caddyfile`   | edge proxy (hosts come from `.env`)                                                                                                               |
| `seaweedfs/s3.json` | S3 credentials matching `.env`                                                                                                                    |
| `quadlet/`          | the same stack as Podman Quadlet units                                                                                                            |
| `scripts/backup.sh` | Node-free nightly backup                                                                                                                          |
| `NEXT-STEPS.md`     | these steps with your hostnames                                                                                                                   |

Edit `.env`: set `SMTP_HOST/PORT/USER/PASSWORD` (any relay: SES, Postmark, Mailgun…) and optionally
`ANTHROPIC_API_KEY`/`VERCEL_TOKEN`. Then lint it:

```bash
pnpm atrium setup check --env-file deploy/podman/.env
```

Copy the directory to the server: `rsync -av deploy/podman/ you@server:/opt/atrium/`.

## 4. Images

Either pull images built by CI (`.github/workflows/ci.yml` pushes `ghcr.io/<owner>/atrium-{api,worker,renderer,admin,migrate}`):

```bash
podman login ghcr.io
cd /opt/atrium && podman compose pull
```

or build on the server from a checkout (`ATRIUM_SRC_DIR` in `.env` points at it; needs ≥ 6 GB RAM):

```bash
podman compose build
```

## 5a. Run with compose

```bash
cd /opt/atrium
podman compose up -d        # postgres/redis/s3 → migrate (exits 0) → api/worker → renderer/admin → caddy
podman compose ps
podman compose logs -f api
curl -fsS https://api.example.com/v1/health/ready
```

Restart on reboot: `podman compose` containers use `restart: unless-stopped`; with rootless Podman also
enable `podman-restart.service` for your user (`systemctl --user enable podman-restart`), or use Quadlet.

## 5b. Run with Quadlet (rootless systemd)

```bash
mkdir -p ~/.config/containers/systemd ~/.config/atrium
cp quadlet/* ~/.config/containers/systemd/
cp .env ~/.config/atrium/atrium.env && chmod 600 ~/.config/atrium/atrium.env
cp -r caddy seaweedfs ~/.config/atrium/
systemctl --user daemon-reload
systemctl --user start atrium-caddy.service    # pulls in api, admin, renderer, s3 and their dependencies
systemctl --user start atrium-worker.service
journalctl --user -u atrium-api -f
```

Units: `atrium-{postgres,redis,s3,migrate,api,worker,renderer,admin,caddy}.container`, a network and
named volumes. App containers set `AutoUpdate=registry`, so `podman auto-update` (or the
`podman-auto-update.timer`) pulls new tags you push under the same name.

## 5c. Without containers: systemd + nginx

`atrium setup production --target systemd --domain example.com` writes `systemd/` units
(`atrium-{migrate,api,worker,renderer,admin}.service`, `atrium.target`, `atrium-backup.{service,timer}`),
`nginx/atrium.conf` with your domain, and `NEXT-STEPS.md` (host packages, user, build, certbot). Node 24,
PostgreSQL 17 and Redis 7 run on the host; nginx cannot issue certificates on demand, so for many custom
domains run Caddy in front instead (`caddy/Caddyfile` is included).

## 6. Seed and first login

The runtime images contain no dev tooling, so seed once from a checkout that can reach the database:

```bash
# on the server: publish postgres to localhost temporarily, or tunnel to it
DATABASE_URL=postgresql://atrium:<POSTGRES_PASSWORD>@localhost:5433/atrium pnpm db:seed
```

Sign in at `https://admin.example.com` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then change the
password (`pnpm atrium set-admin-password` from the checkout, or in the admin).

## TLS and custom domains

Caddy issues certificates automatically for the admin/api/media/sites hosts. Tenant subdomains and
customer domains use **on-demand TLS**: before issuing, Caddy calls
`GET http://api:4000/v1/public/domains/check?domain=<host>`; the API answers 200 only for
`{slug}.sites.example.com` of an existing site and custom domains connected to a website, so nobody can make the server
request certificates for arbitrary hosts. Let's Encrypt limits certificates per registered domain per
week; with many tenant subdomains, switch the `*.sites` block to a wildcard certificate via DNS-01
(build Caddy with a `caddy-dns/<provider>` module: `xcaddy build --with github.com/caddy-dns/cloudflare`).
`atrium setup ssl --domain example.com` checks the DNS records.

## Releases and zero-downtime migrations

```bash
sed -i 's/^ATRIUM_IMAGE_TAG=.*/ATRIUM_IMAGE_TAG=1.1.0/' .env
podman compose pull && podman compose up -d      # migrate runs first; containers are recreated
```

Write migrations expand-then-contract (add columns/tables, deploy code that writes both, backfill, remove
old columns in a later release) so the old containers keep working while `migrate` runs. Never edit an
applied migration. `.github/workflows/deploy-containers.yml` (`target: vps`) automates the update over SSH.

## Backups

```bash
# nightly via cron or a systemd timer; copies off-site when BACKUP_S3_URI is set
scripts/backup.sh --env-file .env --with-files --keep 14
```

The script dumps PostgreSQL through the postgres container (`pg_dump --clean --if-exists`, gzip), archives
object storage (`aws s3 sync` against SeaweedFS) and writes `SHA256SUMS`. Restore with
`gunzip -c database.sql.gz | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction`, or use
`atrium backup` / `atrium restore` from a checkout. Keep at least one copy off the server and encrypt it.

## Scaling on one box

- `podman compose up -d --scale worker=3` adds queue consumers (stateless).
- Before scaling the renderer, note that each instance has its own ISR cache and the API revalidates
  `RENDERER_URL` only; keep one renderer or put a shared cache handler in place.
- Move PostgreSQL/Redis/storage to managed services by changing `DATABASE_URL` (`?sslmode=require`),
  `REDIS_URL` (`rediss://`) and `S3_*`, then remove those services from `compose.yaml`.

## Troubleshooting

| Symptom                                       | Fix                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Caddy cannot get certificates                 | DNS must point at the server and 80/443 must be reachable; check `podman compose logs caddy`                                      |
| Custom domain stays on an invalid certificate | the domain must be added to a website in the admin (the ask endpoint returns 404 until then) and its DNS must point at the server |
| `migrate` exits non-zero                      | `podman compose logs migrate`; fix and `podman compose up -d` again (api/worker wait for it)                                      |
| Login loops / cookie not set                  | `COOKIE_DOMAIN` must be the admin host and `ADMIN_URL`/`CORS_ORIGINS` must use https                                              |
| Provider credentials "cannot be decrypted"    | `ENCRYPTION_KEY` changed; restore the old key or re-enter the credentials                                                         |
| Jobs stuck                                    | worker not running, or Redis eviction policy is not `noeviction`                                                                  |
