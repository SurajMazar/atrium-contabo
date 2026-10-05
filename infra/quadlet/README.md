# Podman Quadlet units

Rootless systemd units for the production stack (same topology as `infra/compose.prod.yaml`).
Podman ≥ 5 turns these files into systemd services.

```bash
atrium setup production --target podman --domain example.com      # generates deploy/podman/ incl. quadlet/ and env/
mkdir -p ~/.config/containers/systemd ~/.config/atrium && chmod 700 ~/.config/atrium
cp deploy/podman/quadlet/* ~/.config/containers/systemd/
# Full app env (api, worker, migrate) + one small env file per service (least privilege):
install -m 600 deploy/podman/.env ~/.config/atrium/atrium.env
install -m 600 deploy/podman/env/*.env ~/.config/atrium/        # caddy, postgres, redis, renderer, admin, migrate
cp -r deploy/podman/caddy deploy/podman/seaweedfs deploy/podman/postgres deploy/podman/redis ~/.config/atrium/
chmod 644 ~/.config/atrium/redis/redis.conf                       # read by the container's redis user
sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80            # rootless Caddy on :80/:443 (persist in /etc/sysctl.d)
loginctl enable-linger "$USER"                                    # keep services running after logout
systemctl --user daemon-reload
systemctl --user start atrium-caddy.service                       # pulls in everything via Requires=
journalctl --user -u atrium-api -f
```

| Unit | Env file | Networks |
|---|---|---|
| atrium-api, atrium-worker | `atrium.env` (full) | atrium (edge) + atrium-data |
| atrium-migrate | `atrium.env` + `migrate.env` (owner-role DATABASE_URL) | atrium-data |
| atrium-renderer | `renderer.env` (RENDERER_SECRET + public URLs) | atrium |
| atrium-admin | `admin.env` (public URLs) | atrium |
| atrium-caddy | `caddy.env` (hosts, ACME email, bucket) | atrium |
| atrium-postgres | `postgres.env` (POSTGRES_*) | atrium-data |
| atrium-redis | `redis.env` (REDISCLI_AUTH) + `redis/redis.conf` (requirepass) | atrium-data |
| atrium-s3 | — (`seaweedfs/s3.json`) | atrium + atrium-data (only :8333 listens) |

`atrium-data` is an internal network (no egress); Caddy, admin and renderer are not attached to it.
App containers run with `ReadOnly=true`, `DropCapability=all`, `NoNewPrivileges=true`.

Upgrade: bump `ATRIUM_IMAGE_TAG` in the `Image=` lines (or use `AutoUpdate=registry` + `podman auto-update`),
then `systemctl --user restart atrium-migrate atrium-api atrium-worker atrium-renderer atrium-admin`.
Third-party images (postgres, redis, caddy, seaweedfs) are pinned by version and digest; Renovate bumps them.
