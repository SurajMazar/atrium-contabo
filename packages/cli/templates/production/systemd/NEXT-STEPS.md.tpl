# Atrium on a VM with systemd + nginx — {{domain}}

Generated {{generatedAt}}. Node.js 24 runs on the host; PostgreSQL 17 and Redis 7 are host packages
(or managed services). Full guide: {{doc}}

## 1. Prepare the host (Debian/Ubuntu)
```bash
sudo useradd --system --home {{appDir}} --shell /usr/sbin/nologin atrium
sudo apt install -y nginx postgresql-17 redis-server certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pnpm@10
sudo mkdir -p {{appDir}} /etc/atrium /var/lib/atrium/backups /var/log/atrium && sudo chown -R atrium: {{appDir}} /var/lib/atrium /var/log/atrium
```
Redis for BullMQ: set `maxmemory-policy noeviction`, `appendonly yes` and `requirepass <REDIS_PASSWORD from .env>`
(`atrium setup redis --out redis.conf`, then add the requirepass line); bind it to 127.0.0.1 only.
PostgreSQL — two roles: the owner runs migrations (`MIGRATE_DATABASE_URL`), the app role is DML-only (`DATABASE_URL`):
```bash
sudo -u postgres createuser -P atrium            # POSTGRES_PASSWORD from .env
sudo -u postgres createdb -O atrium atrium
# after step 2 (code checked out): DML-only app role + default privileges for future migrations
sudo -u postgres env POSTGRES_USER=postgres POSTGRES_OWNER=atrium POSTGRES_DB=atrium POSTGRES_APP_USER=atrium_app \
  POSTGRES_APP_PASSWORD='<POSTGRES_APP_PASSWORD from .env>' sh {{appDir}}/infra/postgres/initdb/10-app-role.sh
```

## 2. Code + build (as the atrium user)
```bash
sudo -u atrium git clone <your repo> {{appDir}} && cd {{appDir}}
sudo -u atrium pnpm install --frozen-lockfile && sudo -u atrium pnpm build
sudo install -m 600 -o atrium .env /etc/atrium/atrium.env   # this generated file; fill SMTP_*/S3_* first
# least-privilege subsets for the units that must not see every secret:
sudo install -m 600 -o atrium env/renderer.env env/admin.env env/migrate.env /etc/atrium/
```
Object storage: point S3_* at a managed bucket (S3, R2, B2, Spaces…) — or run SeaweedFS/MinIO
and expose it on {{mediaHost}} (see nginx/atrium.conf).

## 3. Services
```bash
sudo cp systemd/*.service systemd/*.timer systemd/atrium.target /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now atrium.target atrium-backup.timer
systemctl status 'atrium-*'    # journalctl -u atrium-api -f
```

## 4. nginx + TLS
```bash
sudo cp nginx/atrium.conf /etc/nginx/conf.d/atrium.conf && sudo mkdir -p /etc/nginx/atrium-domains
sudo certbot certonly --nginx -d {{adminHost}} -d {{apiHost}} -d {{mediaHost}}
sudo certbot certonly --dns-<provider> -d {{sitesDomain}} -d '*.{{sitesDomain}}'   # wildcard → DNS-01
sudo nginx -t && sudo systemctl reload nginx
```
Customer domains need a certificate each (`certbot --nginx -d www.customer.com` + a file in
/etc/nginx/atrium-domains/). For many custom domains prefer Caddy (`caddy/Caddyfile`, on-demand TLS).

## 5. Seed + upgrade
```bash
# Uses the generated env (NODE_ENV=production, SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD); the seed refuses
# the .env.example admin credentials outside local development.
cd {{appDir}} && sudo -u atrium pnpm atrium seed --env-file /etc/atrium/atrium.env
# upgrades (backup → pull → install → migrate → build):
sudo -u atrium pnpm atrium update && sudo systemctl restart atrium.target
```
