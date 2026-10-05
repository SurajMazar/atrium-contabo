# Local development with Podman

Atrium's local stack runs its backing services in Podman (Docker works too). The apps themselves run on
the host with hot reload (`atrium start`), or as containers with the `app` compose profile.

| Service  | Image                 | Host port                | Purpose                                                                          |
| -------- | --------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| postgres | `postgres:17-alpine`  | 55432                    | primary database (`atrium` / `atrium` / `atrium`)                                |
| redis    | `redis:7-alpine`      | 56379                    | BullMQ queues (AOF on, `noeviction`), rate limits, cache                         |
| s3       | `chrislusf/seaweedfs` | 59000                    | S3-compatible storage, bucket `atrium-media` (keys in `infra/seaweedfs/s3.json`) |
| s3-init  | `chrislusf/seaweedfs` | —                        | one-shot: creates the bucket, then exits                                         |
| mailpit  | `axllent/mailpit`     | 51025 (SMTP), 58025 (UI) | captures every email the platform sends                                          |

Ports are in the 5xxxx range on purpose so they never collide with another local stack on 5432, 6379,
1025 or 8025. SeaweedFS replaces MinIO because MinIO's public images are no longer pullable from Docker
Hub or quay.io; the app talks plain S3, so any S3 endpoint works.

## 1. Install Podman

**macOS**

```bash
brew install podman podman-compose
podman machine init --cpus 4 --memory 6144 --disk-size 60
podman machine start
podman info --format '{{.Host.RemoteSocket.Path}}'   # sanity check
```

Memory sizing for the Podman VM:

| Workload                                                                 | Minimum |
| ------------------------------------------------------------------------ | ------- |
| Backing services only (`atrium start` runs the apps on the host)         | 2 GiB   |
| Building the api/worker images (`podman build`)                          | 4 GiB   |
| Building the Next.js images (admin, renderer) or `--profile app --build` | 6 GiB   |

An existing machine can be resized: `podman machine stop && podman machine set --memory 6144 && podman machine start`.
A build killed with exit code 137 means the VM ran out of memory. On small machines pass
`--build-arg TURBO_CONCURRENCY=1 --build-arg "PNPM_INSTALL_FLAGS=--network-concurrency=4 --child-concurrency=1"`.

**Linux (Debian/Ubuntu/Fedora)**

```bash
sudo apt install -y podman podman-compose        # or: sudo dnf install -y podman podman-compose
systemctl --user enable --now podman.socket       # optional: Docker-compatible API socket
```

Rootless Podman needs no VM on Linux. `podman compose` delegates to `podman-compose` (or
`docker-compose` if that is what you have); the CLI detects whichever is installed.

## 2. Set up Atrium

```bash
git clone <your fork> atrium && cd atrium
pnpm install
pnpm atrium init
```

`atrium init` checks prerequisites (Node ≥ 22.12, pnpm, git, Podman + compose, Podman machine state and
memory), writes `.env` from `.env.example` with generated secrets, picks free ports when defaults are
busy (and rewrites the URLs that embed them), starts the services, waits for health checks, builds the
workspace packages, applies migrations and seeds the super-admin. It is safe to re-run.

Manual equivalent:

```bash
cp .env.example .env && pnpm atrium setup env   # replaces the change-me secrets
podman compose -f infra/compose.yaml --env-file .env up -d
pnpm build && pnpm db:deploy && pnpm db:seed
pnpm atrium start                                # or: pnpm dev
```

Open http://localhost:3000 and sign in as `SEED_ADMIN_EMAIL` (default `admin@atrium.localhost`) with
`SEED_ADMIN_PASSWORD` (`pnpm atrium config get SEED_ADMIN_PASSWORD --reveal`). Published sites are served
at `http://<slug>.sites.localhost:3001` — browsers resolve `*.localhost` to 127.0.0.1, `curl` needs
`--resolve` or `-H 'Host: <slug>.sites.localhost'`.

## 3. Day-to-day commands

```bash
pnpm atrium status                   # containers, app endpoints, queue depths, migrations
pnpm atrium setup infra status       # just the containers
pnpm atrium logs postgres -f         # container logs
pnpm atrium start --only api,worker  # subset of apps
pnpm atrium start -d && pnpm atrium logs -f && pnpm atrium stop   # background mode
pnpm atrium db console               # psql inside the postgres container
pnpm atrium setup infra down         # stop + remove containers, keep data volumes
```

Volumes `atrium_atrium-pg`, `atrium_atrium-redis` and `atrium_atrium-s3` hold the data.
`atrium setup infra down --volumes` deletes them after a confirmation prompt; `atrium db reset --force`
only resets the database.

## 4. Running the apps as containers

```bash
podman compose -f infra/compose.yaml --env-file .env --profile app up -d --build
```

This builds `infra/containers/*.Containerfile` and runs api (4000), worker, renderer (3001) and admin
(3000) on the compose network, overriding `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT` and `SMTP_HOST` to the
service names. Stop host processes on those ports first. Use `--format docker` when building images
manually with `podman build` so `HEALTHCHECK` instructions are kept.

## 5. Troubleshooting

| Symptom                                                       | Fix                                                                                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot connect to Podman` / `connection refused` on macOS    | `podman machine start`; `atrium doctor` shows the machine state                                                                                                               |
| Port already in use                                           | `atrium doctor` lists owners; `atrium init` picks free ports, or `atrium config set ATRIUM_PG_PORT 55433` (URLs that embed the port must change too — init does that for you) |
| `s3` unhealthy or bucket missing                              | `atrium logs s3`; re-run `podman compose -f infra/compose.yaml --env-file .env up -d s3-init`                                                                                 |
| Uploads fail with `AccessDenied`                              | `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` must match `infra/seaweedfs/s3.json`                                                                                                |
| No emails arrive                                              | they are captured: open http://localhost:58025                                                                                                                                |
| Volume mount permission denied (SELinux, Fedora)              | the compose files use `:Z`; for your own mounts add `:Z`                                                                                                                      |
| Build exits with 137                                          | the Podman VM is out of memory — see the sizing table above                                                                                                                   |
| `no space left on device` during builds                       | `podman system df`; remove old images you built (`podman image rm <id>`); grow the VM disk with `podman machine set --disk-size`                                              |
| `podman compose` prints "Executing external compose provider" | harmless; the CLI sets `PODMAN_COMPOSE_WARNING_LOGS=false`                                                                                                                    |
| Queue jobs never run                                          | the worker is not running (`atrium status`); Redis must use `maxmemory-policy noeviction` (`atrium setup redis`)                                                              |
