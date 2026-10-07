# Security architecture

How Atrium protects tenants, accounts, content and credentials, layer by layer. The threat model
is in [THREAT_MODEL.md](THREAT_MODEL.md); the audit findings in [SECURITY_AUDIT.md](SECURITY_AUDIT.md);
the operator-facing summary in [../SECURITY.md](../SECURITY.md).

## 1. Trust boundaries

| Zone | Contents | Trusts |
|---|---|---|
| Internet | Visitors, members, attackers | Nothing |
| Edge | nginx / Caddy, TLS | Forwards to apps; sets `X-Forwarded-*` |
| Admin origin `admin.<root>` | Admin + editor (Next.js) | API via same-origin `/api/v1` proxy |
| Sites origin `<slug>.<sites>` + custom domains | Renderer (Next.js), customer scripts | API only through `X-Renderer-Secret` endpoints |
| Application network | API, worker | Each other through Redis queues; data network |
| Data network (no egress) | PostgreSQL, Redis, storage | Only the app services |
| Third parties | AI, SMTP/SMS, deploy providers, customer webhooks | Reached only through the outbound guard |

The two browser origins are deliberately separate: customer-controlled code (site scripts,
embeds, custom CSS) only ever runs on the sites origin, which holds no admin session.

Each tenant site is served only on its own host. The renderer picks the tenant from the `Host`
header (`X-Forwarded-Host` only with `ATRIUM_TRUST_FORWARDED_HOST=1`). The `/_site/<slug>` shortcut
exists only in development, and draft previews (`/_preview/<token>`) are served only on the preview
host, so one tenant's pages and scripts can never render under another tenant's domain.

## 2. Authentication

- **Passwords**: argon2id; policy of 10+ characters with three of lower/upper/digit/symbol. Login
  failures lock the account in Redis for a period; unknown accounts are verified against a dummy
  hash so timing doesn't reveal which emails exist.
- **Sessions**: a short-lived access JWT (default 15 minutes, HS256, fixed `iss`/`aud`, held in
  memory by the admin) plus a rotating refresh token in an httpOnly cookie (`__Host-atrium_rt` in
  production, so sibling subdomains cannot read or overwrite it). Every refresh rotates the token
  with compare-and-swap; reusing an old token revokes the session family. Every request re-checks
  the session row, so revoked sessions and disabled users stop working at once.
- **MFA**: TOTP with attempt limits and replay protection (`mfa_last_step`), recovery codes,
  required for super-admin access in production (`SUPER_ADMIN_REQUIRE_MFA`). Changing MFA needs a
  recent sign-in or the current password (step-up, `403 REAUTH_REQUIRED`).
- **Resets and verification**: single-use, expiring tokens stored as hashes; resets sign out every
  session; email verification is required before joining organizations in production.
- **Admin-created accounts** (Add member, a client owner created by a super admin) start with a
  password someone else knows. They are flagged `password_change_required`, and the API accepts only
  `/auth/*` until the person sets their own password.
- **Bootstrap** creates the first super admin only for an unused `SEED_ADMIN_EMAIL`, or promotes an
  existing account only when its password is `SEED_ADMIN_PASSWORD`. An email match alone is never
  enough.
- **Login CSRF**: the auth controller checks the browser `Origin` against the admin origin, `CORS_ORIGINS`
  and organization admin domains (set only by super admins; platform and website hostnames are refused).
- **Query tokens**: accepted only on routes marked `@AllowQueryToken` (downloads, SSE tickets),
  and stripped from logs.

## 3. Authorization

- **Permissions, not roles.** Every route declares `@Access(permission, resource, param)`, or is
  explicitly `@Public()` or `@SuperAdminOnly()`. A route-inventory test fails when a route has none.
- **Resource ownership from the database.** `AccessService` resolves the resource id to its
  organization and website (for pages, forms, submissions, domains, deployments, media,
  integrations…) and only then checks membership, permission and website scope. Foreign or missing
  resources return 404.
- **Change-based authorization.** Draft writes (editor operations, AI apply/revert, restores,
  autosave) are diffed, and each kind of change needs its own permission: code (scripts, CSS,
  embeds) needs `code.manage`, theme needs `theme.update`, publish or schedule needs
  `page.publish`, and navigation, redirects, forms, collections and SEO each have their own
  permission.
- **Privilege ceiling.** You can only grant, assign or edit roles up to your own permissions; only
  owners manage owners; an organization always keeps one owner.
- **Website scoping.** A member with `website_ids` (for example a Website Manager) is limited
  centrally:
  - organization-level routes allow only `organization.read`, `website.read`, `media.read/upload`
    and `ai.use`;
  - shared org resources are read-only;
  - members, usage, billing, settings, providers and audit logs are denied;
  - uploads are filed under their website.
- **Organizations** are created only by super admins (`POST /admin/organizations`, or `POST
  /organizations` as a super admin). Sign-up never creates one.
- **Sign-up** is invitation-only in production (`OPEN_SIGNUP` off): `/auth/register` needs a pending
  invitation token for the same email; that account starts with a verified email.
- **Super-admin access** to a tenant is audited (writes always, reads once per hour per session)
  and requires an MFA-verified session in production.

## 4. Tenant isolation

All tenants share tables, so isolation is enforced in code at every lookup:

- tenant ids are never taken from the request body; they come from the resolved resource;
- org-level routes that accept a `websiteId` re-check it with `assertWebsiteInScope`;
- children of a soft-deleted website are unreachable;
- suspended organizations are denied;
- storage keys are prefixed with the organization id, and local storage paths are confined to the
  storage root;
- media deduplication is per organization;
- the renderer sees only published snapshots, through a secret-protected endpoint.

## 5. Secret management

