# Security audit

Audit of the Atrium platform (API, admin, renderer, worker, shared packages and infrastructure),
carried out on 2026-10-05 and continued on 2026-10-06. Every finding below is fixed in the code
unless its status says otherwise; regression tests are listed per finding. No secrets are included.

Related: [THREAT_MODEL.md](THREAT_MODEL.md) · [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) ·
[SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) · [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md).

## 1. Executive summary

| Severity | Found | Fixed | Accepted / open |
|---|---|---|---|
| Critical | 4 | 4 | 0 |
| High | 12 | 12 | 0 |
| Medium | 11 | 9 | 2 |
| Low | 18 | 13 | 5 |

Counts cover the findings listed below. Pass 1 lists its main findings; smaller hardening changes
made alongside them (for example headers, log redaction and production secret validation) are
grouped under those entries rather than counted separately.

**Pass 1 (2026-10-05)** covered every area of the audit brief. It fixed:
- authorization by role instead of by change;
- privilege escalation through roles;
- cross-tenant reach through IDs in requests;
- weak session handling;
- unsafe uploads and SVG;
- SSRF through webhooks and providers;
- CSS and HTML injection;
- AI tool privilege;
- infrastructure and CI gaps.

**Pass 2 (2026-10-06)** re-audited the code added since: Website Manager scoping, member creation,
organization creation, startup bootstrap, dashboard branding and the larger upload limits. It also
went deeper on forms, webhooks, workers, resource limits, public endpoints and secrets.

## 2. Critical and high fixes

### Pass 1 (2026-10-05)

| ID | Title | Severity | Component | Fix | Tests |
|---|---|---|---|---|---|
| AUD-01 | Draft writes authorized by route permission only | Critical | API drafts, AI apply | Every draft write (editor operations, autosave, restores, AI apply/revert) is diffed and each kind of change needs its own permission (`code.manage`, `theme.update`, `page.publish`, …) | `security.e2e`: editor cannot inject code/theme/redirects/forms; AI apply authorized like a manual edit |
| AUD-02 | Role escalation through role editing and assignment | Critical | Organizations | Privilege ceiling: grant only permissions you hold; only owners manage owners; last owner protected | `security.e2e`: admin cannot escalate to owner, invite above own rank |
| AUD-03 | Cross-tenant ids accepted in tenant-owned requests | Critical | Access service | Ownership resolved from the DB for every resource; website scope on org routes; deleted-website children unreachable | `security.e2e`: tenant B cannot smuggle tenant A ids |
| AUD-04 | Customer code able to run on the admin origin | Critical | Editor, uploads | Editor never executes site scripts; embeds as placeholders; uploads served from API/media origin with sandbox CSP; SVG allowlist sanitizer | unit: SVG sanitizer, type sniffing |
| AUD-05 | No account lockout / MFA brute force / TOTP replay | High | Auth | Per-account lockout, MFA attempt limits, TOTP replay protection | `security.e2e`: lockout, MFA burn and replay |
| AUD-06 | Refresh-token theft undetectable | High | Auth | Rotation with compare-and-swap and reuse detection revoking the family | `security.e2e`: reuse revokes session |
| AUD-07 | Reset links reusable | High | Auth | Single-use, hashed, newest-only; resets revoke all sessions | `security.e2e` |
| AUD-08 | SSRF via webhooks, providers, SMTP, AI base URLs | High | Outbound | Central guard: DNS-pinned, private/metadata ranges blocked, redirects re-validated, body caps | worker `processors.test` |
| AUD-09 | CSS/HTML breakout through styles, theme tokens and custom CSS | High | Schema, renderer | Safe CSS grammar, strict vs lenient schemas, `escapeCssForHtml`, `sanitizeHtml` | `schema/security.test`, `renderer-core/security.test` |
| AUD-10 | AI agent could emit privileged operations | High | Agent | Operation and settings denylists, caller-permission filtering, confirmation on apply, atomic quotas | `security.e2e` AI cases |
| AUD-11 | Unverified custom domains served | High | Domains | Only TXT-verified domains are served or get TLS | `security.e2e` |

### Pass 2 (2026-10-06)

