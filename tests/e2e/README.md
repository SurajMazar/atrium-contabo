# @atrium/e2e

Playwright end-to-end tests for the full stack: registration, website creation from a template, pages,
the visual builder (selection, inspector, autosave), forms, public form submission on the renderer,
preview links and publishing.

## Run locally

```bash
pnpm atrium init                      # once: env, podman services, migrations, seed (templates)
pnpm atrium start                     # api :4000, worker, renderer :3001, admin :3000
pnpm --filter @atrium/e2e install-browsers
pnpm e2e                              # = pnpm --filter @atrium/e2e test
```

`global-setup.ts` fails fast if the API (`/v1/health/ready`), admin or renderer is not reachable.

| Variable             | Default                  | Purpose                                                                    |
| -------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `E2E_ADMIN_URL`      | `http://localhost:3000`  | admin (Playwright `baseURL`)                                               |
| `E2E_API_URL`        | `http://localhost:4000`  | API origin (specs call `/v1`)                                              |
| `E2E_RENDERER_URL`   | `http://localhost:3001`  | renderer origin (preview links)                                            |
| `E2E_SITES_DOMAIN`   | `sites.localhost:3001`   | tenant sites at `http://<slug>.<domain>` (Chromium resolves `*.localhost`) |
| `E2E_SITES_PROTOCOL` | `http`                   | `https` against staging                                                    |
| `E2E_MAILPIT_URL`    | `http://localhost:58025` | Mailpit API                                                                |
| `E2E_SKIP_EMAIL`     | —                        | `1` skips Mailpit checks                                                   |
| `E2E_PASSWORD`       | built-in                 | password used for created users                                            |

Debugging: `pnpm --filter @atrium/e2e exec playwright test --ui`, `--headed`, `--debug`, and
`pnpm --filter @atrium/e2e exec playwright show-report` (traces are recorded on the first retry).

## Conventions

- Every test creates its own user (`POST /v1/auth/register`) and website through the API
  (`fixtures/api.ts`); the UI is used only for the behavior under test.
- Unique data everywhere (`e2e+<timestamp>-<rand>@atrium.test`, random slugs) — tests never depend on each other.
- Web-first assertions and `expect.poll` instead of sleeps. The one deliberate wait is before submitting
  a public form, because spam scoring treats instant submissions as bots.
- Selectors are accessible names/labels from the admin source (`Create account`, `Website name`,
  `New page`, `Create form`, `Publish`, the `Page canvas` iframe and `data-node-id` nodes).

## CI

`.github/workflows/ci.yml` runs the suite nightly and on manual dispatch: PostgreSQL, Redis and Mailpit
service containers, `pnpm build`, migrations + seed, `pnpm atrium start --prod --detach --no-infra`, then
`pnpm e2e`; the HTML report and traces are uploaded as artifacts.
