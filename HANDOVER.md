# Atrium handover (state on 2026-10-08)

Everything needed to continue this project in a new chat or on another device. **No secrets are in this
file.** It says where each secret lives, never its value.

> **Starting a new chat?** Paste this:
> "Read `HANDOVER.md` in the repo root, then `docs/deployment/contabo.md`. Continue from there. Follow the
> rules in section 10."

---

## 1. What this is

**Atrium** is a multi-tenant website builder (pnpm + Turborepo monorepo):

| Part | Path | What it is |
| --- | --- | --- |
| API | `apps/api` | NestJS + Prisma (Postgres) + BullMQ (Redis). Port 4000, prefix `/v1` |
| Admin | `apps/admin` | Next.js dashboard (editor, websites, organizations, super-admin). Port 3000 |
| Renderer | `apps/renderer` | Next.js app that serves every published site by hostname. Port 3001 |
| Worker | `apps/worker` | Background jobs (media processing, analytics rollups, form rules…) |
| Packages | `packages/*` | `db` (Prisma schema + migrations), `schema`, `sdk`, `ui`, `renderer-core`, `providers` (storage/email/captcha drivers), `server-kit`, `cli`, `exporter`… |

Docs live in `docs/`. The most relevant are `docs/deployment/contabo.md` (production),
`docs/deployment/cloudflare.md`, `docs/STORAGE.md`, `docs/API.md`, `docs/security/`. A beginner-friendly
deck on how custom domains work end to end is in `docs/presentations/custom-domains/` (open
`index.html`). It is also a claude.ai artifact: https://claude.ai/artifact/83WVkG19HkuK7KfgjNa5A6

---

## 2. Git

- **`origin`** fetches from `SurajMazar/atrium-contabo` and **pushes to both** `atrium-contabo` and
  `atrium` (the original repo). A plain `git push` updates both. Both repos are private.
- **`original`** is a fetch-only view of `SurajMazar/atrium`.
- **Deploys:** only a push to `main` of `atrium-contabo` deploys production. The original repo runs no
  Contabo jobs.
- **Docs-only commits** can carry `[skip ci]` in the message to avoid a pointless image build and deploy.

Setting up a new machine:

```bash
git clone git@github.com:SurajMazar/atrium-contabo.git website-builder && cd website-builder
git remote set-url --add --push origin git@github.com:SurajMazar/atrium-contabo.git
git remote set-url --add --push origin git@github.com:SurajMazar/atrium.git
git remote add original git@github.com:SurajMazar/atrium.git
pnpm install
```

---

## 3. Production at a glance

| Address | Goes to | Notes |
| --- | --- | --- |
| `https://admin.sites.surajthapa247.com.np` | admin (3000) | Platform dashboard |
| `https://api.sites.surajthapa247.com.np` | API (4000) | `/v1/health` |
| `https://<slug>.sites.surajthapa247.com.np` | renderer (3001) | Platform address of every site. Today: `leela-garden`, `vilasa-by-leela` |
| `https://leelagarden.com.np` (+ `www` → 301 to the root) | renderer | Client's custom domain, verified Active in Atrium |
| `https://admin.leelagarden.com.np` | admin | Leela Garden's branded sign-in (organization admin domain) |
| `https://media.sites.surajthapa247.com.np` | Cloudflare R2 bucket `leelagarden` | Leela Garden's media (organization storage provider) |

**VPS (Contabo):** `169.58.157.28`, Ubuntu 24.04, 4 vCPU, 7.8 GB RAM, 96 GB disk (18 GB used), 4 GB
swap, about $7/month.

---

## 4. The server

**SSH:** `ssh -i ~/.ssh/atrium_contabo_deploy -o IdentitiesOnly=yes root@169.58.157.28`

The key lives on the original Mac only. On a new device, generate a key and append its public key to
`/root/.ssh/authorized_keys` from a machine that already has access. The user does credential steps
themselves.

