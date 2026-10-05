# Atrium on Kubernetes — {{domain}}

Generated {{generatedAt}}. Full guide: {{doc}}

1. **Fill secrets**: `secrets.env` (DATABASE_URL to managed PostgreSQL with `sslmode=require`,
   REDIS_URL, S3 keys, SMTP). `config.env` holds non-secret settings (S3 endpoint/bucket, SMTP host…).
   Prefer External Secrets / Sealed Secrets in GitOps setups; never commit `secrets.env`.
   Optional least privilege: add `MIGRATE_DATABASE_URL` (owner role) and point `DATABASE_URL` at a
   DML-only role ({{doc}}#least-privilege-database-role). The renderer pod only receives RENDERER_SECRET.
2. **Cluster add-ons**: ingress-nginx, cert-manager, metrics-server (for the HPAs).
   `kubectl apply -f cluster-issuers.yaml` (edit the DNS-01 solver for your DNS provider).
3. **DNS**: point {{adminHost}}, {{apiHost}}, {{sitesDomain}} and `*.{{sitesDomain}}` at the ingress load balancer.
4. **Images**: push `{{registry}}/atrium-{api,worker,renderer,admin,migrate}:{{tag}}` (CI: .github/workflows/ci.yml).
   The admin's build-time API target `http://api:4000` resolves via the base's `api` alias Service.
5. **Render & apply**:
   ```bash
   kubectl kustomize . > /tmp/atrium.yaml            # review
   kubectl -n {{namespace}} delete job atrium-migrate --ignore-not-found
   kubectl apply -f /tmp/atrium.yaml
   kubectl -n {{namespace}} wait --for=condition=complete job/atrium-migrate --timeout=10m
   kubectl -n {{namespace}} rollout status deploy/atrium-api deploy/atrium-worker deploy/atrium-renderer deploy/atrium-admin
   ```
6. **Seed once** from a workstation/CI job **with the generated env files** (NODE_ENV=production and the
   generated SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD — the seed refuses the .env.example credentials outside
   local development) and DATABASE_URL pointing at the database (port-forward if private):
   ```bash
   kubectl port-forward svc/<db> 5433:5432 &
   cat config.env secrets.env > /tmp/atrium-seed.env && chmod 600 /tmp/atrium-seed.env
   pnpm atrium seed --env-file /tmp/atrium-seed.env --database-url "postgresql://…@127.0.0.1:5433/atrium?sslmode=require"
   rm /tmp/atrium-seed.env
   ```
7. **Custom domains**: each verified customer domain needs an Ingress host + certificate (HTTP-01) —
   see {{doc}}#custom-domains.
