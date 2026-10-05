# Podman Quadlet units

Rootless systemd units for the production stack (same topology as `infra/compose.prod.yaml`).
Podman ≥ 5 turns these files into systemd services.

```bash
atrium setup production --target podman --domain example.com      # generates deploy/podman/ incl. quadlet/
mkdir -p ~/.config/containers/systemd ~/.config/atrium
cp deploy/podman/quadlet/* ~/.config/containers/systemd/
cp deploy/podman/.env ~/.config/atrium/atrium.env && chmod 600 ~/.config/atrium/atrium.env
cp -r deploy/podman/caddy deploy/podman/seaweedfs ~/.config/atrium/
sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80            # rootless Caddy on :80/:443 (persist in /etc/sysctl.d)
loginctl enable-linger "$USER"                                    # keep services running after logout
systemctl --user daemon-reload
systemctl --user start atrium-caddy.service                       # pulls in everything via Requires=
journalctl --user -u atrium-api -f
```

Upgrade: bump `ATRIUM_IMAGE_TAG` in the `Image=` lines (or use `AutoUpdate=registry` + `podman auto-update`),
then `systemctl --user restart atrium-migrate atrium-api atrium-worker atrium-renderer atrium-admin`.
