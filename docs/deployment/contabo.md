# Contabo VPS (GitHub Actions → GHCR → Podman)

The `SurajMazar/atrium-contabo` repository deploys itself to a Contabo VPS. Every push to `main` runs
[`.github/workflows/deploy-contabo.yml`](../../.github/workflows/deploy-contabo.yml):

| Job | What it does |
| --- | --- |
| **verify** | `pnpm lint`, `pnpm typecheck` |
| **images** | builds `api`, `migrate`, `worker`, `renderer`, `admin` and pushes them to `ghcr.io/surajmazar/atrium-contabo/atrium-*:<commit sha>` (and `:latest`) |
| **deploy** | SSHes into the VPS, syncs `infra/compose.prod.yaml`, pulls the new tag, runs `compose up -d` (migrations first), waits for `/v1/health` and rolls back to the previous tag if the API does not come up |

Only the application runs on the VPS from this pipeline. PostgreSQL, Redis, object storage (R2/S3 or the
local `api-storage` volume), SMTP and the reverse proxy (nginx) are your own services, configured in the
server's `.env`.

The workflow only runs in `atrium-contabo`. In the original `SurajMazar/atrium` repository every job is
skipped, and the shared workflows (`ci.yml`, `security.yml`, `deploy-vercel.yml`) skip themselves in
`atrium-contabo`, so each repository runs only its own pipelines. Nothing runs for pull requests, tags or
other branches.

## Git: one push, both repositories

`origin` fetches from `atrium-contabo` and pushes to both repositories:

```bash
git remote set-url origin git@github.com:SurajMazar/atrium-contabo.git
git remote set-url --add --push origin git@github.com:SurajMazar/atrium-contabo.git
git remote set-url --add --push origin git@github.com:SurajMazar/atrium.git
git remote add original git@github.com:SurajMazar/atrium.git   # fetch-only view of the old repo
git remote -v
```

`git push` then updates both `main` branches; only `atrium-contabo` deploys.

## One-time server setup

The VPS (Ubuntu 24.04, `169.58.157.28`) runs Docker Engine with the compose plugin, plus nginx and certbot
on the host. Docker is used instead of Podman because Ubuntu's podman-compose does not wait for the
`migrate` service to finish before starting the API. The pipeline works with either.

```bash
# as root on the VPS
apt-get install -y ca-certificates curl nginx certbot python3-certbot-nginx python3-certbot-dns-cloudflare
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
install -d -m 750 /opt/atrium          # DEPLOY_DIR
```

The `ATRIUM_ENV` secret holds the production configuration, and every deploy writes it to `/opt/atrium/.env` (mode 600). To change a setting (database, Redis, storage, SMTP, secrets), edit the secret and re-run the workflow. When
you move an existing installation, paste its `.env`: `ENCRYPTION_KEY`, the `JWT_*` secrets and
`RENDERER_SECRET` must stay the same, or stored provider credentials can't be decrypted and everyone is
signed out. `DATABASE_URL`, `MIGRATE_DATABASE_URL` and `REDIS_URL` must be reachable from the VPS.

The pipeline writes `compose.yaml` and sets `ATRIUM_IMAGE_REGISTRY` and `ATRIUM_IMAGE_TAG` in `.env`;
everything else in `.env` is yours. It keeps the previous files as `.env.bak` and `compose.yaml.bak`.
The containers listen on `127.0.0.1` only (admin `:3000`, renderer `:3001`, API `:4000`), so nginx
proxies to them.

## Database and Redis (on the VPS host)

PostgreSQL 18 (from the official apt.postgresql.org repository) and Redis 7 run on the host as systemd
services. They listen on `127.0.0.1` and the Docker bridge (`172.17.0.1`) only, so they are not reachable
from the internet; containers reach them as `host.docker.internal`. Both start after Docker so the bridge
address exists.

- **Roles**: `atrium` owns the database and runs migrations (`MIGRATE_DATABASE_URL`); `atrium_app`
  can only read and write rows (`DATABASE_URL`). `atrium_app` has `statement_timeout` 5 min,
  `idle_in_transaction_session_timeout` 2 min and `lock_timeout` 30 s.
