#!/usr/bin/env bash
# Atrium on Azure Container Apps — provisioning walkthrough (az CLI ≥ 2.60, extension containerapp).
# Run step by step; port to Bicep/Terraform for repeatable environments. Guide: {{doc}}
set -euo pipefail
RG="${RG:-atrium-prod}"
LOC="${LOC:-westeurope}"
ENV_NAME=atrium-env
REGISTRY="{{registry}}"            # e.g. myregistry.azurecr.io/atrium (ACR) or ghcr.io/org
TAG="{{tag}}"
PG=atrium-pg-$RANDOM; REDIS=atrium-redis-$RANDOM; SA=atriummedia$RANDOM; KV=atrium-kv-$RANDOM

az group create -n "$RG" -l "$LOC"

# 1. Data services
az postgres flexible-server create -g "$RG" -n "$PG" -l "$LOC" --tier Burstable --sku-name Standard_B2s \
  --version 17 --storage-size 64 --admin-user atrium --admin-password "$(openssl rand -hex 24)" --public-access None
az postgres flexible-server db create -g "$RG" -s "$PG" -d atrium
az redis create -g "$RG" -n "$REDIS" -l "$LOC" --sku Standard --vm-size c1 --redis-configuration '{"maxmemory-policy":"noeviction"}'
az storage account create -g "$RG" -n "$SA" -l "$LOC" --sku Standard_ZRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access true
az storage container create --account-name "$SA" -n atrium-media --public-access blob
# Atrium's azure-blob storage driver: set STORAGE_DRIVER=azure-blob and the AZURE_STORAGE_* settings
# from docs/STORAGE.md in .env (or use an S3-compatible gateway).

# 2. Key Vault for secrets (Container Apps reference them via managed identity)
az keyvault create -g "$RG" -n "$KV" -l "$LOC" --enable-rbac-authorization true
while IFS='=' read -r k v; do
  case "$k" in DATABASE_URL|REDIS_URL|JWT_*|ENCRYPTION_KEY|RENDERER_SECRET|ANALYTICS_SALT|SMTP_PASSWORD|*_API_KEY|VERCEL_TOKEN|S3_SECRET_ACCESS_KEY)
    [ -n "$v" ] && az keyvault secret set --vault-name "$KV" -n "$(echo "$k" | tr '_' '-' | tr 'A-Z' 'a-z')" --value "${v%\"}" >/dev/null ;; esac
done < <(grep -E '^[A-Z0-9_]+=' .env)

# 3. Container Apps environment (Log Analytics created automatically)
az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOC"

common_env=(NODE_ENV=production ADMIN_URL=https://{{adminHost}} API_URL=https://{{apiHost}} RENDERER_URL=https://{{sitesDomain}}
  PLATFORM_SITES_DOMAIN={{sitesDomain}} PREVIEW_URL=https://{{sitesDomain}} CORS_ORIGINS=https://{{adminHost}} COOKIE_DOMAIN={{adminHost}}
  ATRIUM_API_INTERNAL_URL=http://atrium-api)
# Secrets: create with --secrets name=keyvaultref:<uri>,identityref:<id> then reference as env "KEY=secretref:name".

# 4. Migrations as a Container Apps Job (manual trigger per release)
az containerapp job create -g "$RG" -n atrium-migrate --environment "$ENV_NAME" --trigger-type Manual \
  --replica-timeout 900 --image "$REGISTRY/atrium-migrate:$TAG" --cpu 0.5 --memory 1Gi --env-vars "${common_env[@]}"
az containerapp job start -g "$RG" -n atrium-migrate

# 5. Apps (api internal+external, worker without ingress, renderer/admin external)
az containerapp create -g "$RG" -n atrium-api --environment "$ENV_NAME" --image "$REGISTRY/atrium-api:$TAG" \
  --ingress external --target-port 4000 --min-replicas 2 --max-replicas 10 --cpu 1 --memory 2Gi --env-vars "${common_env[@]}" PORT=4000
az containerapp create -g "$RG" -n atrium-worker --environment "$ENV_NAME" --image "$REGISTRY/atrium-worker:$TAG" \
  --min-replicas 1 --max-replicas 5 --cpu 1 --memory 2Gi --env-vars "${common_env[@]}"
az containerapp create -g "$RG" -n atrium-renderer --environment "$ENV_NAME" --image "$REGISTRY/atrium-renderer:$TAG" \
  --ingress external --target-port 3001 --min-replicas 2 --max-replicas 20 --cpu 0.5 --memory 1Gi --env-vars "${common_env[@]}" PORT=3001
az containerapp create -g "$RG" -n atrium-admin --environment "$ENV_NAME" --image "$REGISTRY/atrium-admin:$TAG" \
  --ingress external --target-port 3000 --min-replicas 1 --max-replicas 5 --cpu 0.5 --memory 1Gi --env-vars "${common_env[@]}" PORT=3000

# 6. Custom domains + free managed certificates
for pair in "atrium-api {{apiHost}}" "atrium-admin {{adminHost}}" "atrium-renderer {{sitesDomain}}"; do
  set -- $pair
  az containerapp hostname add -g "$RG" -n "$1" --hostname "$2"
  az containerapp hostname bind -g "$RG" -n "$1" --hostname "$2" --environment "$ENV_NAME" --validation-method CNAME
done
echo "Wildcard *.{{sitesDomain}} needs your own certificate (managed certs do not cover wildcards) or Azure Front Door — see {{doc}}"
