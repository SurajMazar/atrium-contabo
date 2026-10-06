# `atrium` CLI

`atrium` installs, configures, runs, migrates, backs up and deploys Atrium. It is modelled on Frappe's
`bench`: one tool for the whole lifecycle of an installation, safe to re-run, with `--help` and examples on
every command.

```bash
pnpm atrium <command> [options]          # from the repository (root script → packages/cli/bin/atrium.mjs)
pnpm atrium --help                       # all commands
pnpm atrium setup production --help      # help + examples for one command
```

The launcher runs `packages/cli/dist/index.js` when built (`pnpm --filter @atrium/cli build`) and falls
back to the TypeScript sources through `tsx` otherwise, so it works on a fresh checkout.

## Global options

| Option            | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `--root <dir>`    | checkout to operate on (default: nearest parent of the cwd containing `pnpm-workspace.yaml`; or `ATRIUM_ROOT`) |
| `-y, --yes`       | accept defaults, never prompt (also implied by `CI=true` or a non-TTY)                                         |
| `-v, --verbose`   | print every command the CLI runs (`ATRIUM_DEBUG=1` too)                                                        |
| `--json`          | machine-readable output (`status`, `doctor`, `config list`, `list-sites`, `version`, `backup --list`…)         |
| `--api <url>`     | API base URL (default `ATRIUM_API_URL`, `.atrium/config.json`, or `API_URL` from `.env`)                       |
| `--token <token>` | API access token instead of the stored session (`ATRIUM_TOKEN`)                                                |
| `--site <slug>`   | site for site commands (default: `atrium use`)                                                                 |

Exit codes: 0 success, 1 failure, 2 "not found" (`config get`), 130 cancelled. Errors print a one-line
reason and a hint; `--verbose` adds the stack.

## bench → atrium

| bench                              | atrium                                                                            | Notes                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bench init`                       | `atrium init [dir]`                                                               | prerequisites, `.env` with generated secrets, free ports, install, Podman services, migrations, seed |
| `bench start` (Procfile/honcho)    | `atrium start`                                                                    | built-in process manager with prefixed logs; `atrium procfile` prints the Procfile equivalent        |
| `bench new-site`                   | `atrium new-site <name>`                                                          | via the API; `--template`, `--ai "<brief>"`, `--domain`                                              |
| `bench use` / `currentsite.txt`    | `atrium use <site>`                                                               | `.atrium/config.json`                                                                                |
| `bench --site X migrate`           | `atrium migrate`                                                                  | one database for all sites (multi-tenant)                                                            |
| `bench --site X console`           | `atrium console`                                                                  | Node REPL with Prisma and platform packages                                                          |
| `bench mariadb`                    | `atrium db console`                                                               | psql (inside the postgres container when local)                                                      |
| `bench backup [--with-files]`      | `atrium backup [--with-files]`                                                    | pg_dump + objects, manifest with checksums, `--keep N`                                               |
| `bench restore`                    | `atrium restore <backup> --force`                                                 |                                                                                                      |
| `bench drop-site`                  | `atrium drop-site <site> --force`                                                 | soft delete                                                                                          |
| `bench set-config` / `get-config`  | `atrium config set` / `get` / `list` / `unset`                                    | edits `.env` in place, masks secrets                                                                 |
| `bench setup production`           | `atrium setup production --target <t>`                                            | 12 targets (below)                                                                                   |
| `bench setup nginx` / `supervisor` | `--target systemd` (nginx + units) or `--target podman` (Caddy + compose/Quadlet) |                                                                                                      |
| `bench setup redis`                | `atrium setup redis`                                                              | checks/fixes `noeviction` + AOF, writes `redis.conf`                                                 |
| `bench setup procfile`             | `atrium setup procfile`                                                           |                                                                                                      |
| `bench doctor`                     | `atrium doctor`                                                                   | toolchain, secrets, connectivity, migrations, ports, disk                                            |
| `bench update`                     | `atrium update`                                                                   | backup → git pull → install → build → migrate                                                        |
| `bench build`                      | `atrium build`                                                                    | turbo build                                                                                          |
| `bench version`                    | `atrium version`                                                                  |                                                                                                      |
| `bench add-system-manager`         | `atrium create-user --super-admin`                                                |                                                                                                      |
| `bench set-admin-password`         | `atrium set-admin-password`                                                       | revokes sessions                                                                                     |
| `bench new-app` / `get-app`        | `atrium new-plugin`, `atrium new-component`, `atrium new-provider`                | scaffolds                                                                                            |

## Setup

### `atrium init [dir]`

Bootstraps a development environment end to end; safe to re-run.

1. Checks Node ≥ 22.12, pnpm ≥ 10, git, Podman/Docker + compose (prefers `podman compose`, then
   `podman-compose`, then `docker compose`), the Podman machine on macOS and its memory.
2. Uses the checkout in `[dir]` (or clones `--repo <url>` into it).
3. Creates or merges `.env` from `.env.example`, generating `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
   `ENCRYPTION_KEY` (32 bytes, base64), `RENDERER_SECRET`, `ANALYTICS_SALT`; asks for the super-admin email
   and optionally generates its password and stores an Anthropic key.