- **Tuning** (`/etc/postgresql/18/main/conf.d/90-atrium.conf`, 8 GB shared with the app):
  - memory: `shared_buffers` 1 GB, `effective_cache_size` 3 GB, `work_mem` 8 MB,
    `max_connections` 60;
  - autovacuum runs early (scale factors 0.05 / 0.02, naptime 30 s, cost limit 1000) so dead rows
    (MVCC bloat) are cleaned up continuously;
  - idle-in-transaction sessions are ended after 5 min so they cannot block vacuum;
  - TCP keepalives, `pg_stat_statements` and data checksums are on.
- **Redis** (`/etc/redis/atrium.conf`): password required, `maxmemory 512mb` with `noeviction`
  (BullMQ must never drop jobs), AOF `everysec`, `FLUSHALL`/`FLUSHDB`/`DEBUG` disabled.
- **Host**: 4 GB swap (`vm.swappiness=10`), `vm.overcommit_memory=1`, and ufw enabled. ufw allows
  SSH, 80 and 443 from anywhere; 5432 and 6379 only from 172.16.0.0/12.
- **Backups**: `/etc/cron.daily/atrium-db-backup` writes `pg_dump -Fc` to `/var/backups/atrium` and keeps
  14 days. Copy them off the server too.

- **Old images**: `/etc/cron.d/atrium-image-cleanup` runs
  [`infra/scripts/image-cleanup.sh`](../../infra/scripts/image-cleanup.sh) (installed as
  `/usr/local/sbin/atrium-image-cleanup`) daily at 03:30. It keeps the 3 newest images per service so
  rollbacks need no pull, never removes an image a container uses, and prunes dangling layers. It logs to
  `/var/log/atrium-image-cleanup.log`, rotated monthly.

Shell access on the server: `sudo -u postgres psql -d atrium`. From your machine, open a tunnel with
`ssh -L 5433:127.0.0.1:5432 root@<VPS_IP>` and connect to `localhost:5433`.

## Deploy key

Use a key that exists only for deployments:

```bash
ssh-keygen -t ed25519 -N '' -C 'atrium-contabo deploy' -f ~/.ssh/atrium_contabo_deploy
ssh-copy-id -i ~/.ssh/atrium_contabo_deploy.pub root@<VPS_IP>
ssh-keyscan -t ed25519 <VPS_IP>       # → DEPLOY_SSH_KNOWN_HOSTS
```

Compare the scanned key's fingerprint with the server's own (`ssh-keygen -lf
/etc/ssh/ssh_host_ed25519_key.pub` in the Contabo VNC console) before saving it.

## GitHub settings (atrium-contabo)

Settings → Environments → **contabo**:

| Type | Name | Value |
| --- | --- | --- |
| secret | `ATRIUM_ENV` | the full production `.env` (written to `/opt/atrium/.env` on every deploy) |
| secret | `DEPLOY_SSH_KEY` | contents of `~/.ssh/atrium_contabo_deploy` (private key) |
| secret | `DEPLOY_SSH_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <VPS_IP>` |
| variable | `DEPLOY_HOST` | VPS IP or host name |
| variable | `DEPLOY_USER` | SSH user (default `root`) |
| variable | `DEPLOY_PORT` | SSH port (default `22`) |
| variable | `DEPLOY_DIR` | `/opt/atrium` |

No registry credentials are stored: the deploy job logs the server in to GHCR with the run's
short-lived `GITHUB_TOKEN`, pulls, and logs out again.

## Redeploy or roll back

Actions → **Contabo · build & deploy** → _Run workflow_:

- empty tag: build and deploy the selected branch's latest commit;
- a tag (full commit SHA of an earlier build): skip the build and deploy that tag.

Migrations only move forward, so rolling back runs older application code against the newer, additively
migrated schema.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Host key verification failed` | `DEPLOY_SSH_KNOWN_HOSTS` doesn't match the server; rescan and verify the fingerprint |
| `Permission denied (publickey)` | the public key is not in `~/.ssh/authorized_keys` of `DEPLOY_USER` |
| `.env is missing on the server` | create `$DEPLOY_DIR/.env` (see above) |
| `denied` while pulling from ghcr.io | the packages must stay linked to `atrium-contabo` (Package settings → Manage Actions access) |
| health check fails, rolled back | the job prints the `migrate`/`api` logs; on the server: `cd /opt/atrium && docker compose logs api` |