**AUD-20 · Startup bootstrap could promote an attacker's account to super admin** — High
- **Component:** `apps/api/src/common/bootstrap.service.ts`, `apps/api/scripts/seed.ts`.
- **Attack:** while the platform had no super admin, anyone could register `SEED_ADMIN_EMAIL` through
  open sign-up. The next restart (or seed) promoted that account.
- **Root cause:** promotion based on an email match alone.
- **Fix:** an existing account is promoted only if its password is `SEED_ADMIN_PASSWORD`, and its
  sessions are revoked; otherwise it logs an error (the seed refuses).
- **Tests:** `website-manager.e2e` › bootstrap never promotes an unproven account.
- **Status:** fixed.

**AUD-21 · New-organization owner bound to a squatted account** — High
- **Component:** `POST /admin/organizations`.
- **Attack:** an attacker pre-registers a future client's email. The super admin creates the
  client's organization with that email, and the attacker becomes owner.
- **Fix:** existing accounts receive an owner invitation, which requires a verified email to
  accept; they are never attached directly.
- **Tests:** `website-manager.e2e` › squatted account gets an invitation.
- **Status:** fixed.

**AUD-22 · Any tenant's site or preview served on another tenant's domain** — High
- **Component:** `apps/renderer/proxy.platform.ts`.
- **Attack:** `https://victim.com/_site/evil/` or `/_preview/<token>/` rendered the attacker's
  site, scripts included, on the victim's origin and certificate.
- **Fix:**
  - `/_site` is disabled in production;
  - `/_preview` is served only on the preview host;
  - other hosts get `/__blocked`;
  - `X-Forwarded-Host` is ignored unless `ATRIUM_TRUST_FORWARDED_HOST=1`.
- **Tests:** `apps/renderer/proxy.platform.test.ts` (6).
- **Status:** fixed.

**AUD-23 · Deployments marked domains verified without proof of ownership** — High
- **Component:** `apps/worker/src/processors/deployments.ts`.
- **Attack:** dangling-DNS takeover. An attacker adds a hostname still pointing at the platform
  and runs a deployment; the provider's "DNS points here" set `verifiedAt` and the domain went live.
- **Fix:** deployments update DNS and SSL status only. `verifiedAt` comes exclusively from the TXT
  check, and only proven domains become active.
- **Tests:** worker `processors.test` › deployment domains.
- **Status:** fixed.

**AUD-24 · Zip bomb in site import exhausts API memory** — High
- **Component:** `packages/exporter/src/zip.ts`.
- **Attack:** a ≤300 MB zip that expands to hundreds of GB; each entry was inflated fully before
  the size check ran.
- **Fix:** the entry count is checked from the end-of-central-directory record before parsing,
  declared sizes before inflating, and every entry is inflated as a stream against the remaining
  budget.
- **Tests:** `exporter/test/zip-limits.test.ts` (4).
- **Status:** fixed.

## 3. Medium and low findings (pass 2)

