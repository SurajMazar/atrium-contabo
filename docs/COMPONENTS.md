# Components

Atrium pages are trees of **nodes**. Every node `type` is a component declared once in
`@atrium/component-registry` (schema, defaults, inspector controls, AI guidance) and rendered by a
React renderer in `@atrium/renderer-core`. The builder, the AI agents, validation, the editor
canvas and the public renderer all read the same definition, so a component behaves identically
everywhere.

```
packages/component-registry/src/components/*.ts   definitions (data + Zod)
packages/renderer-core/src/components/*.tsx       server renderers + colocated CSS strings
packages/renderer-core/src/islands/*.tsx          small 'use client' islands (interactivity only)
packages/renderer-core/src/builtin.ts             type → [renderer, css chunks] table
```

## Definition anatomy

```ts
export const rooms = defineComponent({
  type: 'rooms',                       // unique, kebab-case; stored on Node.type
  name: 'Rooms & suites',
  category: 'hospitality',             // picker grouping (COMPONENT_CATEGORIES)
  level: 'section',                    // section | block | element | site
  icon: 'bed-double',                  // lucide name for the picker
  description: '…',                    // shown to users AND AI agents — describe purpose
  variants: [{ id: 'cards', name: 'Cards', description: '…' }, …],
  defaultVariant: 'cards',
  props: z.object({ ...sectionBase, ...optionalIntro, items: z.array(roomItem).default([]), … }),
  defaultProps: { heading: 'Rooms & *suites*', items: [ … real-feeling content … ] },
  controls: [ …introControls, { name: 'items', type: 'list', item: [ … ] }, …sectionControls ],
  bindable: { listProp: 'items', itemFields: ['name', 'image', 'price', 'slug'] },
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Hotels, resorts…', avoidWhen: '…' },
});
```

- **props** — a Zod object. `registry.normalize()` merges `defaultProps`, validates, assigns ids and
  reports issues (invalid props fall back to defaults so one bad prop never breaks a generation).
  At render time props are parsed with **schema defaults only** (never `defaultProps`), so clearing
  an optional prop in the editor really clears it.
- **Variants change composition, never content.** Switching variant must not require changing
  props: every variant renders from the same props (e.g. `pricing` table variant builds its rows
  from plan inclusions when `comparisonRows` is empty).
- **Shared fragments** (`fields.ts`, `components/shared.ts`): `sectionBase` (tone, containerWidth,
  spacingTop/Bottom), `intro`/`optionalIntro` (eyebrow, heading, headingLevel, subheading, align),
  `ButtonSchema`, `media` (MediaRef), `aspect`, `columnsProp`.

### Controls (inspector)

JSON-serializable, rendered generically by the admin. `name` is a dot path into props
(`cta.label`); the registry test asserts that every control's root key exists in the schema.

| Field | Meaning |
| --- | --- |
| `type` | text, textarea, richtext, number, slider, select, segmented, toggle, color, media, link, icon, list, form, collection, menu, code, date, button |
| `group` | `content` · `style` · `layout` · `advanced` (inspector tabs) |
| `showIf` | progressive disclosure: `{ prop, equals \| notEquals \| in }` or `{ prop: 'variant', variants: [...] }` (also tested) |
| `item`, `itemLabel`, `itemDefaults` | sub-controls for `list` |
| `mediaKind`, `min/max/step/unit`, `options`, `help`, `placeholder` | as named |

`styleControls` lists which generic `StyleProps` the inspector offers (defaults by level).

### Bindings (CMS collections)

Components with `bindable` can be bound to a collection:

```json
{ "type": "rooms", "binding": {
  "collection": "rooms", "sort": { "field": "order", "direction": "asc" }, "limit": 3,
  "filter": { "match": "all", "conditions": [{ "field": "slug", "op": "neq", "value": "{{item.slug}}" }] },
  "map": { "name": "{{item.name}}", "image": "{{item.image}}", "price": "{{item.price}}", "slug": "{{item.slug}}" } } }
```

`NodeView` maps published items (drafts too in the editor) into `bindable.listProp`. `item` is the
item data plus `slug`/`id`; a map value that is a single token keeps the raw value (objects such as
MediaRef stay objects, scalars become strings); image-like keys bound to a URL string become
`{ src }`. Filter values may use `{{…}}` (resolved against the page scope, so detail pages can
exclude the current item). Bound list items keep `slug`, which `rooms`, `events` and
`collection-list` turn into detail links (`/{routePrefix}/{slug}`). `collection-list` with only a
`collection` prop auto-maps title/image/summary/category/date.