- **Platform secrets** live in `.env` (`JWT_*`, `ENCRYPTION_KEY`, `RENDERER_SECRET`,
  `ANALYTICS_SALT`, DB/Redis passwords). Production refuses to start if any is missing, weak or a
  placeholder. `atrium setup production` generates fresh values; `deploy/` is git-ignored.
- **Credentials at rest** (AI keys, SMTP/SMS, storage, deploy tokens, platform providers) are
  encrypted with AES-256-GCM (`server-kit/crypto.ts`). They are write-only: API responses return
  only `hasSecrets` and masked hints.
- **Moving a stored credential to a different host** (SMTP host, AI base URL) requires re-entering
  the secret.
- **Least-privilege services**: renderer and admin receive only the variables they need; the app
  connects with a DML-only database role, while migrations use the owner role.
- **CI** scans the full git history with gitleaks on every push.

## 6. AI security model

- **The model is untrusted.** Its output is a list of editor operations, not direct writes.
- **Operations are filtered** (`packages/agent/src/policy.ts`) by:
  - permissions the AI never exercises, whatever the caller holds: `code.manage`, `redirect.manage`,
    `form.delete`, `page.delete`, `page.publish`;
  - operations it may never emit: `setRedirects`, `setCustomCss`, `deletePage`, `deleteForm`;
  - settings it may not touch: `scripts`, `analytics`, `cookieConsent`, `integrations`;
  - form settings that change where data goes or how submissions are protected;
  - the operations allowed for the current mode (edit, page, section);
  - the caller's own permissions.

  What remains is validated, normalized, and authorized by the same change rules as manual edits.
- **Confirmation**: applying needs explicit confirmation and is refused when the draft changed
  since generation (stale revert protection).
- **Untrusted content** (site content, imports, form data) is delimited as data in prompts.
- **Quotas**: atomic per-organization reservations (requests, tokens), per-user concurrency
  limits, and plan or feature-flag gating.
- **Streaming progress** uses single-use tickets rather than long-lived tokens in URLs.

## 7. Network boundaries

- **Outbound requests** go through one guard: DNS is resolved once and the connection pinned to
  that address; private, loopback, link-local, CGNAT and metadata ranges are blocked unless
  `OUTBOUND_ALLOW_PRIVATE` is set for local development.
- **Data network**: PostgreSQL, Redis and the S3 gateway listen only on the internal network in the
  bundled compose; application ports bind to `127.0.0.1` for the reverse proxy.
- **CORS** allows only the admin origin; `TRUST_PROXY` trusts `X-Forwarded-For` only from
  loopback and private hops.
- **TLS for custom domains** is issued only after DNS TXT proof (Caddy on-demand TLS asks the API
  first).

## 8. Storage security

- **Upload types** are detected from the bytes, and the server chooses the extension.
- **SVGs** pass an allowlist sanitizer; active content is rejected.
- **Size and quota limits**: per file (`UPLOAD_MAX_MB`) and per plan.
- **Serving**: user files come from the API or media origin with a sandboxing CSP and `nosniff`,
  never from the admin origin. Private files (form uploads) use short-lived signed URLs.
- **Site bundle imports** are limited to 300 MB upload, 400 MB unpacked, 2,000 entries and 500
  referenced assets, and every asset goes through the normal upload path. The entry count and
  declared sizes are checked first, and each entry is inflated as a stream against the remaining
  budget, so zip bombs stop early.
- **Streaming large uploads**: imports and media uploads pass through the admin as a stream
  (dedicated route handlers). The admin's generic proxy buffers at most 25 MB, and the edge allows
  310 MB only on those two paths.
- **Public form uploads** are gated before multipart parsing: the form must exist and have file
  fields, and the declared size must fit its limits. A small number of parses may run at once.
- **Preview links**: 192-bit tokens stored as hashes; passwords of at least 8 characters, locked
  after 10 wrong guesses per 15 minutes.

## 9. Deployment security

- **Containers** run with a read-only root filesystem, `cap_drop: ALL`, `no-new-privileges`, as a
  non-root user, with memory limits and explicit writable volumes.
- **Images** are built in CI with pinned base images and digests; Trivy scans the IaC; Renovate
  proposes updates without auto-merging.
- **Deployment credentials** for external hosts are stored encrypted and used only by the worker.

## 10. Logging and audit

- **Logs** are structured JSON (pino). Paths are logged without query strings, and sensitive
  headers and fields are redacted.
- **The audit log** (`audit_logs`) records security-relevant actions with actor, IP and user
  agent:
  - sign-ins and failed sign-ins, MFA and password changes;
  - member, role and invitation changes;
  - publishes, provider changes and branding changes;
  - super-admin tenant access, and system actions (bootstrap, CLI).
- **Activity timelines** in the admin read from the audit log.

## 11. Incident considerations

| Scenario | Response |
|---|---|
| Leaked `JWT_*` secret | Rotate; all access and refresh tokens become invalid; users sign in again. |
| Leaked `ENCRYPTION_KEY` | Rotate with re-encryption (see key rotation in [../SECURITY.md](../SECURITY.md)); rotate the provider credentials it protected. |
| Leaked `RENDERER_SECRET` | Rotate in the API and renderer env together; published snapshots are public data anyway, but preview and revalidation are protected by it. |
| Compromised account | Revoke its sessions, reset its password and MFA (`node dist/cli.js set-password` / `reset-mfa`), review the audit log. |
| Malicious tenant | Suspend the organization (super admin → Organizations); its sites stop being served and members are denied. |
| Abused custom domain | Remove or unverify the domain; certificates are not reissued without proof. |

Keep database backups (`infra/scripts/backup.sh`) and rehearse restores; the audit log should be
exported to external storage if long-term retention is required.