4. Checks every port; busy ones are moved to the next free port and URLs that embed them
   (`DATABASE_URL`, `API_URL`, `CORS_ORIGINS`, `PLATFORM_SITES_DOMAIN`…) are rewritten. Ports already used
   by Atrium's own containers are kept.
5. `pnpm install`, `podman compose up -d`, waits for health checks, builds workspace packages,
   `prisma migrate deploy` (or `migrate dev` with `--dev-migrate`), seeds (`--demo` for demo content).
6. Prints URLs and where the admin credentials are.

Flags: `--repo`, `--branch`, `--yes`, `--demo`, `--no-install`, `--no-infra`, `--no-build`,
`--no-migrate`, `--no-seed`, `--dev-migrate`, `--no-check-ports`, `--admin-email`,
`--generate-admin-password`, `--anthropic-key`.

### `atrium setup …`

| Command                                                                                                               | Purpose                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup env [--regenerate-secrets] [--no-generate] [--dry-run]`                                                        | merge `.env.example` into `.env` without touching existing values; adds new keys, generates missing/placeholder secrets, keeps local-only keys, backs up the previous file (`.env.bak-<time>`); warns when `ENCRYPTION_KEY`/JWT secrets change |
| `setup infra [up\|down\|stop\|restart\|status\|pull] [--app] [--build] [--no-wait] [--volumes]`                       | compose wrapper for `infra/compose.yaml`; `--app` adds the app containers; `down --volumes` deletes data after confirmation                                                                                                                    |
| `setup production --target <t> [--domain] [--email] [--registry] [--tag] [--namespace] [--app-dir] [--out] [--force]` | deployment artifacts (below)                                                                                                                                                                                                                   |
| `setup check [--env-file a,b]`                                                                                        | production readiness lint: https URLs, strong secrets, cookie scope, CORS, `COOKIE_SECURE`, storage, SMTP, placeholders                                                                                                                        |
| `setup ssl [--domain]`                                                                                                | TLS guidance per topology and DNS checks for admin/api/sites/wildcard                                                                                                                                                                          |
| `setup redis [--apply] [--out redis.conf]`                                                                            | verify `maxmemory-policy noeviction` + AOF; apply at runtime; write a production config                                                                                                                                                        |
| `setup procfile [--prod]`                                                                                             | write `Procfile` (honcho/overmind/foreman)                                                                                                                                                                                                     |

### `atrium setup production`

| Target    | Output in `deploy/<target>/`                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `podman`  | `compose.yaml` (Caddy + PostgreSQL + Redis + SeaweedFS + migrate + apps), `caddy/Caddyfile`, `seaweedfs/s3.json`, `quadlet/`, `scripts/backup.sh`, `.env` |
| `docker`  | as podman without Quadlet                                                                                                                                 |
| `systemd` | `systemd/*.service                                                                                                                                        | timer | target`, `nginx/atrium.conf`(your domain),`caddy/Caddyfile`, `scripts/backup.sh`, `.env` |
| `k8s`     | Kustomize overlay on `infra/k8s/base`: `kustomization.yaml`, `ingress-patch.yaml`, `cluster-issuers.yaml`, `config.env`, `secrets.env`                    |
| `cpanel`  | `.htaccess`, `build-static.sh`, `app.cjs` (Passenger), `renderer.env`, `.env`                                                                             |
| `aws`     | `ecs/task-*.json`, `iam/*.json`, `deploy.sh`, `.env`                                                                                                      |
| `azure`   | `deploy.sh`, `.env`                                                                                                                                       |
| `gcp`     | `deploy.sh`, `worker-gke.yaml`, `.env`                                                                                                                    |
| `vercel`  | `admin/vercel.json`, `renderer/vercel.json`, `env.admin`, `env.renderer`, `.env`                                                                          |
| `fly`     | `fly.{api,worker,renderer,admin}.toml`, `.env`                                                                                                            |
| `railway` | `railway.json`, `.env`                                                                                                                                    |
| `render`  | `render.yaml`, `.env`                                                                                                                                     |

Every target also writes `NEXT-STEPS.md`. Env files are mode 0600 and contain generated secrets;
`deploy/` is git-ignored. Existing files are kept unless `--force`. Templates live in
`packages/cli/templates/production/<target>/` (`{{var}}` placeholders; `.tpl` files are rendered).

## Running

| Command                                                                                        | Purpose                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start [--prod] [--only api,worker,renderer,admin] [-d] [--no-infra] [--turbo] [--keep-going]` | ensure infra is healthy and packages are built, then run the apps. Dev runs watchers; `--prod` runs `node dist/main.js` / `next start` (after `atrium build`). Foreground mode prefixes each line and stops everything on Ctrl+C or when one process exits; `-d` runs in the background with logs in `.atrium/logs/<svc>.log` and pids in `.atrium/run/` |
| `stop [services…] [--infra]`                                                                   | stop background apps; `--infra` also stops the containers (data kept)                                                                                                                                                                                                                                                                                    |
| `status`                                                                                       | containers (state, health, ports), app endpoints + `/v1/health/ready`, BullMQ queue counts (prefix `QUEUE_PREFIX`, default `atrium`), migrations, current site                                                                                                                                                                                           |
| `logs [service] [-f] [-n 100]`                                                                 | container logs (`postgres`, `redis`, `s3`, `mailpit`, app containers) or background app logs; no service = all app logs                                                                                                                                                                                                                                  |
| `procfile [--prod]`                                                                            | print the Procfile equivalent of `start`                                                                                                                                                                                                                                                                                                                 |

## Database

| Command                                    | Purpose                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate`                                  | `prisma migrate deploy` with before/after status                                                                                                        |
| `migrate --dev [--name x] [--create-only]` | `prisma migrate dev` after editing `schema.prisma` (refused with `NODE_ENV=production`)                                                                 |
| `migrate --status` / `db status`           | applied/pending/failed migrations                                                                                                                       |
| `seed [--demo]`                            | `pnpm db:seed` (plans, permissions, super-admin; `--demo` adds demo content via `seed:demo`, local only)                                                                |
| `db reset --force [--no-seed]`             | drop, re-migrate, re-seed; asks you to type the database name; refused in production                                                                    |
| `db console [-c "sql"]`                    | psql in the postgres container (or local psql)                                                                                                          |
| `db studio`                                | Prisma Studio                                                                                                                                           |
| `console`                                  | Node REPL with `prisma`/`db`, `schema`, `registry`, `providers`, `serverKit`, `builder`, `env`; top-level `await`; history in `.atrium/console_history` |

## Sites and accounts (via the API)

These commands use the REST API with a stored session. When the API is down, `list-sites`, `use` and
`drop-site` fall back to direct database access and say so.

| Command                                                                                                      | Purpose                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `login [--email] [--password-stdin]`                                                                         | password login (+ MFA prompt); stores access + refresh token per API URL in `~/.config/atrium/credentials.json` (0600; `XDG_CONFIG_HOME`/`ATRIUM_CONFIG_HOME` respected); refreshes automatically |
| `logout` / `whoami`                                                                                          | revoke + forget the session / show user and organizations                                                                                                                                         |
| `new-site <name> [--org] [--slug] [--template key] [--ai "brief"] [--business-type] [--domain host] [--use]` | create blank, from a blueprint, or AI-generated (polls the generation); `--domain` prints the DNS records                                                                                         |
| `list-sites [--org] [--db]`                                                                                  | table of sites (`--db` reads the database directly — admin view)                                                                                                                                  |
| `use [site] [--org] [--clear]`                                                                               | default site/org for later commands                                                                                                                                                               |
| `drop-site <site> --force`                                                                                   | soft delete                                                                                                                                                                                       |
| `publish [site] [-m msg]`                                                                                    | validate + publish a version; prints blocking issues on 422                                                                                                                                       |
| `export-site [site] [--format json\|zip\|nextjs] [-o file]`                                                  | download the export                                                                                                                                                                               |
| `import-site <file> [--org]`                                                                                 | import a `site.json` or export zip                                                                                                                                                                |
| `templates [--kind SITE]`                                                                                    | list template keys for `new-site --template`                                                                                                                                                      |

## Users and organizations (direct database, admin operations)

| Command                                                                                 | Purpose                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `create-user --email --name [--password-stdin] [--super-admin] [--org slug --role key]` | create a user (argon2id hash), optionally add to an organization                                              |
| `set-admin-password [--email] [--password-stdin] [--keep-sessions]`                     | reset a password (default `SEED_ADMIN_EMAIL`) and revoke sessions                                             |
| `new-org <name> --owner <email> [--slug] [--plan] [--db]`                               | create an organization with the default roles and an owner (uses the API when you are logged in as the owner) |

Passwords are prompted (hidden) or read from stdin; `--password` works but warns about shell history.

## Backups

| Command                                                               | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backup [--with-files] [--out backups] [--keep N] [--label x]`        | `backups/<YYYYmmdd-HHMMSS>/database.sql.gz` (pg_dump `--clean --if-exists --no-owner`, via the postgres container, local `pg_dump`, or an ephemeral `postgres:17` container), `files.tar.gz` (S3 bucket via the AWS SDK, or the local storage dir), `manifest.json` (versions, git commit, applied migrations, sha256 + sizes); rotation keeps the newest N |
| `backup --list`                                                       | list backups                                                                                                                                                                                                                                                                                                                                                |
| `restore <name\|path\|latest> [--with-files] --force [--skip-verify]` | verifies checksums, refuses backups with migrations unknown to the checkout, restores in one transaction, uploads files back                                                                                                                                                                                                                                |

`infra/scripts/backup.sh` produces the same layout without Node.js for cron/systemd timers.

## Configuration

| Command                                                     | Purpose                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `config list [--reveal] [--filter text]`                    | all `.env` settings; secrets masked (`••••••••abcd`), URL passwords hidden, weak secrets flagged                                |
| `config get <key> [--reveal]`                               | one value (exit 2 if unset)                                                                                                     |
| `config set <key> [value] [--stdin] [--generate] [--force]` | set in place (comments/order preserved, file stays 0600); validates ports, URLs, `ENCRYPTION_KEY`, `NODE_ENV`, `STORAGE_DRIVER` |
| `config unset <key>`                                        | remove                                                                                                                          |

## Maintenance

| Command                                                                                 | Purpose                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doctor [--quick] [--json]`                                                             | prerequisites (incl. Podman machine memory), `.env` completeness, secret strength, PostgreSQL/Redis/S3/SMTP connectivity, pending/failed migrations, ports, disk, built packages, optional AI/Vercel keys; production lint when `NODE_ENV=production`; exit 1 on failures |
| `update [--no-pull] [--no-backup] [--no-install] [--no-migrate] [--no-build] [--reset]` | pre-update backup → `git pull --ff-only` (refuses a dirty tree) → `pnpm install --frozen-lockfile` → build packages → migrate → build apps                                                                                                                                |
| `build [--packages] [--filter pkg…]`                                                    | turbo build                                                                                                                                                                                                                                                               |
| `version [--json]`                                                                      | CLI, git, node, pnpm, container engine, migrations, package versions                                                                                                                                                                                                      |

## Extending

| Command                                                                              | Creates                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new-component <name> [--level section\|block\|element] [--category …] [--plugin p]` | registry definition (`packages/component-registry/src/components/<type>.ts`: zod props, defaults, controls, variants, AI hints), a test, and a React renderer (`packages/renderer-core/src/components/<type>.tsx`); with `--plugin` everything goes to `plugins/<p>/src/components/` and the type is prefixed `<p>-` |
| `new-provider <email\|sms\|storage\|ai\|deployment\|captcha> <id> [--plugin p]`      | a `defineDriver` with config/secret schemas, an implementation of the kind's interface with TODOs, and a test                                                                                                                                                                                                        |
| `new-plugin <name>`                                                                  | `plugins/<name>/` package `@atrium-plugin/<name>` (`definePlugin`, `registerPlugin`, tsup, vitest) and adds `plugins/*` to `pnpm-workspace.yaml`                                                                                                                                                                     |

See [CONTRIBUTING.md](CONTRIBUTING.md#plugins) and [COMPONENTS.md](COMPONENTS.md).

## Environment variables read by the CLI

`ATRIUM_ROOT`, `ATRIUM_API_URL`, `ATRIUM_TOKEN`, `ATRIUM_CONFIG_HOME`, `ATRIUM_CONTAINER_ENGINE`
(`podman`|`docker`), `ATRIUM_DEBUG`, `ATRIUM_CLI_FROM_SOURCE` (force the tsx path), plus everything in
`.env` (child processes see `.env` overlaid by the real environment).