| What | Where |
| --- | --- |
| App directory | `/opt/atrium` (`compose.yaml` from `infra/compose.prod.yaml`, `.env` written by every deploy, `*.bak` copies) |
| Containers | `atrium-{api,admin,renderer,worker}-1`. Images: `ghcr.io/surajmazar/atrium-contabo/atrium-*:<sha>`. They listen on 127.0.0.1 only. `migrate` runs once per deploy and exits |
| Postgres 18 (host, PGDG) | Database `atrium`. Roles: `atrium` (owner, migrations) and `atrium_app` (app, DML only). Tuning in `/etc/postgresql/18/main/conf.d/90-atrium.conf` (aggressive autovacuum, `idle_in_transaction_session_timeout=5min`, `max_connections=60`, `shared_buffers=1GB`, `pg_stat_statements`). Listens on localhost and `172.17.0.1`; `pg_hba` allows `172.16.0.0/12` with SCRAM |
| Redis 7 (host) | `/etc/redis/atrium.conf`: password, 512 MB, `noeviction`, AOF |
| Containers → host | `host.docker.internal` (compose `extra_hosts: host-gateway`) |
| Firewall (ufw) | Open: OpenSSH, 80, 443. 5432 and 6379 only from `172.16.0.0/12` (Docker) |
| Backups | `/etc/cron.daily/atrium-db-backup` runs `pg_dump -Fc` to `/var/backups/atrium/atrium-YYYY-MM-DD.dump` and keeps 14 days. **Backups stay on the same disk; nothing is off-site yet** |
| Image cleanup | `/etc/cron.d/atrium-image-cleanup` runs at 03:30 (`/usr/local/sbin/atrium-image-cleanup`, `KEEP=3` per service, never removes in-use images). Log: `/var/log/atrium-image-cleanup.log` |
| DNS resolver | Netplan nameservers set to `1.1.1.1` and `9.9.9.9`; cloud-init network config is disabled. Backup: `/root/50-cloud-init.yaml.bak`. This replaced Contabo's resolver, which had stale answers |
| nginx | Main site file `/etc/nginx/sites-available/atrium.conf` (upstreams `atrium_admin/api/renderer`). Custom domains in `/etc/nginx/atrium-domains/{leelagarden,leelagarden-admin}.conf`. TLS 1.2/1.3 set in `nginx.conf` |
| Certificates (certbot, webroot `/var/www/letsencrypt`) | `atrium`: sites, admin.sites, api.sites, leela-garden.sites, vilasa-by-leela.sites (expires 2027-01-05; auto-renew). `leelagarden`: root and www. `leelagarden-admin`: admin.leelagarden.com.np. Renewal hook `renewal-hooks/deploy/reload-nginx.sh` |

**Important:** nginx currently sends `leelagarden.com.np` to the renderer with
`Host: leela-garden.sites.surajthapa247.com.np` (a Host override). Switching that to pass-through was
offered, and the user said "not now".

---

## 5. CI/CD and secrets

**Pipeline:** `.github/workflows/deploy-contabo.yml` runs on a push to `main` (or a manual run with an
optional `tag`). It only runs in `atrium-contabo`.

1. **`verify`:** lint and typecheck. **Tests are skipped in CI** at the user's request ("skip e2e for
   now"). Run them locally before pushing.
2. **`images`:** builds a matrix of api, migrate, worker, renderer and admin, then pushes to GHCR. The
   build argument `ATRIUM_API_INTERNAL_URL=http://api:4000`.
3. **`deploy`:** environment `contabo`, which allows branch `main` only. The steps:
   - writes `/opt/atrium/.env` from the **`ATRIUM_ENV`** secret;
   - syncs the compose file;
   - logs in to GHCR;
   - runs `compose pull`, then `up -d migrate api worker renderer admin`;
   - health-checks `127.0.0.1:4000/v1/health`;
   - **rolls back** to the previous tag if the check fails;
   - prunes old images.

**GitHub environment `contabo`:**
- **Secrets:** `DEPLOY_SSH_KEY`, `DEPLOY_SSH_KNOWN_HOSTS`, `ATRIUM_ENV`.
- **Variables:** `DEPLOY_HOST=169.58.157.28`, `DEPLOY_DIR=/opt/atrium`.

**The production env:**
- **Source of truth:** `~/.atrium-contabo.env` on the original Mac (mode 600). It is not in the repo.
- **Every deploy overwrites the server's `.env`** from `ATRIUM_ENV`, so a change made only on the server
  is lost at the next deploy.
- **To change it:**
  1. Edit the local file.
  2. Run `pbcopy < ~/.atrium-contabo.env`.
  3. On GitHub, go to atrium-contabo → Settings → Environments → contabo → `ATRIUM_ENV` → paste → Update
     secret.
  4. Re-run the workflow (Actions → "Contabo · build & deploy" → Run workflow).
