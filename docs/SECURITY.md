# Security

This document describes how Atrium protects tenants, credentials and visitors, and what operators must
configure. Items marked **Recommended** are operational guidance rather than built-in controls.

## Threat model in brief

| Asset                                                 | Threats                                   | Main controls                                                            |
| ----------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Tenant data (sites, submissions, media)               | cross-tenant access, privilege escalation | DB-resolved ownership, permission checks, website scoping                |
| Accounts                                              | credential stuffing, session theft        | argon2id, rate limits, rotating refresh tokens with reuse detection, MFA |
| Provider credentials (SMTP, SMS, AI, Vercel, storage) | DB leak, log leak                         | AES-256-GCM at rest, write-only API, log redaction                       |
| Visitors of tenant sites                              | XSS via content, tracking                 | sanitization, permission-gated custom code, cookieless analytics         |
| Platform infrastructure                               | SSRF, certificate abuse, supply chain     | private-address blocking, TLS ask endpoint, pinned lockfile              |
| AI agent                                              | prompt injection, data exfiltration       | operations-only tool surface, RBAC per tool call, review before apply    |

## Tenant isolation

- Every tenant row carries `organization_id` directly or through its website.
- `AccessService` (`apps/api/src/common/access.service.ts`) resolves the **owning organization of the
  target resource from the database** (website, page, form, submission, media, domain…); ids in the
  request path are never trusted. Soft-deleted resources resolve to 404.
- The caller's membership in that organization is loaded with its role permissions and `websiteIds`;
  a non-empty `websiteIds` restricts the member to those websites.
- Public endpoints identify the site by `Host` (`{slug}.PLATFORM_SITES_DOMAIN` or a `Domain` row) and only
  ever return published snapshots; draft access requires a preview token.

## RBAC

Authorization checks **permission keys** (`packages/schema/src/permissions.ts`, e.g. `page.publish`,
`integration.manage`, `code.manage`), never role names. Default roles (owner, admin, designer, developer,
editor, content manager, SEO manager, marketing manager, submission manager, viewer) are bundles of keys;
organizations can define custom roles. Super-admins hold platform permissions for `/v1/admin/*`. All
checks happen in the API — the admin UI only hides what the API would refuse.

## Authentication and sessions

- Passwords are hashed with **argon2id**.
- Login returns a **15-minute JWT access token** (`JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`) used as a Bearer
  token and kept in memory by the admin, plus a **refresh token** in the httpOnly cookie `atrium_rt`
  (SameSite=Lax, `Secure` when `COOKIE_SECURE=true`). Refresh tokens are stored hashed in `sessions`,
  expire after `REFRESH_TTL_DAYS`, and are **rotated on every refresh; presenting a rotated token revokes
  every session of the user** (theft detection).
- TOTP MFA with encrypted secret and recovery codes; MFA challenges are short-lived tokens.
- Users can list and revoke sessions; `atrium set-admin-password` revokes all sessions.
- Password reset and email verification use single-use hashed tokens with expiry.

## CSRF and CORS

- API calls authenticate with the `Authorization: Bearer` header, which browsers never attach
  cross-site, so state-changing endpoints are not CSRF-able.
- The only cookie is the refresh token (SameSite=Lax); the refresh endpoint only returns a new access
  token to a same-origin caller.
- The admin proxies `/api/*` to the API, so the browser talks same-origin; `CORS_ORIGINS` lists the
  origins allowed to call the API directly.
- **`COOKIE_DOMAIN` must be the admin host** (e.g. `admin.example.com`), never a parent domain shared with
  `*.sites.example.com`: tenant sites run customer code. `atrium setup check` fails such configurations.
- **Recommended:** serve tenant sites from a separate registrable domain (`example-sites.com`) — the
  model GitHub uses with `github.io` — so tenant content can never share a cookie scope or same-site
  context with the admin.

## Secrets at rest

