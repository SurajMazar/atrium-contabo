# Atrium on AWS — {{domain}}

Generated {{generatedAt}}. Full guide: {{doc}}

| Component | AWS service |
|---|---|
| api, renderer, admin | ECS Fargate services behind an ALB (ACM certificates) |
| worker | ECS Fargate service (no load balancer; scale on queue depth) |
| migrations | one-off ECS task `atrium-migrate` per release |
| PostgreSQL 17 | RDS for PostgreSQL / Aurora PostgreSQL (`?sslmode=require`) |
| Redis 7 | ElastiCache for Redis/Valkey (`rediss://`, `maxmemory-policy noeviction` parameter group) |
| media | S3 (private) + CloudFront (OAC) on {{mediaHost}} |
| email | SES SMTP (`email-smtp.<region>.amazonaws.com:587`) |
| secrets | Secrets Manager `atrium/production` (JSON keys) |

1. Edit `.env` (DATABASE_URL, REDIS_URL, S3_*, SMTP_*), then `bash deploy.sh` step by step.
2. ALB host rules: {{apiHost}} → api:4000, {{adminHost}} → admin:3000, `{{sitesDomain}}`, `*.{{sitesDomain}}` → renderer:3001.
   Customer domains: add each verified domain to the ACM certificate (SNI, up to 25 per listener cert list) or front the renderer with CloudFront + per-domain certs.
3. Route 53: alias records for the hosts above → ALB; {{mediaHost}} → CloudFront.
4. Releases: push images → `aws ecs run-task … atrium-migrate` → `aws ecs update-service --force-new-deployment` for each service
   (see .github/workflows/deploy-containers.yml).