| ID | Title | Severity | Fix | Tests | Status |
|---|---|---|---|---|---|
| AUD-30 | Admin-created accounts keep a password the admin knows | Medium | `password_change_required` flag: the API allows only `/auth/*` until the person sets their own password (admin shows a "Choose your password" screen); cleared by change or reset | `website-manager.e2e` add-member | Fixed |
| AUD-31 | Admin proxy buffered up to 310 MB per request before authentication | Medium | Streaming route handlers for imports and media uploads; generic proxy back to 25 MB; nginx/Caddy allow 310 MB only on those two paths | manual: unauthenticated 31 MB upload refused in 0.03 s | Fixed |
| AUD-32 | Preview passwords guessable without limit (and argon2 per guess) | Medium | 10 failures per link per 15 min then 429; correct password cached 10 min; minimum 8 characters | `website-manager.e2e` audit fixes | Fixed |
| AUD-33 | Public form endpoint buffered uploads before checking the form | Medium | `FormUploadGate` runs before multipart parsing: unknown form → 404, no file fields → 400, Content-Length above the form's limits → 413, max 8 concurrent multipart parses | `website-manager.e2e` audit fixes | Fixed |
| AUD-34 | Legacy `atrium_rt` cookie readable in production (sibling-subdomain session fixation) | Medium | Never read the legacy name when the `__Host-` cookie is in use | unit/e2e auth suite | Fixed |
| AUD-35 | `webhook.manage` exposed all form submissions | Medium | Subscribing to `form.*`/`*` and reading form delivery payloads need `submission.read`; max 50 webhooks per org | `website-manager.e2e` webhooks | Fixed |
| AUD-36 | Docs recommended `TRUST_PROXY=true` (spoofable client IP, rate limits bypassed) | Medium | Docs corrected; `atrium setup check` fails on `true` | CLI tests | Fixed |
| AUD-37 | One tenant could stall shared form/webhook queues | Medium | Max 20 rules per form and 10 actions per rule (save-time and in the worker); webhook cap per org | worker tests | Fixed |
| AUD-38 | Platform email used to send tenant-written mail to anyone | Medium | Without an own email provider, notifications go only to organization members | worker `forms.test` | Fixed |
| AUD-39 | Changing the password had no lockout | Low | Throttle 5/min + per-account counter shared with sign-in; same for step-up passwords | auth e2e | Fixed |
| AUD-40 | AI progress stream: unpinned JWT, `?access_token=`, no super-admin MFA | Low | Pinned alg/iss/aud, header only, MFA required for super-admin override | security e2e | Fixed |
| AUD-41 | No atomic "sign out other sessions" | Low | `POST /auth/sessions/revoke-others` (audited) | route inventory | Fixed |
| AUD-42 | Website Managers could create websites by cloning | Low | Clone requires `website.create` in the organization | `website-manager.e2e` | Fixed |
| AUD-43 | `POST /organizations` skipped super-admin MFA and audit | Low | `@SuperAdminOnly()` + audit entry | e2e | Fixed |
| AUD-44 | Scoped members could file media into other websites' folders | Low | Folder must belong to one of their websites | — | Fixed |
| AUD-45 | Owners could be scoped to specific websites | Low | Owners always have access to every website | `website-manager.e2e` | Fixed |
| AUD-46 | Scoped members could read roles and org-wide AI spend | Low | `assertOrganizationWide` on both | `website-manager.e2e` | Fixed |
| AUD-47 | Exported projects shipped form rules (recipients, webhook URLs) | Low | Rules stripped from exported snapshots | exporter test | Fixed |
| AUD-48 | Open redirect via backslash in wildcard redirects | Low | Wildcard part encoded; `/\` destinations treated as unsafe | `renderer-core` routing test | Fixed |
| AUD-49 | Captcha tokens not bound to the site's hostnames | Low | In production, expected hostnames = platform subdomain + verified domains | — | Fixed |
| AUD-50 | Form rule "assign" accepted non-members | Low | Assignee must be an organization member | — | Fixed |
| AUD-51 | Invitation acceptance did not re-check seats | Low | Seat limit re-checked on accept | — | Fixed |
| AUD-52 | Plan limits checked then created without a lock (TOCTOU) | Medium | — | — | Open (see remaining risks) |
| AUD-53 | Analytics collection accepts any `websiteId` | Medium | — | — | Accepted (data pollution only; throttled) |
| AUD-54 | Preview password kept in a 24 h HttpOnly cookie | Low | Mitigated by AUD-32 caching and lockout | — | Accepted |
| AUD-55 | Site import holds the uploaded zip in API memory (authenticated) | Low | — | — | Accepted (authenticated, 300 MB cap) |
| AUD-56 | No webhook secret rotation endpoint | Low | — | — | Open |
| AUD-57 | Admin CSP allows `script-src 'unsafe-inline'` | Low | — | — | Open (requires nonce-based CSP in Next) |
| AUD-58 | Website Managers can set dashboard branding (support URL) seen by owners in that website | Low | — | — | Accepted (owners can override; audited) |

## 4. Files changed (major)

**Authorization and tenancy**
- `apps/api/src/common/{access.service,auth.guard,bootstrap.service,passwords,http}.ts`
- `apps/api/src/modules/{organizations,admin,media,webhooks,ai,branding,websites}/*`

**Authentication**
- `apps/api/src/modules/auth/*`
- `apps/admin/src/components/account/{password-change-gate,mfa-section,sessions-section}.tsx`

**Public surface**
- `apps/api/src/modules/public/{public.controller,public.service,form-upload.gate}.ts`
- `apps/api/src/modules/publishing/*`
- `apps/renderer/proxy.platform.ts`
- `apps/renderer/lib/site.tsx`

**Worker**
- `apps/worker/src/processors/{deployments,forms}.ts`

**Packages**
- `packages/exporter/src/{zip,next-project}.ts`
- `packages/renderer-core/src/routing.ts`
- `packages/schema/src/{forms,permissions,events}.ts`
- `packages/builder-core/src/operations.ts`

**Infrastructure**
- `infra/compose.prod.yaml`, `infra/caddy/Caddyfile`, `infra/nginx/atrium.conf`
- `apps/admin/next.config.ts`, `apps/admin/src/lib/stream-proxy.ts`

**Database migrations** (additive only)
- `20261006120000_website_branding_scoped_invites`
- `20261006140000_password_change_required`

## 5. Tests added

- **`apps/api/test/security.e2e.test.ts`** (pass 1): tenant isolation, role matrix, auth hardening,
  route inventory (default deny), CSS/prototype pollution.
- **`apps/api/test/website-manager.e2e.test.ts`** (pass 2):
  - website scoping;
  - invitations with website access;
  - add member and forced password change;
  - super-admin-only organizations and invitation for existing accounts;
  - dashboard branding;
  - bootstrap safety;
  - clone, owner scoping, preview lockout and form gate;
  - webhook submission permission.
- **`apps/renderer/proxy.platform.test.ts`**: tenant routing in production and development.
- **`apps/worker/test/processors.test.ts`, `forms.test.ts`**: domain verification,
  team-only platform email.
- **`packages/exporter/test/zip-limits.test.ts`**: zip bomb, declared sizes, entry flood;
  exporter strips form rules.
- **`packages/renderer-core/test/routing.test.ts`**: backslash open redirect.
- **`packages/schema/src/security.test.ts`**, **`packages/component-registry/src/security.test.ts`**,
  **`apps/api/src/common/security.unit.test.ts`** (pass 1).

## 6. Architecture improvements

- **Change-based authorization:** permissions follow what a change does, not which route it uses.
- **Central website scoping:** the rules live in `AccessService`; organizations are created only by
  super admins.
- **Draft vs live isolation:** the renderer reads only immutable snapshots; drafts render only on
  the preview host.
- **One outbound guard** for every tenant-configured URL.
- **Streaming large uploads:** nothing large is buffered before authentication.
- **App-only production compose:** backing services are bring-your-own, and the API bootstraps
  safely on start.

## 7. Remaining risks

- **AUD-52 plan-limit races**: parallel requests can exceed website, member, domain or storage
  limits. Plan: check and insert under `pg_advisory_xact_lock(org)`; count submission attachments
  toward storage; enforce `submissionsPerMonth`.
- **AUD-53 analytics pollution**: validate `Origin` against the site's hosts and skip suspended sites.
- **AUD-56 webhook secret rotation**: add a rotate endpoint with an overlap window.
- **AUD-57 CSP**: move the admin to nonce-based `script-src`.
- **Operational**: secret rotation drills, backup restore tests, alerting on auth failures and 5xx,
  an edge WAF or bot protection, and export of the audit log to external storage.
- **Tests and local data**: the e2e suites write to the development database; run them against a
  separate test database.

## 8. Manual verification required

| Needs | Check |
|---|---|
| Production environment | `atrium setup check --env-file .env` reports ready; `TRUST_PROXY` is a hop count or subnet list; the super admin has MFA |
| DNS provider | TXT verification works; the wildcard and apex sites records exist; no dangling records for removed domains |
| Real TLS | Certificates for admin, api, `<sites>` and `*.<sites>`; HSTS present; customer domains only after proof |
| Email provider | Platform SMTP works for resets and invitations; tenant form mail goes only to the team without an own provider |
| SMS provider | Per-recipient and per-org limits hold |
| Vercel / cloud account | Deploy tokens stored encrypted; exported projects contain no form rules |
| Reverse proxy | 310 MB only on the import and upload paths; 25 MB elsewhere on admin; `Host` passed through |

## 9. Commands

```bash
pnpm lint
pnpm turbo run test
REQUIRE_DB=1 pnpm --filter @atrium/api test        # API incl. security regression suites
pnpm audit --prod --audit-level=high               # dependency audit
gitleaks git --redact --config .gitleaks.toml .    # secret scan
pnpm build
```