`packages/server-kit/src/crypto.ts` encrypts provider secrets (`secrets_enc` columns, webhook secrets,
MFA secrets) with **AES-256-GCM**:

- format `v1:<keyId>:<iv>:<tag>:<ciphertext>`; random 96-bit IV per value; the `v1:<keyId>` header is
  bound as additional authenticated data, so tampering fails decryption;
- `ENCRYPTION_KEY` is a 32-byte base64 key registered as key id `default`.

Secrets are **write-only** through the API: reads return masked values (`••••••••abcd`); sending the
masked value back keeps the stored secret. Logs are redacted (pino redact paths for authorization headers,
passwords, tokens and secrets).

### Key rotation

1. Generate a new key: `openssl rand -base64 32`.
2. Add it to `ENCRYPTION_KEYS=new:<base64>` (comma-separated `id:key` pairs; keep `ENCRYPTION_KEY` as
   `default`) and set `ENCRYPTION_KEY_ID=new`. Deploy api and worker together.
3. New ciphertexts use `new`; old values still decrypt with `default`. Re-encrypt existing rows (the
   crypto module exposes `needsReencryption()` for this) — e.g. by re-saving provider credentials.
4. Remove the old key once nothing uses it.

Losing every copy of a key makes the credentials encrypted with it unrecoverable (users must re-enter
them). Store keys in a secret manager and in your backup procedure.

JWT secrets can be rotated at any time; users are signed out. `RENDERER_SECRET` must change on API and
renderer together.

## HTTP security headers and CSP

- The API uses **helmet** (CSP disabled because it serves JSON; `Cross-Origin-Resource-Policy:
cross-origin` for media).
- Edge configs (`infra/caddy/Caddyfile`, `infra/nginx/atrium.conf`) add HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, and `X-Frame-Options: DENY` for the admin.
- **Recommended:** a strict CSP for the admin, and a per-site CSP for tenant sites that accounts for the
  site's allowed embeds and custom scripts.

## Rate limits, captcha and spam

- Global throttling with `@nestjs/throttler` backed by Redis (shared across API instances); stricter
  limits on auth and public endpoints (form submit is limited per IP + form).
- Forms can require **reCAPTCHA v2/v3, Cloudflare Turnstile or hCaptcha**; verification is server-side
  and **fails closed** (provider outage → rejection).
- Every submission gets a **spam score** (honeypot field `_hp`, time-to-submit, captcha score, content
  heuristics); high scores are stored as `SPAM` instead of triggering workflows.
- Visitor IPs are stored only as salted hashes.

## Content sanitization and custom code

- Rich text and embed HTML in page documents, header/footer and global sections are sanitized with
  `sanitize-html` allow-lists on **every write path** (`apps/api/src/common/sanitize.ts`). Embeds allow
  iframes only from an allow-list of hosts (YouTube, Vimeo, Google Maps, Spotify, SoundCloud, Calendly,
  OpenStreetMap, Google Docs, Airtable, Microsoft Forms).
- Custom CSS, scripts and head code require the `code.manage` permission and are audited.
- Node props are validated against the component's zod schema; unknown props are dropped.

## Uploads

- Size limits (`UPLOAD_MAX_MB`), checksum de-duplication, MIME checks; raster images are re-encoded by
  sharp into variants.
- Form uploads are stored under `private/` keys and served only through short-lived signed URLs.
- **Recommended:** serve user uploads from a separate domain (`media.example.com`/CDN), as the default
  configs do, so uploaded HTML/SVG never runs on the admin origin.

## Outbound requests (SSRF)

Webhook deliveries and HTTP-based providers resolve the target host and **refuse loopback, private,
link-local, CGNAT and other non-public addresses** (`apps/worker/src/lib/net.ts`), as well as `localhost`,
`*.internal` and `*.local` names (allowed only in local development).

## Webhook signing

