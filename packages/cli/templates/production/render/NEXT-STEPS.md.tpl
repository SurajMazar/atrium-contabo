# Atrium on Render — {{domain}}

Generated {{generatedAt}}. Guide: {{doc}}

1. Copy `render.yaml` to the repository root and create a Blueprint in the Render dashboard.
2. Enter the `sync: false` values (ENCRYPTION_KEY, S3_*, SMTP_*) — use the generated `.env` here.
3. The `atrium-migrate` cron service must build the **migrate** target: in its settings set Docker
   target `migrate` (Render builds the default target otherwise) and trigger "Run now" before each release.
4. DNS: CNAME {{apiHost}}, {{adminHost}}, {{sitesDomain}} to the onrender.com hosts; wildcard
   `*.{{sitesDomain}}` requires the DNS verification Render shows for wildcard domains.
