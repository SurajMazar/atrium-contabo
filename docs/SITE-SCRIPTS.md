# Site scripts and the builder canvas

Site scripts (Settings → Scripts) run on the published site. Some sites build part of their UI with
them: breadcrumbs, filters, galleries, booking flows. The builder canvas shows that UI too, so the page
looks the same while you edit it as it does when published.

## How the canvas shows what scripts build

The canvas is an iframe on the admin origin, so **site scripts never run in it**: a script there could
act as whoever has the editor open. Instead, after every canvas render (debounced ~250 ms):

1. The canvas DOM is copied into a hidden, **opaque-origin sandbox iframe** (`sandbox="allow-scripts"`: no
   cookies, no storage, no access to the admin page, its token or its API).
2. The site's scripts run there the way the published page runs them: head scripts first, then the
   page, `DOMContentLoaded` and `load` fire as usual.
3. When the DOM has been quiet for 200 ms (at most 4 s), the sandbox reports what the scripts changed:
   attributes, text, elements added, moved or removed, styles added to `<head>`.
4. The canvas replays those changes as **inert markup**: sanitized (no `<script>`, frames, event
   handlers or `javascript:` URLs), with no event listeners. React keeps owning every Atrium node; the
   replay is undone exactly before the next one, so edits always start from React's DOM.

Code: `apps/admin/src/builder/canvas/site-scripts/` (`agent.ts` runs in the sandbox, `mirror.ts`
serializes, sanitizes, applies and undoes, `use-site-scripts.ts` schedules runs).

What runs: enabled **inline** scripts with consent category **Necessary**. Analytics, marketing and
preference scripts never run in the builder, and neither do scripts loaded from a URL (`src`).

What does not carry over: anything that is not DOM — event listeners (filters, lightboxes and booking
steps are not interactive in the canvas), `<canvas>` drawings, Web Animations, form control state set
as properties. The canvas shows the page at rest, as a visitor who prefers reduced motion sees it.

The toolbar's **{ }** button turns this off to show the bare Atrium page, for example to edit an
element a script hides. Selecting such an element (from Layers, or with the arrow keys) says that it is
not shown on the published page and offers the same switch.

## What scripts see in the builder

| | Builder sandbox | Published page |
| --- | --- | --- |
| `window.atrium` | `{ editor: true, mode: 'editor', path, version: 1 }` | not defined |
| `<html data-atrium-editor>` | present | absent |
| `<html data-atrium-path>` | the page path (`/`, `/stay`, …) — `location` is `about:srcdoc` | absent; use `location.pathname` |
| `prefers-reduced-motion` | `reduce` (via `matchMedia`) | the visitor's setting |
| `data-node-id` on Atrium elements | present | absent |
| React hydration | elements React owns carry a `__reactFiber$…` expando, so "wait until hydrated" checks pass | real React fibers |
| `localStorage`, `sessionStorage`, `document.cookie` | in-memory stand-ins | real |
| Network | limited by the admin's content security policy; no cookies are sent | allowed |

A script that wants to behave differently in the builder checks `window.atrium && window.atrium.editor`.
Scripts that hide content until it scrolls into view, split headings into words, or run animation loops
should skip that when `prefers-reduced-motion: reduce` matches (they then do so in the builder too).

## Stand-ins: `data-atrium-for`

When a script hides an Atrium element and shows its own UI in its place, put the hidden element's node
id on the replacement, so that clicking it in the builder selects the Atrium element (and the
selection outline is drawn around what is visible):

```js
var id = original.getAttribute('data-node-id'); // only present in the builder
if (id) replacement.setAttribute('data-atrium-for', id);
```

Without it, a click selects the nearest Atrium element around the script's UI. Script-made copies
never carry `data-edit-prop`, so double-click text editing always edits the real Atrium element.
