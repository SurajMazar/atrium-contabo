# Dependency & supply-chain policy

This document is the source of truth for how Atrium handles third-party code: npm packages, container
images, GitHub Actions and the CLIs our pipelines download. It also justifies every vulnerability we
knowingly accept. The checks live in [`.github/workflows/security.yml`](../../.github/workflows/security.yml).

## What runs, and where

| Check                               | Where                                 | Local equivalent                                                | Fails on                                                                         |
| ----------------------------------- | ------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm audit --prod`                 | `security.yml` → `audit`              | `pnpm audit:deps`                                               | high / critical advisories in production dependencies, minus the allowlist below |
| gitleaks, full git history          | `security.yml` → `secrets`            | `pnpm scan:secrets`                                             | any finding not covered by [`.gitleaks.toml`](../../.gitleaks.toml)              |
| CodeQL `security-extended` (JS/TS)  | `security.yml` → `codeql`             | —                                                               | alerts appear in _Security → Code scanning_                                      |
| Trivy config (IaC) scan of `infra/` | `security.yml` → `trivy-config`       | `trivy config --severity HIGH,CRITICAL infra`                   | HIGH / CRITICAL misconfigurations                                                |
| API security regression tests       | `security.yml` → `api-security-tests` | `pnpm test:security` (needs Postgres + Redis: `pnpm infra:up`)  | any failing API test (incl. `apps/api/test/security.e2e.test.ts`)                |
| Trivy image scan                    | `ci.yml` → `images` (before push)     | `trivy image --ignore-unfixed --severity HIGH,CRITICAL <image>` | **fixable** HIGH / CRITICAL CVEs in any published image                          |

`security.yml` runs on every push to `main`, every pull request, weekly (Monday 03:23 UTC — new advisories
appear without any code change) and on demand.

### Local tooling

- `pnpm audit:deps` — no extra install.
- `pnpm scan:secrets` — requires **gitleaks ≥ 8.19** on your `PATH` (`brew install gitleaks`, or a release
  binary from <https://github.com/gitleaks/gitleaks/releases>; verify it against the release
  `checksums.txt`). The script uses the `gitleaks git …` syntax; the pre-8.19 `gitleaks detect` command is
  deprecated. CI pins **v8.30.1**. To scan uncommitted files too: `gitleaks dir --no-banner --redact --config .gitleaks.toml .`
- `pnpm test:security` — runs only `apps/api/test/security.e2e.test.ts`; set `REQUIRE_DB=1` to make it fail
  (instead of skip) when the database is unreachable.

## Pinning rules

1. **GitHub Actions** are referenced by full 40-character commit SHA with a `# vX.Y.Z` comment
   (`uses: actions/checkout@<sha> # v4.4.0`). Tags are mutable — in March 2026 most tags of
   `aquasecurity/trivy-action` were force-pushed to malicious commits; SHA pins were unaffected.
   Annotated tags must be dereferenced to the **commit** SHA (`git ls-remote --tags <repo>` → the `^{}` line).
2. **Container images** in workflows are pinned `name:tag@sha256:…`. Renovate's `docker:pinDigests`
   keeps digests current (Containerfiles, compose, Kubernetes, Quadlet units via a regex manager).
3. **Downloaded binaries** (gitleaks, kubeconform) are fetched from a pinned release URL and verified
   against a sha256 that is **committed in the workflow** (copied from the release checksums file), never
   one fetched at run time.
4. **Global npm CLIs** in CI (`vercel`) are installed at an exact version with `--ignore-scripts`; Renovate
   bumps them through a `customManagers` entry.
5. Workflows default to `permissions: contents: read`; jobs request more only when needed (e.g. only the
   ECS deploy job has `id-token: write`). `actions/checkout` always uses `persist-credentials: false`.
   Inputs, secrets and vars reach shell scripts only through `env:` — never `${{ }}` inside `run:`.
   Lint workflows with `uvx zizmor .github/workflows` (config: `.github/zizmor.yml`) and `actionlint`.

## Renovate

[`renovate.json`](../../renovate.json) is the only dependency bot (no Dependabot version updates).

- Normal updates: **before 6am UTC on Mondays**, grouped (monorepos, NestJS, Prisma, Next.js, React,
  Radix UI, Vitest, Turborepo, typescript-eslint), lockfile maintenance weekly, `pnpm dedupe` after updates.
- New npm releases must be **3 days old** (`minimumReleaseAge`) before Renovate proposes them — this blunts
  "publish a malicious version and wait" attacks.
- **Major** updates wait for approval on the Dependency Dashboard issue.
- **Security** updates (GitHub advisories + OSV) bypass the schedule and release-age delay and are labelled
  `security`. They are reviewed within **2 business days** (critical: same day).

## Vulnerability triage

When `pnpm audit` (or Trivy) fails:

1. **Upgrade** if a fixed version exists and is reachable through our ranges (`pnpm update <pkg> -r`, or wait
   for/merge the Renovate security PR).
2. If the fix is only blocked by an exact pin in an intermediate package, prefer a scoped
   `pnpm.overrides` / `pnpm-workspace.yaml` `overrides` entry (owner of that file decides) over ignoring.
