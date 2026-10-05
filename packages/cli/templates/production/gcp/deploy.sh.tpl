#!/usr/bin/env bash
# Atrium on Google Cloud — Cloud Run (api, renderer, admin) + worker on GKE Autopilot or a
# Compute Engine VM (Cloud Run instances are request-scoped/idle-throttled, a poor fit for
# always-on BullMQ consumers). Guide: {{doc}}
set -euo pipefail
PROJECT="${PROJECT:?export PROJECT}"; REGION="${REGION:-europe-west1}"
REGISTRY="{{registry}}"   # e.g. europe-west1-docker.pkg.dev/$PROJECT/atrium
TAG="{{tag}}"
gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com sqladmin.googleapis.com redis.googleapis.com secretmanager.googleapis.com vpcaccess.googleapis.com artifactregistry.googleapis.com

# 1. Data
gcloud sql instances create atrium-pg --database-version=POSTGRES_17 --region="$REGION" --tier=db-custom-2-7680 --availability-type=REGIONAL --no-assign-ip --network=default
gcloud sql databases create atrium --instance=atrium-pg
gcloud sql users create atrium --instance=atrium-pg --password="$(openssl rand -hex 24)"
gcloud redis instances create atrium-redis --region="$REGION" --size=1 --redis-version=redis_7_2 --redis-config maxmemory-policy=noeviction
gcloud storage buckets create gs://atrium-media-$PROJECT --location="$REGION" --uniform-bucket-level-access
# S3-interop: create an HMAC key for a service account and use it as S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY
#   gcloud storage hmac create atrium-media@$PROJECT.iam.gserviceaccount.com
# .env: STORAGE_DRIVER=s3 S3_ENDPOINT=https://storage.googleapis.com S3_REGION=auto S3_FORCE_PATH_STYLE=true

# 2. Secrets (one per key)
while IFS='=' read -r k v; do
  case "$k" in DATABASE_URL|REDIS_URL|JWT_*|ENCRYPTION_KEY|RENDERER_SECRET|ANALYTICS_SALT|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|SMTP_PASSWORD|*_API_KEY|VERCEL_TOKEN)
    [ -n "$v" ] && { printf '%s' "${v%\"}" | gcloud secrets create "atrium-$k" --data-file=- 2>/dev/null || printf '%s' "${v%\"}" | gcloud secrets versions add "atrium-$k" --data-file=-; } ;; esac
done < <(grep -E '^[A-Z0-9_]+=' .env)

# 3. Serverless VPC access so Cloud Run reaches Cloud SQL private IP + Memorystore
gcloud compute networks vpc-access connectors create atrium-conn --region="$REGION" --range=10.8.0.0/28 || true

SECRETS="DATABASE_URL=atrium-DATABASE_URL:latest,REDIS_URL=atrium-REDIS_URL:latest,JWT_ACCESS_SECRET=atrium-JWT_ACCESS_SECRET:latest,JWT_REFRESH_SECRET=atrium-JWT_REFRESH_SECRET:latest,ENCRYPTION_KEY=atrium-ENCRYPTION_KEY:latest,RENDERER_SECRET=atrium-RENDERER_SECRET:latest,ANALYTICS_SALT=atrium-ANALYTICS_SALT:latest,S3_ACCESS_KEY_ID=atrium-S3_ACCESS_KEY_ID:latest,S3_SECRET_ACCESS_KEY=atrium-S3_SECRET_ACCESS_KEY:latest"
ENVV="NODE_ENV=production,ADMIN_URL=https://{{adminHost}},API_URL=https://{{apiHost}},RENDERER_URL=https://{{sitesDomain}},PLATFORM_SITES_DOMAIN={{sitesDomain}},PREVIEW_URL=https://{{sitesDomain}},CORS_ORIGINS=https://{{adminHost}},COOKIE_DOMAIN={{adminHost}},STORAGE_DRIVER=s3,S3_ENDPOINT=https://storage.googleapis.com,S3_REGION=auto,S3_BUCKET=atrium-media-$PROJECT,S3_FORCE_PATH_STYLE=true"

# 4. Migrations: Cloud Run Job (one-shot work is a good fit for jobs)
gcloud run jobs deploy atrium-migrate --image="$REGISTRY/atrium-migrate:$TAG" --region="$REGION" --vpc-connector=atrium-conn --set-env-vars="$ENVV" --set-secrets="$SECRETS" --max-retries=1 --task-timeout=900s
gcloud run jobs execute atrium-migrate --region="$REGION" --wait

# 5. Cloud Run services
gcloud run deploy atrium-api --image="$REGISTRY/atrium-api:$TAG" --region="$REGION" --port=4000 --min-instances=1 --max-instances=10 --cpu=1 --memory=1Gi --vpc-connector=atrium-conn --set-env-vars="$ENVV,PORT=4000" --set-secrets="$SECRETS" --allow-unauthenticated
API_URL_INTERNAL="$(gcloud run services describe atrium-api --region="$REGION" --format='value(status.url)')"
gcloud run deploy atrium-renderer --image="$REGISTRY/atrium-renderer:$TAG" --region="$REGION" --port=3001 --min-instances=1 --max-instances=20 --memory=1Gi --set-env-vars="$ENVV,ATRIUM_API_INTERNAL_URL=$API_URL_INTERNAL" --set-secrets="RENDERER_SECRET=atrium-RENDERER_SECRET:latest,ANALYTICS_SALT=atrium-ANALYTICS_SALT:latest" --allow-unauthenticated
gcloud run deploy atrium-admin --image="$REGISTRY/atrium-admin:$TAG" --region="$REGION" --port=3000 --min-instances=0 --max-instances=5 --memory=1Gi --set-env-vars="$ENVV,ATRIUM_API_INTERNAL_URL=$API_URL_INTERNAL" --allow-unauthenticated

# 6. Worker: GKE Autopilot (see worker-gke.yaml) — or a small e2-standard-2 VM running the container:
#   gcloud compute instances create-with-container atrium-worker --zone="$REGION-b" --machine-type=e2-standard-2 \
#     --container-image="$REGISTRY/atrium-worker:$TAG" --container-env-file=.env --container-restart-policy=always
echo "Then: global external HTTPS load balancer with serverless NEGs + Certificate Manager (wildcard via DNS authorization) — see {{doc}}"
