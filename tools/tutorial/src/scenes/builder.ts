import type { Director, Scene } from '../director';
import { ADMIN } from '../session';
import { card } from './helpers';
import { siteId } from './workspace';

const CH = 'Visual builder';
const canvas = (d: Director) => d.page.frameLocator('iframe[title="Page canvas"]');
/** Open a left-rail panel (rail buttons toggle, so an already-open panel is left alone). */
const rail = async (d: Director, label: string) => {
  const btn = d.page.getByRole('navigation', { name: 'Editor panels' }).getByRole('button', { name: label, exact: true });
  if ((await btn.getAttribute('aria-pressed').catch(() => null)) === 'true') return d.moveTo(btn, 400);
  return d.click(btn);
};
/** Inspector tab; the Motion tab's name gains "Has animation" when the node is animated. */
const tab = (d: Director, name: string) => d.click(d.page.getByRole('tab', { name: new RegExp(`^${name}`) }).first());
/** The inspector's variant picker trigger (library items mention "variant" in their descriptions). */
const variantPicker = (d: Director) => d.page.getByRole('button', { name: /^Variant/ }).first();
const editor = async (d: Director) => {
  await d.goto(`${ADMIN}/w/${await siteId('aranya')}/editor`, 'iframe[title="Page canvas"]');
  await canvas(d).locator('[data-node-type="hero"]').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await d.wait(1200);
};
const hero = (d: Director) => canvas(d).locator('[data-node-type="hero"]').first();
const scrollCanvas = (d: Director, top: number) =>
  canvas(d).locator('html').evaluate((el, y) => el.ownerDocument.defaultView!.scrollTo({ top: y, behavior: 'smooth' }), top).catch(() => undefined);
const popoverButton = (d: Director, name: RegExp) => d.page.locator('[data-radix-popper-content-wrapper] button').filter({ hasText: name }).first();

