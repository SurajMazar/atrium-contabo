# Architecture

## Principles

1. **Schema-driven.** A website is data: settings, theme tokens, navigation, header/footer and pages whose
   documents are trees of typed nodes (`@atrium/schema`). Nothing about a site lives in code.
2. **Component-driven.** Every node type is a registry definition (`@atrium/component-registry`): zod
   props with defaults, inspector controls, variants, allowed children, animation presets and AI hints.
   The builder renders its inspector from the definition, the API validates against it, the renderer
   receives parsed props, and the AI agent reads its catalog.
3. **Configuration- and theme-driven.** Styling flows from design tokens (`@atrium/design-tokens`) compiled
   to CSS variables; components use tokens, so a theme change restyles every site consistently.
4. **Provider-driven.** Storage, email, SMS, AI, deployment, captcha and search sit behind interfaces in
   `@atrium/providers`. Business logic asks the provider resolver (`@atrium/server-kit`) for an instance;
   organizations can bring their own credentials (encrypted at rest).
5. **AI is another operator of the builder API.** The agent changes sites only through serializable,
   validated `SiteOperation`s (`@atrium/builder-core`) — the same operations the builder and SDK send.
   Every operation is permission-checked and versioned and can be reverted. The agent has no database,
   shell or file access.
6. **Immutable publishing.** Publishing freezes a `WebsiteVersion` snapshot; the renderer only ever serves
   snapshots, so drafts never leak and rollback is "publish an older snapshot".

## System overview

```mermaid
flowchart TB
  subgraph Browser
    ED[Editor in admin/builder]
    VIS[Visitor]
  end
  subgraph Edge
    PX[Caddy / Ingress / ALB / Vercel]
  end
  subgraph Apps
    ADM[admin · Next.js]
    REN[renderer · Next.js]
    API[api · NestJS /v1]
    WK[worker · BullMQ]
  end
  subgraph Data
    PG[(PostgreSQL)]
    RD[(Redis)]
    OBJ[(Object storage)]
  end
  subgraph External
    MAIL[SMTP / email APIs]
    SMS[SMS gateways]
    AI[Anthropic / OpenAI / Gemini]
    DEP[Vercel / Netlify / Cloudflare Pages]
    HOOK[Customer webhooks]
  end
  ED --> PX --> ADM
  VIS --> PX --> REN
  ADM -- "/api/* (same origin)" --> API
  REN -- "resolve snapshot (X-Renderer-Secret)" --> API
  API -- "POST /api/revalidate" --> REN
  API --> PG & RD & OBJ
  API -- enqueue --> RD
  RD -- jobs --> WK
  WK --> PG & OBJ
  WK --> MAIL & SMS & AI & DEP & HOOK
```

## Module boundaries

| Layer          | Packages                                                                                                                            | Depends on          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Contracts      | `schema` (site/page/node/form/theme schemas, permissions, plans), `design-tokens`, `animations`                                     | zod                 |
| Domain engines | `component-registry`, `builder-core` (tree ops, SiteOperations, validation, SEO, link scan, diff), `templates` (blueprints)         | contracts           |
| Rendering      | `renderer-core` (React renderers for every component, page/site rendering)                                                          | contracts, registry |
| Integration    | `providers` (drivers), `server-kit` (env, encryption, queue contracts, provider resolver, logger), `exporter`, `agent`, `db`, `sdk` | contracts           |
| Apps           | `api`, `worker`, `renderer`, `admin`                                                                                                | everything above    |

Rules: contracts and engines are framework-agnostic and shared by browser and server; only `server-kit`,
`db`, `providers`, `api` and `worker` touch secrets or the database; the renderer never touches the database
— it gets snapshots from the API.

## Multi-tenancy and RBAC

- **Tenants** are organizations. Every tenant-owned row carries `organization_id` directly or through its
  website.
- **Authorization** resolves the owning organization of the target resource from the database (ids in
  URLs are never trusted), loads the caller's membership, and checks a **permission key**
  (`page.publish`, `form.update`, …), never a role name. Roles are named bundles of permissions;
  organizations can create their own. A membership can be restricted to specific websites
  (`OrganizationMember.websiteIds`).
- **Super-admins** (`User.isSuperAdmin`) get platform permissions (`/v1/admin/*`).
- **Plans** carry limits (websites, members, storage, AI usage, custom domains) and feature flags.
- **Public traffic** is resolved by `Host`: `{slug}.PLATFORM_SITES_DOMAIN` or a `Domain` row.

