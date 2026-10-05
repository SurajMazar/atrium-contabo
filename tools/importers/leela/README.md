# Leela Garden / Vilasa by Leela → Atrium importer

Converts the two client-approved Next.js sites (`~/personal/Lela-Garden`, `~/personal/vilasa-by-leela`)
into Atrium site bundles that can be imported with **Import website** (API:
`POST /v1/organizations/:orgId/websites/import`, multipart field `file`) and then edited in the builder.
The source folders are only read.

```
out/leela-garden.zip        # Leela Garden  (≈31 MB: 60 assets incl. the 1080p H.264 hero film)
out/vilasa-by-leela.zip     # Vilasa by Leela (≈31 MB: 61 assets)
```

## Regenerate

```bash
npx tsx tools/importers/leela/build.ts            # both bundles → tools/importers/leela/out/*.zip
npx tsx tools/importers/leela/build.ts --json     # also write the unzipped JSON (out/<site>/) for review
npx tsx tools/importers/leela/build.ts vilasa     # one site
```

(`tools/tutorial/node_modules/.bin/tsx` works offline if `npx` would have to download tsx.)

The build:

1. runs `src/extract.ts` **inside each source project** (`tsx --tsconfig <site>/tsconfig.json`) so the
   site's own `@/` imports resolve, and dumps every content module as JSON — `data/site.ts`, `venue.ts`,
   `events.ts`, `weddings.ts`, `testimonials.ts`, `gallery.ts`, `generated/images.ts`, the JSON-LD from
   `lib/seo.ts`, and each page's `pageMetadata({...})` literal (evaluated from the page source). Copy,
   numbers, alt text, links, prices and SEO therefore come from the source of truth;
2. composes the pages (`src/pages.ts`) from one builder per source component (`src/sections.ts`,
   `src/chrome.ts`) — copy that lives in page JSX is transcribed there;
3. validates with `WebsiteInputSchema.safeParse` + `normalizeWebsite(input, registry)` (must be zero
   error-severity issues; warnings are printed), checks the 20k/100k/50k CSS and script limits, and runs a
   **copy check** (`src/verify.ts`): every visible string must occur verbatim in the source `src/` tree, or
   be one of the few strings the source itself composes from data (listed in `COMPOSED`);
4. writes `site.json` (with the `bundle` manifest), `theme.json`, `pages/*.json`, `forms/inquiry.json` and
   only the **referenced** files under `assets/` (`asset:<path>` refs; `asset:app/icon.png` is the favicon
   from `src/app/icon.png`).

### Preview / fidelity loop (local dev only)

```bash
node tools/importers/leela/deploy.mjs leela-garden      # import into org atrium-demo, publish, delete the copy it supersedes
node tools/importers/leela/deploy.mjs vilasa-by-leela   # (signs in with the seeded local super-admin)
node tools/importers/leela/shoot.mjs http://localhost:3101 out/shots/orig-leela --motion     # originals (next start -p 3101 / 3102)
node tools/importers/leela/shoot.mjs atrium:leela-garden out/shots/atrium-leela --motion     # Atrium copy (slug from out/imports.json)
python3 tools/importers/leela/compare.py leela        # side-by-side PNGs → out/compare/
python3 tools/importers/leela/diffbands.py leela      # per-band visual diff scores
```

Screenshots are taken at 1440×900 and 390×844, full page, after scrolling the whole page so every
reveal has played. `--motion` is required for the originals: their `/gallery` page throws under
`prefers-reduced-motion` (GSAP is handed a null target in `GalleryGrid`), so both sides are shot with motion on.

## How the sites map onto Atrium