- **Non-secret values worth knowing:**
  - `STORAGE_DRIVER=local`: platform storage. Leela Garden uses its own R2 provider.
  - `SMTP_HOST` is empty, so **no email is sent**.
  - AI keys are empty.
  - `SUPER_ADMIN_REQUIRE_MFA=true`.
  - `PLATFORM_CNAME_TARGET=sites.surajthapa247.com.np`.
  - `SEED_ADMIN_EMAIL=admin@sites.surajthapa247.com.np`.
  - `CORS_ORIGINS` includes `https://admin.leelagarden.com.np`. Organization admin domains are also
    trusted automatically.
  - `OPEN_SIGNUP` is unset, which means off in production: sign-up is by invitation only.

---

## 6. DNS and domains

- **Cloudflare zones** (user's account): `surajthapa247.com.np` and `leelagarden.com.np` (nameservers
  `eugene` / `kara.ns.cloudflare.com`, set at the .np registrar).
- **Records must stay grey, "DNS only".** Never proxied: nginx terminates TLS and certbot needs port 80.
- **Platform records:** `sites`, `admin.sites`, `api.sites` and each `<slug>.sites` → A `169.58.157.28`.
  `media.sites` is R2's custom domain.
- **leelagarden.com.np:**
  - A `@` → `169.58.157.28`;
  - `www`;
  - TXT `_atrium-verify.leelagarden.com.np`, the Atrium ownership token. Verified, Active, Primary;
  - A `admin` → `169.58.157.28`.
- **Stale zone:** an old Cloudflare zone for `leelagarden.com.np` in **another Cloudflare account**
  (nameservers elliott/yolanda) still exists. Resolvers with stale data were sent there. The other
  account's owner should delete it.
- **How Atrium verifies a domain** (`apps/api/src/modules/domains/domains.service.ts`): the TXT token
  must match, and the domain must point here. "Pointing" means a CNAME to `PLATFORM_CNAME_TARGET`, or an
  A record that is one of its IPs. Roots under `.com.np`, `.co.uk` and similar are treated as roots.
- **The dashboard's "SSL Active" is only a label.** Atrium assumes an edge server (Caddy) issues
  certificates on demand. On this VPS, **each new custom domain needs an nginx block and a certbot
  certificate added by hand** (runbook below).

---

## 7. Tenants (production data)

| Organization | Notes |
| --- | --- |
| **Leela garden** | Sites `leela-garden` (website id `cmuy3w74t002b07qs0outh8tg`, custom domain leelagarden.com.np) and `vilasa-by-leela`. Storage: R2 (`leelagarden` bucket, public `media.sites…`). reCAPTCHA v3 on the contact form; allowed hostnames in Atrium include `*.sites.surajthapa247.com.np`. Admin domain `admin.leelagarden.com.np`. **Analytics: off** (default since 2afc285) |
| **suraj** | Analytics off |

**Production data is real. Never wipe it.** The one-time Postgres wipe that happened during the
Postgres 18 switch was approved once only.

---

## 8. Recent work (newest first)

| Commit | What |
| --- | --- |
| `2afc285` | Super admins can **delete an organization**, only once it's suspended, by typing its slug. It removes everything it owns; members keep their accounts; files are cleaned up afterwards. **Analytics per organization**, off until a super admin turns it on (`organizations.analytics_enabled`). **Suspension now really takes sites offline**, which it didn't before |
| `009d4b7` | **Invitation-only sign-up** in production (`OPEN_SIGNUP`); invite links create already-verified accounts |
| `adfd0d0` | **Organization admin domains:** sign-in branded by hostname, and the domain is trusted for sign-in automatically |
| `1af7b6f` | Captcha keys and hostnames are trimmed (a pasted trailing space had broken reCAPTCHA) |
| `2f39223` | Domain verification: `.com.np`-style roots, and A records at the edge count as pointing |
| `1517ae7` | turbo passes build-time env to `next build` (fixed the admin proxy that was baked to localhost, causing 500s) |
| `d9b9324` … `067b0cc` | Contabo CI/CD, host Postgres/Redis, image cleanup, docs |
| `7432c24` | Cloudflare **R2** storage driver |

---

## 9. Runbooks

**Deploy:** push to `main`, or Actions → "Contabo · build & deploy" → Run workflow. A manual run can
deploy an older image by entering its `tag` (a commit sha).

**Check health and logs (on the server):**
```bash
cd /opt/atrium && docker compose ps
docker compose logs --tail=100 api
curl -s 127.0.0.1:4000/v1/health
```

**Database shell:**
```bash
sudo -u postgres psql -d atrium
```

**Restore a backup** (careful: this is live data):
```bash
pg_restore -d atrium --clean --if-exists /var/backups/atrium/atrium-YYYY-MM-DD.dump
```

