# Atrium on Azure — {{domain}}

Generated {{generatedAt}}. Full guide: {{doc}}

| Component | Azure service |
|---|---|
| api, renderer, admin | Azure Container Apps (external ingress, managed certificates) |
| worker | Container App without ingress, min replicas ≥ 1 (KEDA redis scaler optional) |
| migrations | Container Apps **Job** (manual trigger per release) |
| PostgreSQL 17 | Azure Database for PostgreSQL – Flexible Server |
| Redis | Azure Cache for Redis (`maxmemory-policy noeviction`) |
| media | Blob Storage (Atrium `azure-blob` driver) + optional Front Door/CDN on {{mediaHost}} |
| secrets | Key Vault references with a managed identity |
| email | Azure Communication Services Email (SMTP) or SendGrid/Postmark |
| tenant sites | Front Door (wildcard + custom domains with managed certs) → renderer |

1. Fill `.env`, then run `bash deploy.sh` step by step.
2. DNS: CNAMEs for {{adminHost}}, {{apiHost}}, {{sitesDomain}}; wildcard via Front Door.
3. Releases: push images → `az containerapp job start -n atrium-migrate` → `az containerapp update --image … ` per app.
