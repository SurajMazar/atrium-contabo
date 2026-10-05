# Kubernetes

**When to choose this:** you already run Kubernetes (EKS, GKE, AKS, DOKS, k3s…) and want GitOps-style
deployments, horizontal scaling and rolling updates. Manifests are plain Kustomize in `infra/k8s` — no Helm.

```
infra/k8s/
  base/                         namespace, service account, Deployments, Services, HPAs, PDBs, Ingresses,
                                migrate Job, backup CronJob, NetworkPolicies, config.env, secrets.example.env
  components/in-cluster-data/   optional non-HA PostgreSQL + Redis StatefulSets (staging/dev)
  overlays/staging/             namespace atrium-staging, 1 replica, in-cluster data, staging hostnames
  overlays/production/          namespace atrium, production sizing, real secrets from secrets.env
```

| Workload          | Kind                                                                       | Notes                                                                                        |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `atrium-api`      | Deployment + Service + HPA (2–10) + PDB                                    | probes: startup/liveness `/v1/health`, readiness `/v1/health/ready`                          |
| `atrium-worker`   | Deployment + PDB                                                           | no Service; 120 s termination grace so jobs finish                                           |
| `atrium-renderer` | Deployment + Service + headless `atrium-renderer-peers` + HPA (2–20) + PDB | TCP probes (unknown hosts return 404); ISR cache on an emptyDir                              |
| `atrium-admin`    | Deployment + Service + PDB                                                 | the admin's build-time API target `http://api:4000` resolves through the `api` alias Service |
| `atrium-migrate`  | Job                                                                        | `prisma migrate deploy`; Argo CD PreSync hook annotations                                    |
| `atrium-backup`   | CronJob (03:15)                                                            | `pg_dump                                                                                     | gzip`→ S3-compatible bucket`BACKUP_BUCKET` |

All pods run as UID 1000, non-root, `readOnlyRootFilesystem`, all capabilities dropped and
`seccompProfile: RuntimeDefault`; the namespace enforces the `restricted` Pod Security level.
NetworkPolicies deny ingress by default and allow only: ingress-nginx → api/admin/renderer,
admin/renderer/worker → api:4000, api/worker → renderer:3001 (revalidation).

## 1. Cluster prerequisites

- ingress-nginx (namespace `ingress-nginx` — the NetworkPolicy selects it by name)
- cert-manager with two ClusterIssuers: `letsencrypt-http01` and `letsencrypt-dns01` (the wildcard for
  tenant sites needs DNS-01). `atrium setup production --target k8s` generates `cluster-issuers.yaml`
  with a Cloudflare DNS-01 solver to adapt.
- metrics-server (HPAs)
- managed PostgreSQL 17 and Redis 7 reachable from the cluster (or the in-cluster component for staging)
- S3-compatible object storage

## 2. Configure

Either use the repository overlays:

```bash
cp infra/k8s/overlays/production/secrets.env.example infra/k8s/overlays/production/secrets.env   # git-ignored
$EDITOR infra/k8s/overlays/production/secrets.env      # DATABASE_URL (?sslmode=require), REDIS_URL, JWT/ENCRYPTION secrets, S3 keys, SMTP
$EDITOR infra/k8s/overlays/production/kustomization.yaml   # hostnames (configMapGenerator literals), image tags
$EDITOR infra/k8s/overlays/production/ingress-patch.yaml
```

or generate a self-contained overlay outside the repo with fresh secrets:

```bash
pnpm atrium setup production --target k8s --domain example.com --registry ghcr.io/acme --tag 1.0.0 --namespace atrium
# deploy/k8s/: kustomization.yaml (resources: ../../infra/k8s/base), ingress-patch.yaml, config.env, secrets.env, cluster-issuers.yaml
```

Generate strong values with `pnpm atrium config set <KEY> --generate` (or `openssl rand -base64 48`;
`ENCRYPTION_KEY` must be exactly 32 bytes: `openssl rand -base64 32`). Check the result with
`pnpm atrium setup check --env-file deploy/k8s/config.env,deploy/k8s/secrets.env`.

Configuration lives in a generated ConfigMap (`atrium-config`) and Secret (`atrium-secrets`); their
names carry a content hash, so changing either rolls the Deployments automatically. For GitOps, replace the
`secretGenerator` with External Secrets Operator, Sealed Secrets or the Secrets Store CSI driver
(keep the Secret name `atrium-secrets` or update the references).

## 3. Render and apply

```bash
kubectl kustomize infra/k8s/overlays/production > /tmp/atrium.yaml     # review
kubectl apply -f cluster-issuers.yaml                                   # once per cluster
kubectl -n atrium delete job atrium-migrate --ignore-not-found          # Jobs are immutable
kubectl apply -f /tmp/atrium.yaml
kubectl -n atrium wait --for=condition=complete job/atrium-migrate --timeout=10m
kubectl -n atrium rollout status deploy/atrium-api deploy/atrium-worker deploy/atrium-renderer deploy/atrium-admin
```

Seed once with `DATABASE_URL` pointing at the database (port-forward a private instance):
`DATABASE_URL=... pnpm db:seed`.

## 4. DNS and TLS

Point `admin.example.com`, `api.example.com`, `sites.example.com` and `*.sites.example.com` at the
ingress controller's load balancer. The base defines two Ingresses:

