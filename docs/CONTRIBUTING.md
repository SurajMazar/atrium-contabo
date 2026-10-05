# Contributing

## Development setup

Requirements: Node.js 24 (≥ 22.12), pnpm 10 (`corepack enable`), Podman (or Docker) with compose, git.

```bash
pnpm install
pnpm atrium init        # .env with secrets, podman services, build, migrate, seed
pnpm atrium start       # api :4000, worker, renderer :3001, admin :3000
pnpm atrium doctor      # when something is off
```

Details and troubleshooting: [deployment/local-podman.md](deployment/local-podman.md). Useful while
developing:

| Task                                | Command                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Run one app                         | `pnpm atrium start --only api` or `pnpm --filter @atrium/api dev`                  |
| Rebuild libraries on change         | `pnpm turbo watch build --filter=./packages/*`                                     |
| Type-check / lint / test everything | `pnpm typecheck`, `pnpm lint`, `pnpm test`                                         |
| One package                         | `pnpm --filter @atrium/builder-core test`                                          |
| Format                              | `pnpm format` (Prettier; CI runs `pnpm format:check`)                              |
| Database console / REPL             | `pnpm atrium db console`, `pnpm atrium console`                                    |
| End-to-end tests                    | `pnpm e2e` against a running stack ([tests/e2e/README.md](../tests/e2e/README.md)) |

## Repository conventions

- **Packages first.** Shared logic lives in `packages/*`; apps stay thin. Contracts (`schema`) and engines
  (`builder-core`, `component-registry`) must remain framework-agnostic (no Node-only or React APIs in
  code that runs in the browser and on the server).
- **TypeScript strict** with `noUncheckedIndexedAccess`; ESM packages built with tsup (ESM + CJS + d.ts).
- **Validate at boundaries with zod.** API inputs, queue payloads (`server-kit/queues.ts`), provider
  configs, component props.
- **Tenancy is not optional.** Every new endpoint resolves ownership through `AccessService` and checks a
  permission key; new permissions go into `packages/schema/src/permissions.ts` and the default roles.
- **Secrets** go in a driver's `secretsSchema` (encrypted, write-only) — never in `config`, logs or errors.
- **Database changes** need a migration (`pnpm atrium migrate --dev --name <change>`), must be backward
  compatible with the previous release (expand → contract), and must not edit applied migrations.
- **Long work goes to the worker** as a typed job (`JOB_SCHEMAS` in `server-kit/queues.ts`) — keep request
  handlers fast.
- **Docs** live in `docs/`; update the relevant guide in the same change.

## Commits and pull requests

- Conventional Commits: `feat(builder): …`, `fix(api): …`, `docs: …`, `chore(infra): …`; scopes are app or
  package names.
- Small, focused PRs with a description of the change, how it was tested, and screenshots for UI.
- CI must pass: format, lint, typecheck, unit tests, build, migration drift check, Kubernetes/compose
  manifest validation. Add or update tests for behavior changes.
- Breaking API or schema changes need a migration note in the PR and in the relevant doc.

## Testing

| Level      | Where                                                    | Tooling                    |
| ---------- | -------------------------------------------------------- | -------------------------- |
| Unit       | `*.test.ts` next to the code in packages and apps        | Vitest                     |
| API        | `apps/api` tests with Nest testing utilities + supertest | Vitest                     |
| End to end | `tests/e2e/specs` against a running stack                | Playwright (nightly in CI) |

Prefer testing behavior through public functions; for builder-core, assert on documents before/after
operations; for providers, mock HTTP at the `http.ts` helper boundary.

## Adding a component

```bash
pnpm atrium new-component pricing-table --category marketing          # section
pnpm atrium new-component room-card --level block                       # block inside sections
```

This writes the registry definition (`packages/component-registry/src/components/<type>.ts`), a test, and
a React renderer (`packages/renderer-core/src/components/<type>.tsx`). Then:

1. Add the definition to `BUILTIN_COMPONENTS` in `packages/component-registry/src/index.ts`.
2. Map the type to the renderer in renderer-core's component map; style with theme tokens.
3. Fill in `description`, variants and the `ai.useWhen/avoidWhen` hints — the AI agent relies on them.
4. Run the registry tests. Conventions for props, controls and variants: [COMPONENTS.md](COMPONENTS.md).

## Adding a provider driver

```bash
pnpm atrium new-provider email brevo          # email | sms | storage | ai | deployment | captcha
```

The scaffold implements the kind's interface (`packages/providers/src/<kind>/types.ts`) with TODOs and a
test. Add the driver to the kind's list in `packages/providers/src/<kind>/index.ts`; the admin renders its
configuration form from the zod schemas and exposes `test()`. Keep network errors as `ProviderError`
(`retryable` for 429/5xx) so queues retry correctly, and make captcha drivers fail closed.

## Plugins

```bash
pnpm atrium new-plugin hotel-kit
pnpm atrium new-component room-card --level block --plugin hotel-kit    # type becomes hotel-kit-room-card
pnpm atrium new-provider sms msg91 --plugin hotel-kit
```

`plugins/<name>` is a workspace package (`@atrium-plugin/<name>`; `plugins/*` is added to
`pnpm-workspace.yaml`) exporting `definePlugin({ name, version, components, renderers, providers })` and a
`registerPlugin(plugin, host)` helper. Component types must be prefixed with the plugin name. To load a
plugin, add `"@atrium-plugin/<name>": "workspace:*"` to the hosts that need it (API and worker for
definitions/providers, renderer and admin for renderers) and call `registerPlugin` with the host's registry
during startup. Host-side plugin discovery is not automatic yet; wiring is explicit per app.

## CLI development

`packages/cli` — commands in `src/commands/*`, shared logic in `src/lib/*`, templates in `templates/`.
`pnpm --filter @atrium/cli test` runs its tests; `ATRIUM_CLI_FROM_SOURCE=1 pnpm atrium …` runs the
TypeScript sources without building. Commands must work non-interactively (`--yes`, `CI=true`), never print
secrets, and give a hint with every error.

## Security issues

Do not open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md#responsible-disclosure).
