# Platform providers

Everything the platform itself needs — outgoing email, SMS, file storage and the AI model key —
can be configured from the admin panel instead of environment variables.

| Where | Who | What it controls |
|---|---|---|
| **Super admin → Providers** (`/admin/providers`) | Super admins | The platform's own email (password resets, invitations, and every organization without its own mailer), a shared SMS gateway, default storage, and a shared AI key |
| **Organization → Integrations** (`/org/:id/integrations`) | Members with `integration.manage` | The organization's own providers (optionally per website) |
| Environment (`SMTP_*`, `S3_*`, `ANTHROPIC_API_KEY`…) | Operators | Last fallback, e.g. for first boot before anyone has signed in |

## Resolution order

For every send, upload or AI call the resolver picks the first match:

1. an explicitly chosen provider (e.g. a form's notification provider)
2. the website's own provider
3. the organization's default provider
4. **the platform provider set in the admin panel** (default of that kind, enabled)
5. environment variables

Changes in the panel apply within about a minute (cached instances are keyed by the row's
`updatedAt`), with no restart of the API or worker.

## Security

- Secrets are encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`) and only ever returned masked.
- Changing a provider's driver or endpoint (host, URL, bucket…) requires re-entering its secrets,
  so stored credentials cannot be redirected to another server.
- Every create/update/delete is written to the audit log (`platform.provider_*`).
- The platform `local` storage driver always uses `LOCAL_STORAGE_DIR`; a directory cannot be typed in.
- Only super admins can read or change platform providers (MFA required in production).

## AI setup from the product

When AI isn't available for an organization, "Generate with AI" and the builder's **Ask AI** panel
show **Connect an AI provider**: members with `integration.manage` paste a Claude, OpenAI or Gemini
key there (saved as the organization's default AI integration and tested immediately); super admins
get a link to set one shared platform key. `GET /v1/organizations/:orgId/ai/status` reports whether AI
is ready and where the key comes from. With `AI_DEMO=1` the offline demo provider always answers.
