# Atrium on Google Cloud — {{domain}}

Generated {{generatedAt}}. Full guide: {{doc}}

| Component | GCP service |
|---|---|
| api, renderer, admin | Cloud Run services (min instances ≥ 1 for api/renderer) |
| worker | GKE Autopilot Deployment (`worker-gke.yaml`) or a Compute Engine VM — **not** Cloud Run |
| migrations | Cloud Run Job `atrium-migrate` |
| PostgreSQL 17 | Cloud SQL (private IP, Serverless VPC Access) |
| Redis | Memorystore for Redis (`maxmemory-policy=noeviction`) |
| media | Cloud Storage via the S3 interoperability API (HMAC keys) |
| edge | External HTTPS LB + Certificate Manager (wildcard *.{{sitesDomain}} via DNS authorization) |

1. Fill `.env`, run `bash deploy.sh` step by step.
2. Map {{apiHost}}, {{adminHost}}, {{sitesDomain}}, `*.{{sitesDomain}}` on the load balancer URL map.