### Collection template pages

A page with `kind: 'collection-template'` and `collection: 'rooms'` renders at
`/{routePrefix}/{itemSlug}`. Inside it every string prop can use `{{item.<field>}}`;
`{ src: '{{item.image}}', alt: '{{item.name}}' }` merges the stored MediaRef. `gallery.fromItemField`
renders an item's gallery array; `collection-list` hides the current item (`excludeCurrent`).

### Templates & variables

Any string prop may contain `{{business.*}}`, `{{vars.*}}`, `{{social.<network>}}`,
`{{website.name}}`, `{{page.title}}`, `{{year}}` and on detail pages `{{item.*}}`, with an optional
fallback: `{{business.phone | Call us}}`. Interpolation is pure string substitution (no code).
Headings render `*emphasis*` as `<em>`; `body`-style props split paragraphs on blank lines.

### Animations

`node.animation = { preset, duration?, delay?, stagger?, trigger?, target? }` (presets from
`@atrium/animations`). NodeView serializes it to `data-a-anim`; `SiteRuntime` lazy-loads GSAP +
ScrollTrigger only when the page has animated nodes. Renderers add choreography hooks:
`data-a-part` (editorial/cinematic heroes, intros, CTAs), `data-a-bg` (hero/background media),
`data-a-track` (horizontal scroll), `data-a-text` (text splitting), `data-a-parallax`.
Animations are disabled in the editor unless `editor.playAnimations`, and for reduced motion.
Recommend 1–2 presets per component in `animations.recommended`; leave many sections static.

## Renderers

```ts
import { registerRenderer, Section, Intro, Frame, root, editProp, type RenderProps } from '@atrium/renderer-core';

function QuoteBand({ node, props, ctx, attrs }: RenderProps) {
  return (
    <Section rp={{ node, props, ctx, attrs }} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <blockquote {...editProp(ctx, 'quote')}>{props.quote}</blockquote>
    </Section>
  );
}
registerRenderer('quote-band', QuoteBand);
```

Rules (every built-in follows them):

