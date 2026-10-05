# Exporting the renderer as a standalone site

`packages/exporter` builds an independent, deployable Next.js project from this app. This file is
the contract between the two.

## Modes

| Mode | Env | Routing | Output |
| --- | --- | --- | --- |
| Platform (default) | `ATRIUM_SNAPSHOT_SOURCE=api` | `proxy.platform.ts` rewrites by Host to `/atrium-tenant/<host>/…`, `/_site/<slug>/…` → `/atrium-dev/…`, `/_preview/<token>/…` → `/atrium-preview/…` | SSR + ISR (fetch tags `host:<host>`, `atrium:sites`; revalidate 300s) |
| File (single site) | `ATRIUM_SNAPSHOT_SOURCE=file` + `ATRIUM_SNAPSHOT_FILE=./site.json` | Root `app/[[...path]]` (no proxy needed); every page, collection item and redirect source is generated with `generateStaticParams`, `dynamicParams = false` | Static HTML via `next build` + `next start`, or any Node host / Vercel |
| Static export | File mode + `ATRIUM_STATIC_EXPORT=1` | Same as file mode | `out/` (plain files; `trailingSlash: true`; redirects become `<meta http-equiv="refresh">` pages; `404.html` is the site's own 404 page) |

## Environment variables

| Variable | Used in | Purpose |
| --- | --- | --- |
| `ATRIUM_SNAPSHOT_SOURCE` | all | `api` (default) or `file` |
| `ATRIUM_SNAPSHOT_FILE` | file | Path to the snapshot JSON (default `site.json`, relative to the project root). Accepts a `SiteSnapshot` (`{ websiteId, definition, runtime, apiBaseUrl, … }`) or a bare `WebsiteDefinition`. Read with `/* turbopackIgnore: true */` so Turbopack does not trace the project. |
| `ATRIUM_STATIC_EXPORT` | file | `1` → `output: 'export'` |
| `ATRIUM_API_INTERNAL_URL` / `API_URL` | platform | API base (with or without `/v1`) for `/public/sites/resolve` and `/public/preview` |
| `RENDERER_SECRET` | platform | Sent as `X-Renderer-Secret`; required by `POST /api/revalidate` |
| `PLATFORM_SITES_DOMAIN` | platform | `{slug}.{domain}` used by `/_site/<slug>` dev access (default `sites.localhost:3001`) |
| `NEXT_PUBLIC_ATRIUM_API_URL` | all | Fallback public API base for forms/analytics when the snapshot has no `apiBaseUrl` |

## Files the exporter must override / drop

1. **`package.json`** — dependencies needed at runtime: `next`, `react`, `react-dom`, `zod`, `gsap`, `immer`
   (builder-core). `lucide-react` is *not* needed at runtime (icons are pre-generated SVG data in
   `packages/renderer-core/src/ui/icons-data.ts`).
2. **`tsconfig.json`** — paths: `@atrium/*` → `./packages/*/src/index.ts`,
   `@atrium/renderer-core/client` → `./packages/renderer-core/src/client.ts`, and `@/*` → `./*`
   (the app imports its own helpers as `@/lib/...`).
3. **`next.config.ts`** — keep these two settings from this app's config:
   - `pageExtensions: isExport ? ['tsx','ts'] : ['platform.tsx','platform.ts','tsx','ts']` —
     every server-only/multi-tenant file is named `*.platform.ts(x)` (`proxy.platform.ts`,
     `app/atrium-*`, `app/api/*`). For a file-mode project the exporter may simply **delete** them
     instead: `proxy.platform.ts`, `app/atrium-tenant`, `app/atrium-dev`, `app/atrium-preview`,
     `app/api`.
   - `experimental: { globalNotFound: true }` (renders the site 404 for unmatched URLs and the
     exported `404.html`).
   Plus `images: { unoptimized: true }` and `output: 'export'` when exporting.
4. Add **`site.json`** (the published `SiteSnapshot`) and `.env` with
   `ATRIUM_SNAPSHOT_SOURCE=file`.

The app imports `@atrium/*` packages only by bare package name and never imports anything outside
those packages and the app itself.

## Routes

| Route | Notes |
| --- | --- |
| `/[[...path]]` | File mode pages (layout renders `<html>` with theme CSS, fonts, boot script, site scripts, `SiteRuntime`). |
| `/sitemap.xml`, `/robots.txt` | File mode (force-static). Platform equivalents live under `/atrium-tenant/[host]/…` and are reached through the proxy. Non-primary hosts get `Disallow: /`. |
| `/atrium-assets/renderer.css` | Component CSS (`RENDERER_CSS`), immutable; referenced with `?v=<hash>`. Pages inline only theme variables, node styles and custom CSS. |
| `POST /api/revalidate` | `{ tags: string[] }` + `X-Renderer-Secret`. `site:<id>` also expands to every host tag seen for that site (falls back to `atrium:sites` when unknown on this instance). Uses `revalidateTag(tag, { expire: 0 })`. |
| `POST /api/preview-auth` | Password form target for protected previews; stores the password in an httpOnly cookie scoped to `/_preview/<token>`. |

## Known limitations

- Pages that call `notFound()` respond with HTTP 404 but Next streams them as a client-rendered
  shell (the root layout lives in the dynamic segment so it can render page-specific CSS); the
  site's 404 content appears once JS loads. Static exports and unmatched file-mode URLs use
  `global-not-found` and are fully server-rendered.
- Snapshots don't yet carry per-domain `redirectToPrimary`; the renderer honours an optional
  `snapshot.domains[{ hostname, redirectToPrimary }]` when the API adds it.
- Media-library responsive variants are used when the snapshot includes an optional
  `media: { [mediaId]: { width, height, variants: [{ width, url }] } }` map; Unsplash/imgix-style
  `?w=` URLs always get a generated `srcset`.