3. **Accept** only when the vulnerable code is genuinely unreachable in how we use it, and there is no
   reasonable upgrade path. Then:
   - add the GHSA id to `pnpm.auditConfig.ignoreGhsas` in the root `package.json`
     (pnpm 10.21 honours it there — verified: `pnpm audit` reports them as "ignored");
   - add a row to the table below with the reachability reasoning and a review-by date ≤ 90 days out;
   - get a second reviewer on the PR.
4. Never allowlist by package name or by severity; always by GHSA id, so a _new_ advisory on the same
   package still fails the build.

**Removing an entry:** when the dependency is upgraded past the patched version (or the review date passes
and the reasoning no longer holds), delete the GHSA from `ignoreGhsas` _and_ its row here in the same PR.
The weekly scheduled run keeps reporting it if the ignore is removed prematurely.

**Review cadence:** every accepted advisory is re-reviewed by its review-by date, and the whole table is
re-checked at least quarterly.

## Accepted advisories (`pnpm.auditConfig.ignoreGhsas`)

| Package                                                                                    | Advisory                                                                                                                                                             | Current version | Patched version | Reachable?                                                                                                                                                                                                                                                                                                                                                                                       | Decision                                                                                                             | Review by  |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| `mysql2` (via `@prisma/client` → peer `prisma` 7.10.0, which pins `mysql2@3.15.3` exactly) | [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) — auth-plugin downgrade to `mysql_clear_password` leaks plaintext credentials (no CVE yet)  | 3.15.3          | ≥ 3.22.0        | **No.** Only the Prisma _CLI_ depends on `mysql2` (MySQL support in Studio/dev tooling). Our datasource is PostgreSQL only (`packages/db/prisma/schema.prisma`, `@prisma/adapter-pg`); no Atrium code imports `mysql2` and no process ever opens a MySQL connection, so a rogue MySQL server cannot be reached. The latest Prisma 7.x (7.10.0) still pins 3.15.3; Prisma 8 drops the dependency. | Accept until Prisma ships a fixed pin or we move to Prisma 8 (alternatively an `overrides` entry `mysql2: ^3.22.0`). | 2027-01-05 |
| `deepmerge-ts` (via `prisma` → `@prisma/config` 7.10.0, pinned `7.1.5`)                    | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) / CVE-2026-40345 — stack exhaustion when merging recursive (self-referencing) object graphs | 7.1.5           | ≥ 8.0.0         | **No.** `@prisma/config` only merges Prisma configuration objects loaded from our own `packages/db/prisma.config.ts` during CLI runs (`generate`, `migrate deploy`). No request data or other attacker-controlled object ever reaches it; worst case is a crash of a developer/CI CLI invocation on a malformed config we wrote. Not used by the API/worker at runtime.                          | Accept; fix needs a major bump of the transitive (8.x), which only Prisma can ship.                                  | 2027-01-05 |

### Open findings that are _not_ accepted

These intentionally still fail `pnpm audit:deps` / the `audit` job until fixed:

| Package        | Advisory                                                                                                                                                                                                          | Path                                                                                                         | Status                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sharp` 0.34.5 | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) (libvips CVE-2026-33327/-33328/-35590/-35591), [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) (libheif) — high | `tools/tutorial` → `kokoro-js` → `@huggingface/transformers` → `sharp` (apps already resolve `sharp` 0.35.5) | **Being upgraded** (separate change). Not to be allowlisted: sharp processes untrusted image input.                                                                                                      |
| `nodemailer`   | —                                                                                                                                                                                                                 | `packages/providers`                                                                                         | **Being upgraded** (separate change); no open advisory against the current `^10.0.6` range at the time of writing. Never allowlist nodemailer advisories — it handles user-controlled addresses/headers. |

Moderate advisories (below the `high` gate, not ignored, tracked via Renovate):
`uuid` 8.3.2 via `exceljs` ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), CVE-2026-41907),
`mysql2` 3.15.3 via `prisma` ([GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), not reachable for the same reason as above),
`js-yaml` 5.3.0 via `@nestjs/swagger` ([GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm)).

## Secret scanning

- [`.gitleaks.toml`](../../.gitleaks.toml) extends the upstream default rules and allowlists only:
  example env files (`.env.example`, `*.env.example`, `secrets*.example.env`), the local-only SeaweedFS
  identities (`infra/seaweedfs/s3.json`), `pnpm-lock.yaml`, test-fixture directories
  (`packages/cli/src/__tests__/`, `packages/*/test/`, `apps/*/test/`, `tests/`), and the documented placeholder
  values (`change-me…`, the example `ENCRYPTION_KEY`, `atrium-secret`).
- Never widen the allowlist to make a real finding pass. If a real secret is found: **rotate it first**, then
  remove it from the tree; rewriting git history is a separate, explicit decision.
- Generated local files (`.env`, `deploy/`, `tools/tutorial/.cache/`, `.next*`) are git-ignored and must stay so.

## Deploy credentials

- VPS deploys require the `DEPLOY_SSH_KNOWN_HOSTS` environment secret (host-key pinning, no
  trust-on-first-use). Generate it with `ssh-keyscan -t ed25519 <host>` and verify the fingerprint
  out-of-band (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server console) before saving.
- The Vercel token is passed via the `VERCEL_TOKEN` environment variable only, never as `--token`.
- AWS uses OIDC (`id-token: write` on the ECS job only) — no long-lived access keys.
