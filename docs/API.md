# Atrium REST API (v1)

Base URL: `${API_URL}/v1`. The admin app proxies `/api/*` → `${API_URL}/*` so browser calls are same-origin (`/api/v1/...`).

## Conventions

- **Auth**: `Authorization: Bearer <accessToken>` (15 min JWT). Refresh token lives in the httpOnly cookie `atrium_rt` (path `/`, SameSite=Lax, Secure in production) and is rotated on every refresh; reusing a rotated token revokes the user's sessions. EventSource/SSE endpoints also accept `?access_token=`.
- **Tenancy**: ids in paths are never trusted — every request resolves the owning organization from the database and checks membership + permission.
- **Errors**: `{ "error": { "code": "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED" | "UNAUTHORIZED" | "INTERNAL", "message": string, "details"?: any }, "requestId": string }`
- **Lists**: `{ "items": T[], "nextCursor": string | null, "total"?: number }`; query `?cursor=&limit=` (default 50, max 200).
- **Optimistic concurrency**: documents carry `revision`. Saves send the revision they edited; a stale revision returns `409 CONFLICT` with `{ details: { current } }`.
- **Secrets**: provider secrets are write-only. Reads return masked values (`••••••••abcd`). Sending a masked value (or omitting a secret) on update keeps the stored one.
- Types referenced below (`WebsiteDefinition`, `PageDocument`, `Node`, `FormDefinition`, `SiteOperation`, `BuildReport`, `SeoReport`, `ChangeSummary`, `ThemeTokens`, …) come from `@atrium/schema` and `@atrium/builder-core`.

## Auth — `/auth`

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password, organizationName? }` | `{ accessToken, user }` + cookie |
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, user }` or `{ mfaRequired: true, challengeToken }` |
| POST | `/auth/mfa/verify` | `{ challengeToken, code }` | `{ accessToken, user }` |
| POST | `/auth/refresh` | — (cookie) | `{ accessToken, user }` |
| POST | `/auth/logout` | — | `204` |
| POST | `/auth/password/forgot` | `{ email }` | `204` (always) |
| POST | `/auth/password/reset` | `{ token, password }` | `204` |
| POST | `/auth/password/change` | `{ currentPassword, newPassword }` | `204` |
| GET | `/auth/me` | — | `{ user, memberships: [{ organization: { id, name, slug, planKey }, role: { id, key, name }, permissions: string[], websiteIds: string[] }] }` |
| PATCH | `/auth/me` | `{ name?, avatarUrl?, locale? }` | `user` |
| GET | `/auth/sessions` | — | `{ items: [{ id, userAgent, ip, lastUsedAt, current }] }` |
| DELETE | `/auth/sessions/:id` | — | `204` |
| POST | `/auth/mfa/setup` | — | `{ secret, otpauthUrl, qrDataUrl }` |
| POST | `/auth/mfa/enable` | `{ code }` | `{ recoveryCodes: string[] }` |
| POST | `/auth/mfa/disable` | `{ code }` | `204` |

`user = { id, email, name, avatarUrl, isSuperAdmin, mfaEnabled, locale }`