1. **Server-first.** Renderers are plain synchronous functions: no hooks, no React context, no
   `async`. `ctx` (RenderContext) is passed explicitly and contains the definition, mode, locale,
   theme, template scope, `resolveLink`, `pagePath`, `collectionItemPath`, forms/collections maps and
   image helpers. Interactivity lives in `islands/*` (`'use client'`), which receive only
   serializable props (never `ctx`; form rules/recipients are never sent to the browser).
   Everything must also work when the whole tree renders client-side (editor canvas in an iframe —
   islands use the element's own `ownerDocument`/`defaultView`).
2. **Spread `attrs` on the root element** (merge classes with `root(attrs, 'a-x', …)`). attrs carry
   `a-n-{id}` (compiled node styles), anchor `id`, `data-a-anim`, and in the editor
   `data-node-id` / `data-node-type` / `data-node-hidden`.
3. **Editor contract.** Mark primary plain-text fields with `data-edit-prop="<propPath>"`
   (`editProp(ctx, 'heading')`, list items as `items.0.title`). Containers with
   `children` render `<div class="a-dropzone" data-drop-zone data-parent-id>` when empty. Links keep
   real hrefs; forms don't submit; carousels/slideshows don't autoplay; maps/videos stay as facades.
4. **Images** go through `AImage`/`Frame`: width/height, `srcset`/`sizes` (media variants or `?w=`
   URLs), lazy by default, `priority` for the hero (eager + `fetchpriority=high`), focal point →
   `object-position`, alt always present.
5. **Sections** use `Section` (tone, spacing, container width, nested handling) and `Intro`
   (eyebrow/heading/subheading with `data-a-part` + `data-edit-prop`). Section-level components
   placed inside other nodes render "nested" (no section padding).

`NodeView` does the shared work before calling a renderer: translations for `ctx.locale`,
`{{…}}` interpolation, collection bindings, schema defaults, variant fallback, visibility (hidden,
schedule `from/until`, `locales`; responsive hiding is compiled CSS; in the editor hidden nodes
render dimmed with `data-node-hidden`) and global-section refs (`type: 'global-section'` + `ref`).

## CSS conventions

- CSS lives in TS string modules colocated with each renderer (`MEDIA_CSS`, `HERO_CSS`, …) and is
  registered as chunks in `builtin.ts`. `RENDERER_CSS` is every chunk; `getSiteCss()` inlines only the
  chunks a page uses (or none when the host serves `RENDERER_CSS` as an external stylesheet, as
  `apps/renderer` does at `/atrium-assets/renderer.css?v=<hash>`), plus theme variables, compiled node
  styles and sanitized custom CSS.
- Everything is scoped under `.atrium-site`. Class names: `a-{component}`, `a-{component}--{variant}`,
  `a-{component}__{part}`. The section shell adds `a-{type}` and `a-{type}--{variant}` to section
  roots, so **inner elements must not reuse those exact names** (use a distinct block name, e.g.
  `a-statlist` inside `stats`).
- Only token variables for color/type/space (`--a-color-*`, `--a-font-*`, `--a-text-*`,
  `--a-space-*`, `--a-radius-*`, …). Tones set local variables (`--t-bg`, `--t-text`, `--t-muted`,
  `--t-border`, `--t-accent`, `--t-btn-bg/text`) that components consume, so `tone: 'inverse'` or
  media overlays (`.a-on-media`) restyle everything inside.
- Heading level sizes use `:where()` so component classes (`.a-x__title`) always win.
- Breakpoints (desktop-first): laptop ≤1279px, tablet ≤991px, mobile ≤767px. Respect
  `prefers-reduced-motion`.

## Adding a component end-to-end

1. **Define** it in `packages/component-registry/src/components/<category>.ts` with
   `defineComponent` (schema, realistic `defaultProps`, controls with groups/showIf, variants,
   `animations`, `ai.useWhen`, `bindable` if it renders a list) and add it to the exported array that
   `src/index.ts` spreads into `BUILTIN_COMPONENTS`. Run `pnpm --filter @atrium/component-registry test`
   (checks controls ↔ props, defaults parse, showIf targets, zero-issue normalization) and `build`.
2. **Render** it in `packages/renderer-core/src/components/<category>.tsx`, export its CSS string,
   and add `type: [Renderer, ['<chunk>']]` to `BUILTIN_RENDERERS` in `builtin.ts` (new chunks go in
   `CSS_CHUNKS` and `CHUNK_ORDER` in `styles.tsx`). Put interactivity in an island.
3. **Test**: `pnpm --filter @atrium/renderer-core test` renders every page of every demo site and
   blueprint with `renderToString` (fails on render errors or unresolved `{{…}}`).
4. Optionally add section templates to `packages/templates/src/sections.ts`.

### Plugin components

Plugins register at runtime without touching core packages:

```ts
import { createRegistry, defineComponent } from '@atrium/component-registry';
import { registerRenderer, registerComponentCss } from '@atrium/renderer-core';

const def = defineComponent({ type: 'acme-reviews', … });
const registry = createRegistry([def]);                  // builder + AI + validation
registerRenderer('acme-reviews', AcmeReviews);           // renderer (server-safe)
registerComponentCss('acme-reviews', '.atrium-site .a-acme-reviews{…}');
// pass the same registry to the renderer: createRenderContext({ …, registry })
```

## Catalog

### Site

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `site-header` | Header | site | classic (default), centered, minimal, stacked | — | — | — |
| `site-footer` | Footer | site | columns (default), centered, statement | — | — | — |

### Structure

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `section` | Section | section | — | — | any | fade-up, stagger |
| `container` | Container | block | — | — | any | — |
| `grid` | Grid | block | — | — | any | stagger |
| `columns` | Columns | block | — | — | any | — |
| `stack` | Stack | block | — | — | any | — |
| `spacer` | Spacer | element | — | — | — | — |
| `divider` | Divider | element | — | — | — | — |

### Content

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `heading` | Heading | element | — | — | — | fade-up, reveal, word-reveal, text-reveal |
| `text` | Paragraph | element | — | — | — | fade-up, fade |
| `rich-text` | Rich text | element | — | — | — | — |
| `button` | Button | element | — | — | — | — |
| `button-group` | Button group | element | — | — | — | — |
| `icon` | Icon | element | — | — | — | — |
| `badge` | Badge | element | — | — | — | — |
| `quote` | Quote | element | — | — | — | text-reveal, fade-up |
| `list` | List | element | — | — | — | stagger |

### Marketing

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `hero` | Hero | section | editorial, fullscreen-image (default), fullscreen-video, split, minimal, centered, carousel, text-overlay, cinematic | — | — | editorial-reveal, cinematic-reveal, blur-reveal, image-mask, fade |
| `cta` | Call to action | section | banner, split, centered (default), image-background | — | — | fade-up, editorial-reveal, blur-reveal |
| `features` | Features | section | grid (default), list, alternating, icon-row, cards | `items` | — | stagger, fade-up |
| `stats` | Stats | section | inline (default), cards, large | — | — | stagger, fade-up |
| `testimonials` | Testimonials | section | carousel (default), grid, single | `items` | — | fade-up, text-reveal, stagger |
| `faq` | FAQ | section | accordion, two-column (default) | `items` | — | fade-up, stagger |
| `pricing` | Pricing | section | cards (default), table | — | — | stagger, fade-up |
| `team` | Team | section | grid (default), list | `members` | — | stagger, fade-up |
| `timeline` | Timeline | section | vertical (default), alternating, steps | — | — | stagger, fade-up |
| `comparison-table` | Comparison table | section | — | — | — | fade-up |
| `content-split` | Image & text | section | standard (default), overlap, collage, full-bleed | — | — | fade-up, image-mask, clip-reveal, editorial-reveal |
| `text-section` | Text section | section | statement, intro (default), two-column | — | — | text-reveal, word-reveal, fade-up, blur-reveal |
| `benefits` | Benefits | section | list, grid, with-image (default) | — | — | stagger, fade-up |

### Media

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `image` | Image | element | — | — | — | clip-reveal, image-mask, fade, scale-in, parallax |
| `video` | Video | block | — | — | — | fade, scale-in, clip-reveal |
| `background-video` | Background video | section | — | — | — | cinematic-reveal, fade, editorial-reveal |
| `gallery` | Gallery | section | grid, masonry, editorial (default), carousel, stacked | `images` | — | stagger, clip-reveal, fade-up |
| `carousel` | Carousel | section | full, peek (default), cards | `slides` | — | fade-up, fade |
| `logo-cloud` | Logo cloud | section | grid (default), marquee | — | — | fade, stagger |

### Hospitality

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `rooms` | Rooms & suites | section | cards (default), editorial-list, carousel | `items` | — | stagger, fade-up, clip-reveal |
| `amenities` | Amenities | section | icon-grid (default), image-tiles, list | `items` | — | stagger, fade |
| `offers` | Packages & offers | section | cards (default), list, featured | `items` | — | stagger, fade-up |
| `dining` | Restaurant & dining | section | split (default), feature | — | — | fade-up, image-mask, editorial-reveal |
| `menu` | Food menu | section | classic (default), grid, tabs | — | — | fade-up, stagger |
| `experiences` | Experiences | section | cards (default), horizontal-scroll, list | `items` | — | stagger, horizontal-scroll, fade-up |
| `venues` | Venue spaces | section | cards, detailed (default), table | `items` | — | fade-up, stagger, image-mask |
| `events` | Events | section | list (default), cards | `items` | — | stagger, fade-up |
| `attractions` | Nearby attractions | section | list (default), cards | `items` | — | stagger, fade-up |
| `booking-cta` | Booking bar | section | bar (default), card, inline | — | — | fade-up, fade |

### Contact

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `contact-info` | Contact details | section | list (default), cards, split | — | — | fade-up, stagger |
| `map` | Map | block | — | — | — | fade |
| `social-links` | Social links | element | — | — | — | — |

### Forms

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `form` | Form | section | stacked, card, split-with-text (default) | — | — | fade-up |
| `newsletter` | Newsletter | section | inline (default), card, banner | — | — | fade-up, fade |

### Advanced

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `tabs` | Tabs | block | — | — | any | fade-up |
| `accordion` | Accordion | block | — | — | — | fade-up |
| `modal` | Modal | block | — | — | any | — |
| `drawer` | Drawer | block | — | — | any | — |
| `marquee` | Marquee | section | — | — | — | — |
| `before-after` | Before / after | block | — | — | — | — |
| `horizontal-scroll` | Horizontal scroll | section | — | — | any | horizontal-scroll |
| `sticky-story` | Sticky storytelling | section | — | — | — | fade-up |
| `parallax-band` | Parallax image band | section | — | — | — | fade, blur-reveal |
| `animated-text` | Animated text | element | — | — | — | — |
| `embed` | Embed | block | — | — | — | — |
| `global-section` | Global section | section | — | — | — | — |

### Collection

| Type | Name | Level | Variants | Bindable | Children | Recommended animations |
| --- | --- | --- | --- | --- | --- | --- |
| `collection-list` | Collection list | section | grid (default), list, minimal, featured | `items` | — | stagger, fade-up |