export const builderScenes: Scene[] = [
  card('30-builder-card', CH, 'Chapter 4', 'The visual *builder*', 'Canvas · inspector · responsive styles · motion · drag & drop · undo · AI', [
    'This is where most of the work happens. Let us open the Aranya resort in the visual builder.',
  ]),
  {
    id: '31-builder-tour', chapter: CH, title: 'Layout', storage: 'admin', setup: editor,
    steps: [
      { say: 'The canvas in the middle is the real website renderer, running inside an isolated frame, so what you see is exactly what visitors get, including responsive breakpoints.', do: async (d) => {
        await d.highlight(d.page.locator('iframe[title="Page canvas"]'), 'Live canvas');
        await d.wait(2600);
        await d.highlight(null);
      } },
      { say: 'On the left are the panels: elements, section templates, pages, layers, CMS, media, theme, navigation, and the AI assistant.', do: async (d) => {
        await d.highlight(d.page.getByRole('navigation', { name: 'Editor panels' }), 'Panels');
        await d.wait(2500);
        await d.highlight(null);
      } },
      { say: 'On the right is the inspector. With nothing selected it shows page settings: title, address, status, header and footer behaviour, and a full search and social preview.', do: async (d) => {
        await d.highlight(d.page.getByText('SEO & social').first(), 'Page SEO');
        await d.wait(2600);
        await d.highlight(null);
      } },
      { say: 'Along the top: the site and page switchers, undo and redo, device sizes, zoom, animation playback, the command palette, the save indicator, preview and publish.', do: async (d) => {
        for (const n of ['Desktop', 'Laptop', 'Tablet', 'Mobile']) await d.moveTo(d.page.getByRole('button', { name: n, exact: true }), 380);
        await d.moveTo(d.page.getByText(/All changes saved|Saved/).first(), 500);
        await d.moveTo(d.page.getByRole('button', { name: 'Publish' }).first(), 500);
      } },
    ],
  },
  {
    id: '32-builder-edit', chapter: CH, title: 'Select and edit', storage: 'admin', setup: editor,
    steps: [
      { say: 'Click anything on the canvas to select it. The overlay shows its name, and a quick toolbar to move, duplicate, delete or select the parent.', do: async (d) => {
        await d.click(hero(d).locator('[data-edit-prop="heading"]').first());
        await d.wait(1200);
      } },
      { say: 'The inspector now shows only the controls this component needs, grouped into content, style, layout, motion and advanced.', do: async (d) => {
        await d.highlight(d.page.getByRole('tablist').last(), 'Inspector tabs');
        await d.wait(2500);
        await d.highlight(null);
      } },
      { say: 'Double click text to edit it in place. Words wrapped in asterisks become elegant italics.', do: async (d) => {
        const h = hero(d).locator('[data-edit-prop="heading"]').first();
        await d.click(h, { dbl: true });
        await d.wait(300);
        await d.page.keyboard.press('Meta+a');
        await d.page.keyboard.type('Wake to *mountain* light', { delay: 70 });
        await d.page.keyboard.press('Enter');
        await d.wait(600);
      } },
      { say: 'Changes autosave about a second after you stop typing. Only the page that changed is sent, with a revision number, so two editors can never silently overwrite each other.', do: async (d) => {
        await d.wait(1500);
        await d.highlight(d.page.getByText(/Saved|All changes saved/).first(), 'Autosave');
        await d.wait(2500);
        await d.highlight(null);
      } },
      { say: 'Every major section has design variations. Switching the variant changes the layout but keeps your content, so you can try ideas freely.', do: async (d) => {
        await d.click(hero(d).locator('[data-edit-prop="subheading"]').first());
        await d.click(variantPicker(d));
        await d.wait(700);
        await d.click(popoverButton(d, /^Split/));
        await d.wait(2400);
        await d.click(variantPicker(d));
        await d.wait(500);
        await d.click(popoverButton(d, /^Cinematic/));
        await d.wait(1500);
      } },
    ],
  },
  {
    id: '33-builder-responsive', chapter: CH, title: 'Responsive styles', storage: 'admin', setup: editor,
    steps: [
      { say: 'Switch to tablet or mobile to see the page at that width. Media queries respond for real, because the canvas is an actual frame of that size.', do: async (d) => {
        await d.click(d.page.getByRole('button', { name: 'Mobile', exact: true }));
        await d.wait(1800);
      } },
      { say: 'Style edits apply to the current breakpoint and cascade down: desktop values flow to laptop, tablet and mobile unless you override them. A dot marks every override, with a one click reset.', do: async (d) => {
        await d.click(canvas(d).locator('[data-node-type]').nth(3));
        await tab(d, 'Style');
        await d.wait(800);
        await d.highlight(d.page.locator('[role="tabpanel"], aside').last(), 'Breakpoint-aware styles');
        await d.wait(2800);
        await d.highlight(null);
      } },
      { say: 'You never duplicate a component per device. Padding, typography, layout and visibility are all stored as responsive values on one component.', do: async (d) => {
        await tab(d, 'Layout');
        await d.wait(1600);
        await d.click(d.page.getByRole('button', { name: 'Desktop', exact: true }));
        await d.wait(1200);
      } },
    ],
  },
  {
    id: '34-builder-motion', chapter: CH, title: 'Motion', storage: 'admin', setup: editor,
    steps: [
      { say: 'The motion tab adds GSAP animations from a preset library: fades, reveals, clip and image masks, word and character reveals, parallax, staggered grids, pinned storytelling and horizontal scroll.', do: async (d) => {
        await d.click(hero(d).locator('[data-edit-prop="heading"]').first());
        await tab(d, 'Motion');
        await d.wait(1500);
      } },
      { say: 'Each preset has duration, delay, easing, distance, stagger and scroll triggers. Animations respect reduced motion settings, and GSAP only loads on pages that actually animate.', do: async (d) => {
        await d.scroll(0);
        await d.click(d.page.getByRole('button', { name: 'Play animations' }));
        await d.wait(2600);
        await d.click(d.page.getByRole('button', { name: 'Play animations' }));
      } },
    ],
  },
  {
    id: '35-builder-add', chapter: CH, title: 'Add and arrange', storage: 'admin', setup: editor,
    steps: [
      { say: 'To add content, drag elements from the left panel onto the canvas. A blue line shows exactly where it will land, and the component rules prevent invalid placements.', do: async (d) => {
        await rail(d, 'Add elements');
        const item = d.page.getByRole('button', { name: /^Quote/ }).first();
        const target = canvas(d).locator('[data-node-type]').nth(6);
        await d.moveTo(item, 600);
        const box = await d.box(target);
        await d.page.evaluate(([x, y]) => (window as unknown as { __tut: { move(a: number, b: number, c: number): void } }).__tut.move(x, y, 1100), [box.x + box.width / 2, box.y + 20] as const);
        await item.dragTo(target, { targetPosition: { x: box.width / 2, y: 20 } }).catch(() => undefined);
        await d.wait(900);
      } },
      { say: 'The sections panel holds over forty ready-made sections: heroes, room grids, amenities, testimonials, pricing, FAQs, galleries, contact blocks and more. Click one to insert it after your selection.', do: async (d) => {
        await rail(d, 'Sections');
        await d.wait(900);
        await d.type(d.page.getByPlaceholder('Search sections'), 'testimon', { delay: 70 });
        await d.wait(700);
        await d.click(d.page.locator('aside button').filter({ hasText: /testimon/i }).first());
        await d.wait(1500);
      } },
      { say: 'The layers panel shows the page as a tree. Drag to reorder or nest, rename, hide, or lock layers. Keyboard shortcuts cover duplicate, delete, group, move up and down, and copy and paste between pages.', do: async (d) => {
        await rail(d, 'Layers');
        await d.wait(2600);
      } },
      { say: 'And everything is undoable. Undo and redo use patches rather than snapshots, so they stay instant on very large pages, and they undo on the server too.', do: async (d) => {
        await d.press('Meta+z');
        await d.wait(700);
        await d.press('Meta+z');
        await d.wait(900);
        await d.moveTo(d.page.getByText(/Saved|All changes saved|Saving/).first(), 500);
      } },
    ],
  },
  {
    id: '36-builder-theme', chapter: CH, title: 'Theme & navigation', storage: 'admin', setup: editor,
    steps: [
      { say: 'Every website has its own design tokens: colours, fonts, a fluid type scale, spacing, corner radius, shadows, container widths, buttons and motion intensity.', do: async (d) => {
        await rail(d, 'Theme');
        await d.wait(1600);
      } },
      { say: 'Change a token and the whole site updates instantly. Here is the same site with the Midnight Luxe preset applied.', do: async (d) => {
        await scrollCanvas(d, 1500);
        await d.wait(1200);
        await d.click(d.page.getByRole('button', { name: /Midnight Luxe/ }).first());
        await d.wait(2600);
      } },
      { say: 'That is a big change, so let us undo it with one keystroke.', do: async (d) => {
        await d.press('Meta+z');
        await d.wait(1800);
      } },
      { say: 'Navigation is a tree of menus, with dropdowns, mega menus, and links to pages, anchors, phone, email or WhatsApp. Headers and footers are components too, with their own variants.', do: async (d) => {
        await rail(d, 'Navigation');
        await d.wait(2600);
      } },
    ],
  },
  {
    id: '37-builder-ai', chapter: CH, title: 'Ask AI', storage: 'admin', setup: editor,
    steps: [
      { say: 'Ask AI edits the site the same way you do. You describe the change, and the agent inspects the page and proposes builder operations.', do: async (d) => {
        await rail(d, 'Ask AI');
        await d.wait(700);
        await scrollCanvas(d, 1500);
        await d.type(d.page.getByPlaceholder('What would you like to change?'), 'Change this site to a darker color palette and squared buttons', { delay: 35 });
        await d.click(d.page.getByRole('button', { name: 'Send' }));
      } },
      { say: 'Nothing changes yet. You get a summary and a list of exactly what will be added, modified or removed, and a live preview on the canvas with a before and after toggle.', do: async (d) => {
        await d.page.getByRole('button', { name: /Apply/ }).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
        await d.wait(1200);
        const before = d.page.getByRole('button', { name: 'Before', exact: true }).first();
        if (await before.count()) {
          await d.click(before);
          await d.wait(1500);
          await d.click(d.page.getByRole('button', { name: 'After', exact: true }).first());
        }
        await d.wait(1200);
      } },
      { say: 'Apply it, and the whole change lands as a single entry in history, so one undo reverts everything the AI did.', do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Apply/ }).first());
        await d.wait(800);
        const confirm = d.page.getByRole('button', { name: /Confirm/ }).first();
        if (await confirm.count()) await d.click(confirm);
        await d.wait(2500);
      } },
      { say: 'Let us undo it. The agent can only use validated builder tools: it never touches the database, never sees credentials, and is bound by the same permissions as the person asking.', do: async (d) => {
        await d.press('Meta+z');
        await d.wait(2000);
      } },
    ],
  },
  {
    id: '38-builder-publish', chapter: CH, title: 'Publish', storage: 'admin', setup: editor,
    steps: [
      { say: 'When you are ready, click publish. Atrium first validates the whole site: missing components, broken internal links and anchors, forms without recipients, missing alt text, SEO basics, redirect loops and domain configuration.', do: async (d) => {
        await d.click(d.page.getByRole('button', { name: 'Publish' }).first());
        await d.wait(2500);
      } },
      { say: 'Blocking problems must be fixed first. Warnings link straight to the page and component that needs attention.', do: async (d) => {
        await d.type(d.page.getByPlaceholder('e.g. New rooms page and spring offers'), 'Mountain light hero', { delay: 40 });
      } },
      { say: 'Publishing freezes an immutable snapshot of the site. The public renderer only ever serves snapshots, never the live draft, so editing never breaks production.', do: async (d) => {
        await d.click(d.page.getByRole('dialog').getByRole('button', { name: /^Publish$/ }).first());
        await d.wait(2800);
      } },
    ],
  },
];
