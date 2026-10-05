# `src/lib` — shared admin modules

These modules are shared by the admin screens **and** the visual builder
(`src/builder/**`, `src/app/(builder)/**`). Signatures are kept stable.

## `api.ts`

```ts
import { api, useApi, authFetch, downloadAuthenticated, uploadWithProgress, getAccessToken, refreshAccessToken, API_BASE_URL } from '@/lib/api';
```

- `api: AtriumClient` — singleton `@atrium/sdk` client, `baseUrl: '/api/v1'` (same-origin, proxied by Next to the API).
  Access token is held **in memory**; any 401 triggers a single-flight `POST /auth/refresh` (refresh cookie `atrium_rt`) and one retry.
- `useApi(): AtriumClient` — the same singleton, as a hook (wrap calls in TanStack Query).
- `authFetch(url, init)` — `fetch` with the bearer token + 401 refresh/retry (SSE streams, raw responses).
- `downloadAuthenticated(url, fallbackName)` — download a file from an authenticated endpoint (exports).
- `uploadWithProgress<T>(url, formData, { onProgress, signal })` — XHR multipart upload with progress; rejects with `UploadError { status, code, details }`.
- `errorMessage(err, fallback?)` — human-readable message from any thrown error.

Errors from the SDK are `AtriumApiError` (`status`, `code`, `details`, `isConflict`, `isValidation`).

## `session.tsx`

```ts
import { SessionProvider, useSession, useCan } from '@/lib/session';
const { user, memberships, currentOrg, currentMembership, setCurrentOrg, status, can, signIn, signOut, reload } = useSession();
can('page.publish', websiteId); // boolean
```

- `status: 'loading' | 'authenticated' | 'unauthenticated'` — on boot the provider calls `/auth/refresh` once.
- `can(permission, websiteId?)` — checks the current org membership's permissions. With `websiteId` it honours
  member website scoping and, if `qk.website(websiteId)` is in the query cache, the server-computed `website.permissions`.
  Super admins pass every check.
- Unauthenticated users on private routes are redirected to `/login?next=<url>` by `<AuthRedirect>` (mounted in providers),
  so `(builder)` routes are protected automatically.

## `query-keys.ts`

`qk` factory for TanStack Query keys, e.g. `qk.website(id)`, `qk.draft(id)`, `qk.pages(id)`, `qk.page(pageId)`,
`qk.forms(id)`, `qk.collections(id)`, `qk.media(orgId, query)`, `qk.registryComponents()`. Keys nest under
`['website', id]` / `['org', orgId]`, so invalidating `qk.website(id)` refreshes everything for that site.
Store `websites.get(id)` results under `qk.website(id)` so `can()` can read `website.permissions`.

## Other helpers

- `format.ts` — `formatBytes`, `formatNumber`, `formatCompact`, `formatPercent` (percent values), `formatRatio` (0–1), `formatUsd`, `formatDate`, `formatDateTime`, `timeAgo`, `formatDuration`.
- `theme.tsx` — `ThemeProvider`, `useTheme(): { theme, resolved, setTheme }` (light/dark/system, persisted).
- `use-debounced.ts` — `useDebounced(value, ms)`.
- `website-context.tsx` — `useWebsite()` inside `/w/[websiteId]/*` admin routes.

## `src/app/providers.tsx`

`<Providers>` = QueryClientProvider + ThemeProvider + SessionProvider + TooltipProvider + `<AuthRedirect>` +
offline banner + Toaster. Used by the root layout, so every route group (including `(builder)`) inherits it.
Toasts: `import { toast } from '@atrium/ui'`.

## Media picker

```tsx
import { MediaPicker } from '@/components/media/media-picker';
<MediaPicker
  open={open}
  onOpenChange={setOpen}
  organizationId={orgId}
  websiteId={websiteId}        // optional; adds a "This site / Organization" scope toggle
  kind="image"                 // 'image' | 'video' | 'any' (default 'any')
  multiple={false}
  onSelect={(media) => …}      // Media[] from @atrium/sdk
/>
```

Also exported for reuse: `useMediaUploads` (`components/media/use-media-uploads.ts`) and
`MediaThumb`, `Dropzone`, `UploadQueue`, `thumbUrl` (`components/media/media-parts.tsx`).

## Other reusable components

- `@/components/media/media-field` — `<MediaField value onChange(url, media) organizationId websiteId? kind aspect="wide|square" />` single media slot.
- `@/components/common/rich-text` — `<RichTextEditor value onChange placeholder compact? />` (TipTap, HTML).
- `@/components/common/permission` — `<Can permission websiteId>`, `<RequirePermission>`, `<Forbidden>`, `<PermissionPage>`.
- `@/components/common/charts` — `Sparkline`, `LineChart`, `BarList` (inline SVG, no chart lib).
- `@/components/common/status` — status badges for websites, pages, deployments, submissions, domains.
- `@/components/forms/condition-group-editor` — `<ConditionGroupEditor value onChange fields />` for nested all/any `ConditionGroup`s.
- `@/components/dashboard/publish-action` — publish button + dialog with BuildReport failure display.
- `@/lib/use-draft` — `useDraft(websiteId)`, `useSaveSite(websiteId)` (revision-aware `PUT /draft/site`, 409 → refetch + toast).