- `atrium-platform` — admin + api, issuer `letsencrypt-http01`, `proxy-body-size 100m`, buffering off
  for Server-Sent Events;
- `atrium-sites` — `sites.example.com` + `*.sites.example.com`, issuer `letsencrypt-dns01`, secret
  `atrium-sites-wildcard-tls`.

### Custom domains

Each verified customer domain needs a host rule and a certificate. Add an Ingress per domain (or one
Ingress with many hosts):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: site-www-customer-com
  namespace: atrium
  annotations: { cert-manager.io/cluster-issuer: letsencrypt-http01 }
spec:
  ingressClassName: nginx
  tls: [{ hosts: [www.customer.com], secretName: tls-www-customer-com }]
  rules:
    - host: www.customer.com
      http:
        {
          paths:
            [
              {
                path: /,
                pathType: Prefix,
                backend: { service: { name: atrium-renderer, port: { name: http } } },
              },
            ],
        }
```

At scale, prefer an edge that issues certificates on demand: Caddy as the ingress for tenant traffic
(`infra/caddy/Caddyfile`, ask endpoint `GET /v1/public/domains/check?domain=`) or Cloudflare for SaaS
([cloudflare.md](cloudflare.md)).

## 5. Images

CI (`.github/workflows/ci.yml`) pushes `ghcr.io/<owner>/atrium-{api,worker,renderer,admin,migrate}`
tagged with the commit SHA (and `latest` on main). Overlays pin tags in `images:`; bump them with
`kustomize edit set image ghcr.io/your-org/atrium-api=ghcr.io/acme/atrium-api:<sha>` (the deploy workflow
does this for all five). Private registries need an `imagePullSecrets` entry on the `atrium` ServiceAccount.

## 6. Upgrades and zero-downtime migrations

1. Build and push images.
2. Delete and re-apply the migrate Job; wait for completion (Argo CD runs it as a PreSync hook).
3. Apply the overlay; Deployments roll with `maxUnavailable: 0`, readiness gates traffic, `preStop`
   sleeps 5 s so the ingress drains before SIGTERM.

Migrations must be backward compatible with the previous release (expand → backfill → contract later).
`.github/workflows/deploy-containers.yml` (`target: kubernetes`) automates steps 2–3 with a kubeconfig
secret.

## 7. Scaling

- **api**: HPA on CPU (2–10). Stateless; sessions live in PostgreSQL, rate limits in Redis.
- **worker**: scale replicas manually or with KEDA's `redis` scaler on `atrium:<queue>:wait` (BullMQ
  prefix `atrium`, `QUEUE_PREFIX`). Increase `/tmp` if `WORKER_ENABLE_LOCAL_BUILDS=1` builds static exports
  inside the worker.
- **renderer**: HPA on CPU (2–20). Each pod has its own ISR cache, and the API's on-publish
  `POST /api/revalidate` goes to `RENDERER_URL` — a single pod behind the Service. Either point
  revalidation at every pod (the headless `atrium-renderer-peers` Service resolves all pod IPs) or
  configure a shared Next.js cache handler (e.g. Redis); otherwise stale pages persist on other pods
  until their revalidate window passes.
- **PostgreSQL connections**: each process opens up to `DATABASE_POOL_SIZE` (default 10). Budget
  `replicas × pool` below the server's `max_connections`, or front it with PgBouncer.

## 8. Staging with in-cluster data

`overlays/staging` includes `components/in-cluster-data` (single-replica PostgreSQL 17 and Redis 7 with
PVCs) and sets one replica everywhere:

```bash
cp infra/k8s/overlays/staging/secrets.env.example infra/k8s/overlays/staging/secrets.env
# set POSTGRES_PASSWORD and the same password in DATABASE_URL=postgresql://atrium:<pw>@atrium-postgres:5432/atrium
kubectl kustomize infra/k8s/overlays/staging | kubectl apply -f -
```

Not for production: no replication, failover or PITR. Use a managed service or an operator
(CloudNativePG) instead.

## 9. Backups

The `atrium-backup` CronJob dumps the database nightly to `s3://$BACKUP_BUCKET/atrium/<timestamp>/` using
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (set `BACKUP_S3_ENDPOINT` for non-AWS providers). Configure a
lifecycle rule on the bucket for retention, and keep the managed database's own PITR enabled.
Media lives in object storage — enable versioning/replication there.

## Troubleshooting

| Symptom                                    | Check                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Pods rejected by Pod Security              | custom sidecars must also run non-root with `seccompProfile: RuntimeDefault` and dropped capabilities                    |
| api never ready                            | `kubectl -n atrium logs deploy/atrium-api`; readiness checks PostgreSQL + Redis; NetworkPolicy egress is open by default |
| Ingress 503                                | NetworkPolicy allows the `ingress-nginx` namespace by name — adjust if your controller lives elsewhere                   |
| Wildcard certificate pending               | `kubectl -n atrium describe certificate atrium-sites-wildcard-tls`; DNS-01 solver credentials                            |
| `field is immutable` on the Job            | delete `job/atrium-migrate` before applying                                                                              |
| Admin calls fail                           | the `api` alias Service must exist (base `api.yaml`), or rebuild the admin with your API URL                             |
| Provider secrets unreadable after redeploy | `ENCRYPTION_KEY` changed between releases                                                                                |