## Data model and storage

PostgreSQL holds identity, tenancy, website drafts (JSONB documents with `revision` counters for
optimistic concurrency), immutable versions, forms and submissions, provider configs (secrets encrypted),
deployments, AI generations, analytics and audit logs — see [DATABASE.md](DATABASE.md). Redis holds
BullMQ queues (prefix `atrium`), rate-limit counters and short-lived caches. Object storage holds media
originals and variants, private form uploads and exports — see [STORAGE.md](STORAGE.md).

## Flows

### Authentication

```mermaid
sequenceDiagram
  participant B as Browser (admin)
  participant A as admin (Next.js)
  participant API as api
  participant DB as PostgreSQL
  B->>A: POST /api/v1/auth/login {email, password}
  A->>API: proxy
  API->>DB: find user, verify argon2id hash (+ MFA challenge if enabled)
  API->>DB: create Session (refresh token stored hashed)
  API-->>B: {accessToken (JWT, 15 min)} + Set-Cookie atrium_rt (httpOnly, SameSite=Lax)
  Note over B: access token kept in memory, sent as Authorization: Bearer
  B->>A: POST /api/v1/auth/refresh (cookie)
  A->>API: proxy
  API->>DB: rotate refresh token; reuse of a rotated token revokes all sessions
  API-->>B: new access token + new cookie
```

The admin proxies `/api/*` to the API so the refresh cookie is first-party. The CLI stores the same pair
in `~/.config/atrium/credentials.json`. MFA (TOTP) adds a challenge step (`/auth/mfa/verify`).

### Editing and autosave

The builder keeps the page document in a client store, sends `PATCH /v1/pages/:id` with the document and
the revision it edited (debounced autosave); a stale revision returns `409` with the current revision so
the client can merge or reload. Structural edits from the SDK/agents go through
`POST /v1/websites/:id/operations` (validated `SiteOperation[]` applied server-side as one change).

### Publishing

```mermaid
sequenceDiagram
  participant E as Editor
  participant API as api
  participant DB as PostgreSQL
  participant R as renderer
  participant Q as Redis/BullMQ
  participant W as worker
  E->>API: POST /v1/websites/:id/publish {message}
  API->>API: validate (BuildReport) — 422 on blocking issues
  API->>DB: transaction: freeze WebsiteVersion snapshot (+checksum), set publishedVersionId
  API->>R: POST /api/revalidate {tags: [site:<id>, host:<domain>…]} (X-Renderer-Secret)
  opt deploymentMode = INDEPENDENT
    API->>DB: create Deployment (QUEUED)
    API->>Q: deployment.run
  end
  API->>DB: audit log
  API->>Q: webhook.dispatch website.published
  API-->>E: {version, report}
```

Scheduled publishing uses the same path from the API's scheduler.

### Website rendering

```mermaid
sequenceDiagram
  participant V as Visitor
  participant R as renderer
  participant API as api
  V->>R: GET https://acme.sites.example.com/about
  R->>R: ISR cache hit? → serve (tagged site:<id>, host:<host>)
  R->>API: GET /v1/public/sites/resolve?host=acme.sites.example.com (X-Renderer-Secret, If-None-Match)
  API->>API: host → website (platform slug or Domain row) → published snapshot
  API-->>R: SiteSnapshot + ETag (or 304)
  R->>R: match route → page → renderer-core renders nodes with theme tokens, SEO tags, islands for interactivity
  R-->>V: HTML (cached until revalidated)
```

Previews use `GET /v1/public/preview?token=` (draft snapshot, expiring token, optional password) and
are never cached. In single-site file mode (`ATRIUM_SNAPSHOT_SOURCE=file`) the renderer reads the snapshot
from disk instead of the API, and `ATRIUM_STATIC_EXPORT=1` produces static HTML.

### Form submission

```mermaid
sequenceDiagram
  participant V as Visitor
  participant API as api
  participant DB as PostgreSQL
  participant Q as BullMQ
  participant W as worker
  V->>API: POST /v1/public/forms/:formId/submit {values, captchaToken, _hp, pageUrl}
  API->>API: rate limit (IP+form), captcha verify (fail closed), validate fields, files → private storage
  API->>API: spam score (honeypot, timing, captcha score, content)
  API->>DB: FormSubmission (+ submission_values), status NEW or SPAM, hashed IP
  API->>Q: form.process
  API-->>V: {ok, message, redirectUrl?} or 422 field errors
  Q->>W: form.process — evaluate FormRules (conditions → actions)
  W->>Q: email.send / sms.send / webhook.dispatch
  W->>DB: append actionsLog
```