**Connect a new client domain** (example `client.com`):
1. Atrium: Website → Domains → Add domain.
2. In the client's DNS, grey cloud: A `@` → `169.58.157.28`, plus the TXT record Atrium shows. Add
   `www` too if wanted.
3. Click Verify until it shows Active and Valid.
4. On the server, copy `/etc/nginx/atrium-domains/leelagarden.conf` to `client.conf`. Change the names
   and the certificate paths, and preferably pass the Host header through instead of overriding it. Then
   issue the certificate:
   ```bash
   certbot certonly --webroot -w /var/www/letsencrypt --cert-name client -d client.com -d www.client.com
   nginx -t && systemctl reload nginx
   ```
   Tip: first enable only the port-80 block, so the ACME challenge works before the certificate exists.
5. Test in a private window.

**Organization admin domain** (example `admin.client.com`):
1. DNS A → VPS.
2. Add an nginx block pointing to `atrium_admin`, with a certificate.
3. Super admin: Organizations → the organization's menu → **Admin domain…**.

**Clear the renderer cache for a site** (after direct DB edits), on the server:
```bash
cd /opt/atrium && S=$(grep ^RENDERER_SECRET= .env | cut -d= -f2-)
curl -s -X POST 127.0.0.1:3001/api/revalidate -H "X-Renderer-Secret: $S" -H 'Content-Type: application/json' -d '{"tags":["site:<websiteId>","host:<hostname>"]}'
```

**Organizations (super admin)**, in Organizations → the organization's menu:
- change the plan, add a member, rename, set the admin domain, feature overrides;
- turn analytics on/off;
- suspend or reinstate;
- delete (shown only for suspended organizations).

**Local development:**
```bash
pnpm infra:up      # local Postgres and Redis (podman)
pnpm db:deploy
pnpm dev
pnpm lint && pnpm typecheck
REQUIRE_DB=1 pnpm turbo run test --filter=@atrium/api   # 133 API tests, all passing at 2afc285
```

---

## 10. Rules and preferences (keep following these)

- **Production is live.** Never wipe or reset data. Migrations must be **additive only** (`ADD COLUMN IF
  NOT EXISTS`, and so on).
- **No secrets in chat, commits or docs.** The user pastes credentials and keys themselves. Never type
  passwords or tokens into forms for them.
- **Never set `CORS_ORIGINS=*`.** The production check rejects it, and it's unsafe.
- **Cloudflare records stay "DNS only".**
- **Only `main` deploys.** Contabo CI must never run for the original repo.
- **Explain simply, as exact numbered steps.** The user is a beginner with infrastructure and dislikes
  overcomplicated or contradictory explanations.
- **Before pushing:** run lint, typecheck and the API tests locally, because CI only lints and
  typechecks.
- **Not now:** switching the leelagarden nginx block to Host pass-through.

---

## 11. Open items

1. **Wildcard certificate** for `*.sites.surajthapa247.com.np`, so new sites get HTTPS without
   per-site certbot. It needs a Cloudflare API token (DNS edit, zone `surajthapa247.com.np`) placed by
   the user at `/root/.secrets/cloudflare.ini` (mode 600), then certbot's `dns-cloudflare` plugin.
   **Until then, each new site's `<slug>.sites` name must be added to the `atrium` certificate by hand.**
2. **Old Cloudflare zone** for leelagarden.com.np in the other account: ask its owner to delete it.
3. **`www.admin.leelagarden.com.np`**: nginx already lists it; add it to the `leelagarden-admin`
   certificate once its DNS resolves.
4. **Bug:** the captcha integration's edit form doesn't show saved `allowedHostnames`, so saving can wipe
   them. Re-enter them all when saving until this is fixed. A task chip was created for it.
5. **Bug:** the Domains page help text says "Subdomains such as leelagarden.com.np point here with a
   CNAME" for a root domain. Only the copy is wrong; verification works.
6. **Not tested in the browser yet:** the new menu items (analytics switch, delete organization).
7. **No email:** SMTP is not configured, so invitations, verification and password-reset emails are not
   sent. Configure SMTP in the env (or an organization email provider).
8. **Off-site backups:** dumps stay on the VPS. Consider copying them to R2.
9. **Automate custom-domain TLS** (Caddy on-demand TLS, or a script around certbot plus an nginx
   template), so client domains need no manual server work.
10. **Pricing guidance discussed:** about NPR 12–15k per site per year; tiers Basic 6–9k, Business
    15–25k, Premium 35–50k. VPS capacity: about 50–100 typical sites, about 200 with media on R2.
