# Security checklist (OWASP mapping)

Implemented controls mapped to OWASP Top 10 (2021), OWASP API Security Top 10 (2023) and the
OWASP Top 10 for LLM applications. Status: ✅ implemented and tested · 🟡 implemented, partial or
operator-dependent · ⬜ not implemented (see "Remaining risks" in [SECURITY_AUDIT.md](SECURITY_AUDIT.md)).

## OWASP Top 10 (2021)

| Category | Control in Atrium | Where | Status |
|---|---|---|---|
| A01 Broken access control | `@Access` on every route; resource → org/website resolved from the DB; 404 for foreign ids; route inventory test (default deny) | `common/auth.guard.ts`, `common/access.service.ts`, `test/security.e2e.test.ts` | ✅ |
| | Change-based authorization of draft writes | `builder-core/change-authz.ts` | ✅ |
| | Role privilege ceiling; owners only manage owners | `organizations.service.ts` | ✅ |
| | Website-scoped members limited centrally | `access.service.ts` (`SCOPED_ORG_ROUTE`) | ✅ |
| | Organizations created by super admins only | `organizations.controller.ts`, `admin.controller.ts` | ✅ |
| A02 Cryptographic failures | argon2id passwords; AES-256-GCM credentials at rest; HMAC-SHA256 webhook signatures; hashed reset/refresh tokens; HSTS | `server-kit/crypto.ts`, `auth.service.ts` | ✅ |
| | TLS on every public host | edge (nginx/Caddy) | 🟡 operator |
| A03 Injection | Prisma parameterized queries (no string-built SQL); no shell from user input; Zod validation on every body | services, `common/zod.pipe.ts` | ✅ |
| | XSS: React escaping, `sanitizeHtml`, safe CSS values, escaped `<style>`, safe URLs, CSV formula neutralization, escaped email HTML | `renderer-core`, `schema/style.ts`, `forms.service.ts` | ✅ |
| A04 Insecure design | Separate admin and sites origins; immutable snapshots; AI as untrusted operation proposer | architecture | ✅ |
| A05 Security misconfiguration | Production refuses weak/placeholder secrets; strict CSP + security headers; hardened containers; CORS allowlist | `config/env.ts`, `next.config.ts`, `infra/` | ✅ |
| A06 Vulnerable components | `pnpm audit` gate, Renovate with review, dependency policy | `.github/workflows/security.yml`, `DEPENDENCY_POLICY.md` | ✅ |
| A07 Identification and authentication failures | Lockout; MFA with replay protection; refresh rotation + reuse detection; single-use resets; step-up for MFA changes; `__Host-` cookie | `auth.service.ts` | ✅ |
| A08 Software and data integrity failures | Pinned images and digests; checksum-verified tools in CI; immutable published snapshots with checksums | CI, `site-store/publish.ts` | ✅ |
| A09 Logging and monitoring failures | Structured logs with redaction and no query strings; audit log for security events | `common/logging.ts`, `audit.service.ts` | 🟡 alerting is operator-provided |
| A10 SSRF | Central outbound guard: DNS pinning, blocked private/metadata ranges, re-validated redirects, size caps | `providers/src/net/` | ✅ |

## OWASP API Security Top 10 (2023)

| Category | Control | Status |
|---|---|---|
| API1 Broken object level authorization | Ownership resolved from the DB per resource; website scope; tests across tenants | ✅ |
| API2 Broken authentication | Short-lived pinned JWT, rotating refresh, MFA, lockout, origin guard on auth routes | ✅ |
| API3 Broken object property level authorization | Change-based authorization; write-only secrets (masked in responses); no mass assignment, since bodies are Zod-shaped | ✅ |
| API4 Unrestricted resource consumption | Throttler (Redis); upload, zip-entry and unpacked-size limits; AI quotas and concurrency; plan limits; body limits | ✅ |
| API5 Broken function level authorization | `@SuperAdminOnly`; permission per route; MFA for platform admin | ✅ |
| API6 Unrestricted access to sensitive business flows | Form throttling, honeypot, captcha, daily invitation cap, AI quotas | 🟡 captcha is optional per form |
| API7 SSRF | Outbound guard for webhooks, providers, SMTP, AI base URLs | ✅ |
| API8 Security misconfiguration | Env validation, CSP, CORS, hardened containers | ✅ |
| API9 Improper inventory management | Route inventory test; versioned `/v1` API | ✅ |
| API10 Unsafe consumption of APIs | Provider responses size-capped; the model's output is validated and permission-filtered | ✅ |

## OWASP Top 10 for LLM applications

| Risk | Control | Status |
|---|---|---|
| LLM01 Prompt injection | Untrusted content delimited; AI output is operations only, filtered by denylist and caller permissions | ✅ |
| LLM02 Insecure output handling | Operations validated with the same schemas and sanitizers as manual edits; no code operations | ✅ |
| LLM04 Model denial of service | Atomic quota reservation, per-user stream and concurrency limits | ✅ |
| LLM06 Sensitive information disclosure | Provider keys never sent to the model or the browser; prompts exclude secrets | ✅ |
| LLM08 Excessive agency | No publish, delete, redirect or custom-code operations; explicit confirmation to apply | ✅ |

## Platform-specific checks

| Check | Status |
|---|---|
| Customer scripts never execute on the admin origin | ✅ |
| User uploads never served from the admin origin; sandboxing CSP | ✅ |
| Only verified custom domains served; TLS only after proof | ✅ |
| Super-admin tenant access audited and MFA-gated | ✅ |
| Least-privilege DB role for the app; migrations use the owner role | ✅ |
| Backups configured and restore tested | 🟡 operator (`infra/scripts/backup.sh`) |
| Secret rotation procedure documented | ✅ ([../SECURITY.md](../SECURITY.md)) |
| Central alerting on auth failures / 5xx spikes | ⬜ operator-provided |
| WAF / bot protection at the edge | ⬜ optional (e.g. Cloudflare) |