| Source | Atrium |
| --- | --- |
| `globals.css` tokens | `theme.json` (colours incl. `gold`, `goldInk`, `ink`, `surfaceMid`…; Playfair Display / Hanken Grotesk from Google, normal style only exactly like `next/font`; 0 radius; uppercase tracked buttons) + the site stylesheet (`src/css.ts`) |
| `Container` 1440px / 24-48-80px margins | `--a-gutter` 24/48/80px, `containerWidths.default` 1280px |
| `Section space` full / half / wide | section `spacingTop/Bottom` lg / md / xl (restyled to 64-80 / 40-56 / 96-160px), tones default / surface / surface-alt / inverse |
| `Hero` (film) | `hero` · `fullscreen-video` (poster + 1080p H.264), cinematic-reveal, the copy scrim, scroll cue; scroll hand-over and the WebGL atmosphere come from the scripts |
| `PageHero` | a `section` with a backdrop `image`, breadcrumb, eyebrow, h1 (line reveal), lead; `clip` on Weddings |
| `Intro`, `SplitFeature`, `StatBand`, `ScrollStory`, `EventTypeGrid`, `Packages`, `FacilityStrip`, `IconGrid`, `Quote`, `LocationBlock`, `CtaBand`, `BentoGrid`, `GalleryPreview`, `VideoGallery` | composed from `section` / `container` / `heading` / `text` / `button` / `image` / `icon` / `list` / `divider` / `video` / `embed`, mirroring the JSX; the Tailwind look is each node's own `customCss` |
| `GalleryGrid` + `Lightbox` | `gallery` · `masonry` (54 photos, captions, categories, lightbox), shape rhythm by `:nth-child`, filter bar from the script |
| `Header`, `NavLink`, `Logo`, `MobileMenu` | `site-header` · classic + `primary` menu (nav captions as item descriptions), restyled |
| `Footer` | global section **Site footer** (Atrium's `site-footer` layout differs, so the real one is a hidden placeholder: every page has `layout.footer = hidden`) |
| `BottomNav`, `WhatsAppButton` stack | global section **Floating contact & app bar** (fixed-position buttons) |
| `InquiryForm` + `api/inquiry` | form `inquiry` (same fields, labels, options, required/limits, success copy) + rule *Email the venue* → `CONTACT.email`, rendered by a nested `form` section |
| `pageMetadata()` / `seo.ts` | page `seo` (full titles, descriptions, keywords, OG title/description/image, Twitter card), site JSON-LD (`venueSchema()`, `organizationSchema()` as Custom), packages `OfferCatalog`, gallery `VideoObject`s; Atrium adds the BreadcrumbList |
| `Reveal` / `RevealHeading` / `StaggerGroup` / `imageReveal` / `parallax` | animation presets `fade-up` / `text-reveal` / `stagger` / `clip-reveal` / `parallax` with the original distances, durations, staggers and `top 82%` starts |
| Lenis, header docking, hero scroll hand-over, ScrollStory crossfade, gallery filter, film facade, Cursor, MagneticButton, PageTransition, `?package=` prefill, app-bar current tab | site script **lg-motion** (`src/scripts/motion.js`) |
| `AtmosphereLayer` (R3F gold motes + garden light) | site script **lg-atmosphere** (`src/scripts/atmosphere.js`): same shaders, same device gate, three.js from jsDelivr |
| `Icon.tsx` thin-stroke set | `icon` elements carrying a close lucide name, painted with the original path data through a CSS mask (`--lgi-*` variables in the site stylesheet) |

### Editing notes

* Every heading, paragraph, label, button, link, image, alt text, nav item, form field and SEO field is a
  normal Atrium value — edit it in the canvas or inspector.
* Layout/visual details live in each node's **Custom CSS** (Advanced tab), scoped with `&`. They are written
  as `html &{…}` on purpose: Atrium emits node CSS before the site stylesheet, and the extra `html` keeps a
  node's own CSS ahead of the shared design system. A property set there wins over the same property set in
  the inspector's Style tab, so change it in the Custom CSS (or delete the line) if a Style edit seems ignored.
* The site stylesheet (Site settings → Custom CSS) restyles Atrium's own classes (`.a-eyebrow`,
  `.a-heading--lg`, `.a-btn--secondary` = gold button, `.a-btn--ghost` = icon + text link, `.a-btn--link` =
  arrow link, header, form controls, lightbox…), so elements added later already look on-brand.
* Script hooks use a few node ids: `lg-hero`, `lg-pagehero-*`, `lg-story-N…`, `lg-gallery-count`,
  `lg-film-*`, `lg-cardlink-*`, `lg-magnetic-*`, `lg-inquiry`, `lg-contact-direct`, `lg-bottom-nav`. Keep
  them when restructuring those sections (a duplicated node gets a new id and loses its hook, not its look).
* Site scripts run on the published site only, not in the builder canvas.

## Product change

`packages/component-registry` + `packages/renderer-core`: gallery images accept an optional `category`
(inspector field "Category", bindable), rendered as `data-category` on each figure — the generic hook the
gallery filter needs. Covered by a new test in `packages/renderer-core/test/render.test.tsx`. Until the API
and renderer are rebuilt with it, the API's registry strips the field on import, so the motion script falls
back to the source's caption → category table.

## What is approximated / known gaps

* **Header & menu**: Atrium's `site-header` markup, restyled. The wordmark beside the Leela monogram, the
  menu title and the menu's "Enquire Now" label are CSS `content` (they follow the site name/stylesheet,
  not an inspector field). The menu opens under the header bar instead of as a separate panel with its own
  close button; the bar shows the same name and an X.
* **Hero film**: one 1080p H.264 source (the originals also offer AV1 and 720p for phones). Atrium starts the
  film with `preload="metadata"` instead of after mount.
* **Line reveals** use Atrium's `text-reveal` (lines rise *and* fade); the originals only rise. Image wipes
  don't add the 1.18→1 inner zoom.
* **Form**: Atrium's generic validation messages ("Full Name is required") instead of the bespoke ones;
  the price inside the package chips is not set in gold; the success panel heading is CSS `content`.
* **Lightbox**: Atrium's lightbox restyled; counter reads `1 / 54` (not `01 / 54`), no category line under
  the caption, navigates all photos even when filtered.
* **Footer** is a global section (see above), so the builder's built-in "Footer" settings don't affect it.
* Testimonials: the sources ship none, so the section is (correctly) absent.
* Canonical URLs come from the Atrium domain; the originals hard-code `https://leelagarden.com.np`.