## Organizations, members, roles

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/organizations` | POST `{ name }` creates org with default roles; caller becomes owner |
| GET/PATCH | `/organizations/:orgId` | `{ name }` |
| GET | `/organizations/:orgId/usage` | `{ plan, limits, usage: { websites, members, storageMb, aiRequests, aiTokens, submissions, customDomains } }` |
| GET | `/organizations/:orgId/members` | `[{ id, user, role, websiteIds, createdAt }]` |
| PATCH/DELETE | `/organizations/:orgId/members/:memberId` | `{ roleId?, websiteIds? }` |
| GET/POST | `/organizations/:orgId/invitations` | POST `{ email, roleId }` |
| DELETE | `/organizations/:orgId/invitations/:id` | |
| POST | `/invitations/accept` | `{ token }` |
| GET/POST | `/organizations/:orgId/roles` | POST `{ name, description?, permissions: string[] }` |
| PATCH/DELETE | `/organizations/:orgId/roles/:roleId` | system roles: permissions editable except owner |
| GET | `/permissions` | permission catalog `{ key, description }[]` |
| GET | `/organizations/:orgId/audit-logs` | `?websiteId&action&cursor` |

## Websites

| Method | Path | Notes |
|---|---|---|
| GET | `/organizations/:orgId/websites` | list with `{ id, name, slug, status, primaryDomain, publishedAt, updatedAt, thumbnailUrl }` |
| POST | `/organizations/:orgId/websites` | `{ name, slug?, source: { type: 'blank' } \| { type: 'template', templateKey } \| { type: 'import', definition } }` → website. AI creation uses `/ai/generate-site`. |
| GET | `/websites/:id` | website meta + `{ organizationId, permissions }` |
| PATCH | `/websites/:id` | `{ name?, slug?, deploymentMode?, deploymentIntegrationId? }` |
| DELETE | `/websites/:id` | soft delete |
| GET | `/websites/:id/dashboard` | `{ status, productionUrl, primaryDomain, lastDeployment, lastEditor, traffic: { pageviews7d, visitors7d, series }, submissions: { new, total7d }, conversionRate, seoScore, storageMb, recentEdits, deployments, aiGenerations }` |
| GET | `/websites/:id/draft` | `{ definition: WebsiteDefinition, revisions: { site, theme, pages: Record<pageId, number> } }` — the whole editable draft |
| PUT | `/websites/:id/draft/site` | `{ settings?, navigation?, header?, footer?, customCss?, revision }` → `{ revision }` |
| PUT | `/websites/:id/theme` | `{ tokens: ThemeTokens, presetKey?, revision }` → `{ revision }` |
| POST | `/websites/:id/operations` | `{ operations: SiteOperation[], label? }` → `{ results: ApplyResult[], revisions }` (server-side validated edits; used by SDK/agents) |
| POST | `/websites/:id/clone` | `{ name, include: { pages, theme, forms, collections, media } }` (secrets & submissions never cloned) |
| GET | `/websites/:id/export` | `?format=json\|zip\|nextjs` → `site.json` / zip (`site.json, theme.json, pages/*.json, collections/*.json, forms/*.json, media-manifest.json`) / Next.js project zip |
| POST | `/organizations/:orgId/websites/import` | multipart `file` (zip/json) or `{ definition }` |
| GET | `/websites/:id/activity` | timeline from audit log |

## Pages

| Method | Path | Notes |
|---|---|---|
| GET | `/websites/:id/pages` | `[{ id, title, slug, kind, status, isHomepage, position, updatedAt, updatedBy, publishedAt, revision }]` |
| POST | `/websites/:id/pages` | `{ title, slug, kind?, templateId?, sections? }` |
| GET | `/pages/:pageId` | `{ ...meta, document: PageDocument }` |
| PATCH | `/pages/:pageId` | autosave: `{ document?: PageDocument, title?, slug?, status?, publishAt?, revision }` → `{ revision, updatedAt }`; `409` on conflict |
| DELETE | `/pages/:pageId` | |
| POST | `/pages/:pageId/duplicate` | `{ title?, slug? }` |
| POST | `/pages/:pageId/homepage` | set as homepage |
| GET/POST | `/pages/:pageId/versions` | POST `{ message }` named checkpoint |
| POST | `/pages/:pageId/versions/:versionId/restore` | restores into draft (creates a RESTORE version first) |
| POST/DELETE | `/pages/:pageId/lock` | soft edit lock (collaboration-ready) |
| GET | `/pages/:pageId/seo` | `SeoReport` |

## Publishing, versions, preview

| Method | Path | Notes |
|---|---|---|
| POST | `/websites/:id/validate` | `BuildReport` |
| POST | `/websites/:id/publish` | `{ message? }` → `{ version: { id, number }, report }`. Freezes an immutable snapshot; `422` if report has failures. Triggers renderer revalidation and (in INDEPENDENT mode) a production deployment. |
| GET | `/websites/:id/versions` | `[{ id, number, message, source, createdAt, createdBy, isPublished }]` |
| GET | `/websites/:id/versions/:versionId` | full snapshot |
| GET | `/websites/:id/versions/compare?from=&to=` | `ChangeSummary[]` (`to` may be `draft`) |
| POST | `/websites/:id/versions/:versionId/restore` | copy snapshot back into the draft |
| POST | `/websites/:id/versions/:versionId/publish` | re-publish an older version (rollback) |
| GET/POST | `/websites/:id/preview-tokens` | POST `{ expiresInHours?, password?, label? }` → `{ id, url, token, expiresAt }` |
| DELETE | `/websites/:id/preview-tokens/:tokenId` | |

## Templates & global sections

| Method | Path | Notes |
|---|---|---|
| GET | `/templates?kind=SITE\|PAGE\|SECTION\|THEME&organizationId=` | platform + org templates |
| GET | `/templates/:id` | |
| POST | `/organizations/:orgId/templates` | `{ kind, name, description?, category?, data }` or `{ kind, name, from: { websiteId, pageId?, nodeId? } }` |
| DELETE | `/templates/:id` | |
| GET/POST | `/websites/:id/global-sections` | `{ name, node }` |
| PATCH/DELETE | `/global-sections/:id` | |

## CMS collections

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/websites/:id/collections` | POST `{ slug, name, singularName?, fields: CollectionField[], titleField?, routePrefix? }` |
| GET/PATCH/DELETE | `/collections/:cid` | PATCH replaces `fields` when present |
| GET/POST | `/collections/:cid/items` | `?search&status&cursor`; POST `{ slug?, status?, data }` (validated against fields) |
| GET/PATCH/DELETE | `/collection-items/:itemId` | |
| POST | `/collections/:cid/items/reorder` | `{ ids: string[] }` |

## Media

| Method | Path | Notes |
|---|---|---|
| GET | `/organizations/:orgId/media` | `?websiteId&folderId&search&type=image\|video\|document&tag&cursor` |
| POST | `/organizations/:orgId/media/upload` | multipart `file`, `folderId?`, `websiteId?`, `alt?` → `Media` (`409 { details: { duplicateOf } }` unless `allowDuplicate=true`) |
| PATCH | `/media/:id` | `{ filename?, alt?, title?, caption?, tags?, folderId? }` |
| POST | `/media/:id/replace` | multipart `file` — keeps id/URL references |
| DELETE | `/media/:id` | |
| GET/POST | `/organizations/:orgId/media-folders` | `{ name, parentId?, websiteId? }` |
| PATCH/DELETE | `/media-folders/:id` | |

`Media = { id, url, filename, mimeType, size, width, height, alt, title, tags, folderId, variants: [{ width, format, url }], blurDataUrl, createdAt }`

## Forms & submissions

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/websites/:id/forms` | POST `FormDefinition` (id optional) |
| GET/PUT/DELETE | `/forms/:formId` | PUT full `FormDefinition` (fields + rules + settings) |
| GET | `/websites/:id/submissions` | `?formId&status&search&tag&unread&assignedTo&from&to&cursor` → `[{ id, formId, formName, status, read, tags, assignedTo, summary, createdAt, spamScore }]` |
| GET | `/submissions/:id` | `{ ..., values: [{ fieldName, fieldLabel, fieldType, value }], notes, actionsLog }` |
| PATCH | `/submissions/:id` | `{ status?, read?, tags?, assignedToId? }` |
| POST | `/submissions/:id/notes` | `{ body }` |
| DELETE | `/submissions/:id` | |
| POST | `/websites/:id/submissions/bulk` | `{ ids, action: 'markRead'\|'markUnread'\|'archive'\|'status'\|'tag'\|'delete', value? }` |
| GET | `/websites/:id/submissions/export` | `?format=csv\|xlsx&formId&status` (file download) |

## Providers & integrations

`kind ∈ email | sms | storage | ai | deployment | captcha`

| Method | Path | Notes |
|---|---|---|
| GET | `/providers/drivers?kind=` | `[{ kind, id, name, description, config: JSONSchema, secrets: JSONSchema, presets }]` |
| GET/POST | `/organizations/:orgId/email-providers` | `{ name, driver, config, secrets, fromEmail, fromName?, isDefault?, websiteId? }` |
| PATCH/DELETE | `/email-providers/:id` | |
| POST | `/email-providers/:id/test` | `{ to }` → `TestResult` |
| … | `/organizations/:orgId/sms-providers`, `/sms-providers/:id[/test]` | same shape (no from fields) |
| … | `/organizations/:orgId/storage-providers`, `/storage-providers/:id[/test]` | same shape |
| GET/POST | `/organizations/:orgId/integrations?kind=AI\|DEPLOYMENT\|CAPTCHA\|ANALYTICS\|GIT` | `{ kind, driver, name, config, secrets, isDefault?, websiteId? }` |
| PATCH/DELETE | `/integrations/:id` | |
| POST | `/integrations/:id/test` | |

## Webhooks

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/organizations/:orgId/webhooks` | `{ name, url, events: WebhookEvent[], websiteId? }` → includes `secret` once on create |
| PATCH/DELETE | `/webhooks/:id` | |
| POST | `/webhooks/:id/test` | sends a `ping` event |
| GET | `/webhooks/:id/deliveries` | delivery log |
| POST | `/webhook-deliveries/:id/retry` | manual retry |

Deliveries carry `X-Atrium-Event`, `X-Atrium-Delivery`, `X-Atrium-Timestamp` and `X-Atrium-Signature: sha256=<hex HMAC of "{timestamp}.{body}">`.

## Domains & deployments

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/websites/:id/domains` | POST `{ hostname }` → domain with `dnsRecords` guidance |
| PATCH/DELETE | `/domains/:id` | `{ isPrimary?, redirectToPrimary? }` |
| POST | `/domains/:id/verify` | checks DNS/provider → updated domain |
| GET | `/websites/:id/deployments` | history |
| POST | `/websites/:id/deployments` | `{ target: 'preview' \| 'production', versionId? }` → deployment (`QUEUED`) |
| GET | `/deployments/:id` | includes `logs` |
| POST | `/deployments/:id/redeploy` \| `/rollback` \| `/cancel` | |

## SEO, redirects, links, analytics

| Method | Path | Notes |
|---|---|---|
| GET | `/websites/:id/seo` | `[{ pageId, title, slug, report: SeoReport }]` |
| GET/PUT | `/websites/:id/redirects` | PUT `{ redirects: Redirect[] }` (loop detection → `422`) |
| GET | `/websites/:id/links` | broken links |
| GET | `/websites/:id/analytics?from=&to=` | `{ totals: { pageviews, visitors, sessions, conversions, conversionRate }, series: [{ date, pageviews, visitors }], topPages, referrers, countries, devices, forms }` |

## AI

| Method | Path | Notes |
|---|---|---|
| GET | `/ai/models` | `[{ provider, models: [{ id, label, default }] , configured }]` |
| POST | `/organizations/:orgId/ai/generate-site` | `{ brief: { businessName, businessType, description, location?, services?, audience?, style?, pages?, contact?, social? }, prompt?, provider?, model? }` → `{ generationId, websiteId }` (async) |
| GET | `/ai/generations/:id` | `{ id, status, progress: [{ step, label, status, at }], usage, costUsd, result, error }` |
| GET | `/ai/generations/:id/events` | SSE stream of progress |
| POST | `/websites/:id/ai/edit` | `{ prompt, pageId?, nodeId? }` → `{ generationId, summary, operations: SiteOperation[], changes: ChangeSummary[], requiresConfirmation }` (not yet applied) |
| POST | `/websites/:id/ai/generate-page` | `{ prompt }` → same as edit (proposed `createPage`) |
| POST | `/websites/:id/ai/generate-section` | `{ prompt, pageId, index? }` → same as edit |
| POST | `/ai/generations/:id/apply` | applies proposed operations as one versioned change |
| POST | `/ai/generations/:id/revert` | restores pre-change state |
| POST | `/websites/:id/ai/rewrite` | `{ text, mode: 'rewrite'\|'shorten'\|'expand'\|'professional'\|'luxurious'\|'casual'\|'seo'\|'translate', locale? }` → `{ text }` |
| POST | `/websites/:id/ai/seo` | `{ pageId }` → `{ recommendations: [{ field, current, suggested, reason }] }` |
| GET | `/websites/:id/ai/generations` | history |
| GET | `/organizations/:orgId/ai/usage` | `{ period, requests, inputTokens, outputTokens, costUsd, limit }` |

## Registry

| Method | Path | Notes |
|---|---|---|
| GET | `/registry/components` | `[{ type, name, category, level, description, icon, variants, defaultVariant, controls, styleControls, children, bindable, animations, defaultProps, defaultChildren }]` |
| GET | `/registry/components/:type/schema` | JSON Schema |
| GET | `/registry/animations` | presets |
| GET | `/registry/themes` | theme presets |

## Public endpoints (no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/public/sites/resolve?host=` | `SiteSnapshot` for the published version (ETag/`If-None-Match`). Renderer-only: requires `X-Renderer-Secret`. |
| GET | `/public/preview?token=&password=` | draft `SiteSnapshot` (renderer-only header) |
| POST | `/public/forms/:formId/submit` | JSON or multipart `{ values, captchaToken?, _hp?, pageUrl?, locale? }` → `{ ok, message, redirectUrl? }` or `422 { details: FieldError[] }`. Rate limited per IP+form. |
| POST | `/public/analytics/collect` | `{ websiteId, type: 'pageview'\|'event'\|'conversion', path, referrer?, name?, props? }` → `204` |
| GET | `/public/domains/check?domain=` | `200` if the host belongs to a site (edge on-demand TLS `ask` hook), else `404` |
| GET | `/storage/*` | public files for the `local` storage driver (`private/*` keys are never served) |

## Super admin — `/admin` (requires `isSuperAdmin`)

`GET /admin/overview`, `GET/PATCH /admin/organizations[/:id]`, `GET/PATCH /admin/users[/:id]`, `GET /admin/websites`, `GET /admin/jobs`, `POST /admin/jobs/:queue/:jobId/retry`, `GET/PUT /admin/feature-flags`, `GET/PUT /admin/plans`, `GET /admin/audit-logs`, `GET/PATCH /admin/abuse-reports[/:id]`, `GET /admin/ai-usage`.

## Health

`GET /health` (liveness) · `GET /health/ready` (db + redis).