Deliveries carry `X-Atrium-Event`, `X-Atrium-Delivery`, `X-Atrium-Timestamp` and
`X-Atrium-Signature: sha256=<hex HMAC-SHA256 of "{timestamp}.{body}">` with the webhook's secret (shown
once on creation, stored encrypted). Verify in your receiver and reject old timestamps:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyAtriumWebhook(rawBody, headers, secret, toleranceSec = 300) {
  const ts = Number(headers['x-atrium-timestamp']);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected =
    'sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const got = String(headers['x-atrium-signature'] ?? '');
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
```

## TLS and domains

- On-demand certificates are only issued for hosts the API approves
  (`GET /v1/public/domains/check?domain=` returns 200 for platform subdomains of existing sites and
  domains connected to a website), so attackers cannot make the edge request certificates for arbitrary
  names.
- Custom domains carry a verification token and DNS checks before they are shown as verified.

## Audit log

Security-relevant actions (sign-in events, role and member changes, provider/integration changes,
publishing, custom code, deletions, AI apply/revert) are written to `audit_logs` with actor type
(`USER`, `AI`, `SYSTEM`, `API`), IP and user agent. Organizations see their own log; super-admins see all.

## AI safety boundaries

- The agent (`packages/agent`) can only produce **builder operations** — create/update/move nodes,
  pages, theme tokens, forms — through a typed tool surface whose inputs are JSON schemas derived from the
  component registry. It has no database, shell, filesystem or arbitrary network access; the only external
  call is to the configured AI provider.
- Every tool call executes with the **invoking user's permissions** inside that user's organization and
  website; cross-tenant ids fail the same ownership checks as any API request.
- Output is normalized through the registry (unknown components dropped, invalid props reset to
  defaults) and sanitized like human input.
- Edits are **proposals**: the user reviews the change summary and applies it; applied changes are one
  version with recorded rollback data (`AiGeneration.rollback`) and can be reverted.
- Prompt injection: content the agent reads (existing page text, briefs) is untrusted data; because the
  tool surface is limited to site operations the user could perform anyway, injected instructions cannot
  escalate privileges. Usage and cost are metered per organization against plan limits.

## Infrastructure hardening

- Images run as the non-root `node` user (uid 1000) with tini; no secrets are baked into images.
- Kubernetes: `restricted` Pod Security, read-only root filesystems, dropped capabilities,
  `seccompProfile: RuntimeDefault`, `automountServiceAccountToken: false`, default-deny ingress
  NetworkPolicies.
- Compose/Quadlet keep PostgreSQL, Redis and SeaweedFS on a private network; only Caddy publishes ports.
- systemd units use `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp` and friends.
- `.env` files written by the CLI are mode 0600; the CLI masks secrets in all output and stores API
  tokens in `~/.config/atrium/credentials.json` (0600).
- Supply chain: committed lockfile with `--frozen-lockfile` everywhere; install scripts limited to the
  `onlyBuiltDependencies` allow-list in `pnpm-workspace.yaml`; CI images built with provenance and SBOM.

## Operator checklist

- [ ] `atrium setup check` passes (https URLs, strong secrets, `COOKIE_DOMAIN` = admin host,
      `COOKIE_SECURE=true`, CORS without localhost).
- [ ] `ENCRYPTION_KEY` and JWT secrets stored in a secret manager and backed up separately from the database.
- [ ] PostgreSQL and Redis not reachable from the internet; TLS for managed services.
- [ ] Backups encrypted at rest; restores tested.
- [ ] WAF/rate limiting at the edge for `/v1/auth/*` and `/v1/public/forms/*`.
- [ ] Super-admin accounts use MFA.

## Responsible disclosure

Please report vulnerabilities privately to **security@your-domain.example** (replace with your
address). Include affected versions, reproduction steps and impact. We acknowledge reports within 3
business days, aim to fix critical issues within 30 days, and coordinate public disclosure within 90 days.
Good-faith research that avoids privacy violations, data destruction and service degradation, and that
only touches accounts you own, is welcome and will not be pursued legally. Out of scope: denial of service,
social engineering, and findings that require a compromised device.
