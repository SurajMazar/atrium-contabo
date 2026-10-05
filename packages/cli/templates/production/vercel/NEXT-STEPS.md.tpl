# Atrium admin + renderer on Vercel — {{domain}}

Generated {{generatedAt}}. Guides: {{doc}} and docs/VERCEL.md (independent per-site deployments).

The **API and worker do not run on Vercel** (long-lived BullMQ consumers, websockets/SSE, sharp).
Host them on a container platform first (`atrium setup production --target fly|render|railway|aws|podman`)
and make https://{{apiHost}} reachable.

## Two Vercel projects from this monorepo
| Project | Root Directory | Domains | Env file |
|---|---|---|---|
| atrium-admin | `apps/admin` | {{adminHost}} | `env.admin` |
| atrium-renderer | `apps/renderer` | {{sitesDomain}}, `*.{{sitesDomain}}`, customer domains | `env.renderer` |

1. `vercel link` in each app folder (or import the repo in the dashboard and set Root Directory).
   Copy `admin/vercel.json` → `apps/admin/vercel.json` and `renderer/vercel.json` → `apps/renderer/vercel.json`
   (or set the same build/install commands in Project Settings). Enable "Include files outside the root directory".
2. Environment variables: `vercel env add <KEY> production < value` for each line of `env.admin` / `env.renderer`
   — ATRIUM_API_INTERNAL_URL must be the **public** API URL here (https://{{apiHost}}); the admin proxies `/api/*` to it.
3. Wildcard domain for the multi-tenant renderer requires the domain's nameservers on Vercel
   (`vercel domains add {{sitesDomain}}` then add `*.{{sitesDomain}}` to the project).
4. On publish the API calls the renderer's `POST /api/revalidate` with `X-Renderer-Secret` — set RENDERER_URL=https://{{sitesDomain}} on the API.
5. CI: .github/workflows/deploy-vercel.yml (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID_ADMIN/RENDERER secrets).