### Media upload

```mermaid
sequenceDiagram
  participant E as Editor
  participant API as api
  participant S as Object storage
  participant Q as BullMQ
  participant W as worker
  E->>API: POST /v1/organizations/:org/media/upload (multipart)
  API->>API: size/type checks, sha256 checksum (409 duplicateOf unless allowDuplicate)
  API->>S: put original (public key media/{org}/{yyyy}/{mm}/…)
  API->>API: Media row (status READY / PROCESSING)
  API->>Q: media.process (raster images)
  Q->>W: sharp: metadata, WebP + AVIF variants ≤ original width, blur placeholder, dominant color
  W->>S: put variants
  W->>API: (DB) update Media.variants, blurDataUrl, width/height
```

### AI site generation

```mermaid
sequenceDiagram
  participant E as Editor
  participant API as api
  participant Q as BullMQ
  participant W as worker (agent)
  participant LLM as AI provider
  E->>API: POST /v1/organizations/:org/ai/generate-site {brief}
  API->>API: permission ai.use, plan limits; create Website + AiGeneration (PENDING)
  API->>Q: ai.generate-site
  API-->>E: {generationId, websiteId}
  E->>API: GET /v1/ai/generations/:id/events (SSE progress)
  Q->>W: plan → pages → sections via tool calls
  W->>LLM: chat with tool definitions (JSON schemas from the registry)
  LLM-->>W: tool calls (proposed SiteOperations)
  W->>W: normalize through the registry, validate operations, apply as one versioned change
  W->>API: (DB) progress, operations, usage/cost, rollback refs → SUCCEEDED
```

Edits on existing sites (`/websites/:id/ai/edit`, `generate-page`, `generate-section`) return proposed
operations and a change summary first; `POST /ai/generations/:id/apply` applies them as one version and
`/revert` restores the pre-change state. See [AI-AGENTS.md](AI-AGENTS.md).

### Independent (Vercel) deployment

```mermaid
sequenceDiagram
  participant API as api
  participant Q as BullMQ
  participant W as worker
  participant X as exporter
  participant V as Vercel API
  API->>Q: deployment.run {deploymentId}
  Q->>W: load Deployment + version snapshot, resolve provider (org integration or platform token)
  W->>X: buildNextProject(snapshot, renderer sources) — standalone Next.js project, single-site file mode
  X-->>W: files
  W->>V: upload files by digest, create deployment (preview | production)
  W->>W: Deployment BUILDING, store externalId/url/inspectorUrl
  loop deployment.poll
    W->>V: status + logs
  end
  W->>V: attach domains (production)
  W->>API: (DB) READY/FAILED, emit deployment.completed|failed webhook
```

Static-only providers (e.g. Cloudflare Pages) need the worker to build the static export itself
(`WORKER_ENABLE_LOCAL_BUILDS=1`). Details: [VERCEL.md](VERCEL.md).

## Caching

| Layer                     | What                                                                                       | Invalidation                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Renderer ISR / data cache | rendered pages and resolved snapshots, tagged `site:<id>` and `host:<hostname>`            | `POST /api/revalidate` on publish, domain or redirect changes |
| API snapshot ETag         | `GET /public/sites/resolve` returns an ETag; the renderer revalidates with `If-None-Match` | new published version                                         |
| Provider resolver         | decrypted provider instances, 60 s per row + `updated_at`                                  | automatic on update                                           |
| CDN / edge                | media (immutable keys) and static assets                                                   | never (new keys); HTML per your CDN rules                     |
| Browser                   | hashed Next.js assets immutable; HTML revalidated                                          | —                                                             |

## Scaling

The api, worker, renderer and admin are stateless processes and scale horizontally; PostgreSQL and Redis
are the shared state. Notable constraints: renderer ISR caches are per instance (revalidation must reach
every instance or use a shared cache handler), the worker scales on queue depth, and PostgreSQL connection
budgets grow with instance count. Details and per-platform guidance: [DEPLOYMENT.md](DEPLOYMENT.md#scaling).
