/**
 * One builder per source component (src/components/sections/*, hero/*, gallery/*, ui/*).
 * Each mirrors the original JSX structure with editable Atrium primitives; layout and the
 * Tailwind look live in the node's own `customCss` (`&` = the node) so they travel with it.
 */
import { box, button, clipReveal, divider, eyebrow, fadeUp, heading, icon, image, lineReveal, node, parallax, section, stagger, text, type N, type Opts, type Tone } from './nodes.ts';
import { LUCIDE, maskCss } from './icons.ts';
import type { Ctx } from './context.ts';

// ── CSS fragments (Tailwind utilities, as plain declarations) ────────────────

/** Mobile-first media query, like Tailwind's `md:` etc. */
export const mq = (min: number, body: string) => `@media (min-width:${min}px){${body}}`;
export const SM = 640, MD = 768, LG = 1024, XL = 1280;
/** A 12-column track: `grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-gutter`. */
export const grid12 = (mobileGap = '3rem', extra = '') => `&{display:grid;grid-template-columns:minmax(0,1fr);gap:${mobileGap};${extra}}${mq(MD, '&{grid-template-columns:repeat(12,minmax(0,1fr));gap:2rem}')}`;
/** `md:col-span-N md:col-start-S md:order-O` */
export const col = (span: number, start?: number, order?: number) =>
  mq(MD, `&{grid-column:${start ? `${start} / span ${span}` : `span ${span} / span ${span}`};${order !== undefined ? `order:${order};` : ''}}`);
/** Photograph filling a positioned frame (`Figure mode="cover"`). `oversize` = the parallax bleed. */
export const coverCss = (oversize = 0) =>
  `&{position:absolute;inset:${oversize ? `-${oversize}px 0` : '0'};display:block;margin:0}& .a-frame,& .a-image__link{position:absolute!important;inset:0;height:100%;display:block;background:transparent}& .a-frame>.a-img{position:absolute!important;inset:0;width:100%;height:100%!important;object-fit:cover}`;
/** `img-zoom` on a `group` ancestor (put on the hovered node). */
export const zoomCss = `& .a-img{transition:scale .7s var(--lg-ease-luxe)}&:hover .a-img{scale:1.05}`;
export const hairline = (color = 'color-mix(in srgb,var(--lg-charcoal) 20%,transparent)') => `&::after{content:"";position:absolute;inset:0;border:1px solid ${color};pointer-events:none;z-index:2}`;
export const SHAPES = {
  arch: '&{-webkit-mask:var(--lg-arch) 0 0/100% 100% no-repeat;mask:var(--lg-arch) 0 0/100% 100% no-repeat}',
  scallop: '&{-webkit-mask:var(--lg-scallop) 0 0/100% 100% no-repeat;mask:var(--lg-scallop) 0 0/100% 100% no-repeat}',
  notch: '&{clip-path:polygon(var(--lg-notch) 0,100% 0,100% calc(100% - var(--lg-notch)),calc(100% - var(--lg-notch)) 100%,0 100%,0 var(--lg-notch))}',
  square: '',
  double: '',
} as const;
export type Treatment = keyof typeof SHAPES;
const textOnImage = '& :is(.a-heading,.a-text,.a-eyebrow){text-shadow:0 1px 2px rgb(var(--lg-shadow-rgb) / .45),0 2px 12px rgb(var(--lg-shadow-rgb) / .3)}';
const label = (tracking = '.15em', color = 'var(--lg-stone)') => `font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:${tracking};text-transform:uppercase;color:${color}`;
const subheading = (tracking = '.15em', color = 'var(--lg-charcoal)') => `font-family:var(--a-font-body);font-size:.875rem;line-height:1.25rem;font-weight:600;letter-spacing:${tracking};text-transform:uppercase;color:${color}`;
const display = (size: string, lh: string, color = 'var(--lg-charcoal)') => `font-family:var(--a-font-heading);font-size:${size};line-height:${lh};font-weight:400;color:${color}`;

/** An icon element drawn with the site's own mark. */
export function lgIcon(name: string, size: number, color: string, extra = '', o: Opts = {}): N {
  return icon(LUCIDE[name] ?? 'sparkle', size, { ...o, css: `&{display:inline-flex;color:${color};width:${size}px;height:${size}px;flex:none}${maskCss(name)}${extra}${o.css ?? ''}` });
}

// ── ui/* ─────────────────────────────────────────────────────────────────────

/** Eyebrow + display heading + gold rule + lead (SectionHeading.tsx). */
export function sectionHeading(c: Ctx, p: { eyebrow?: string; title: string; lead?: string; align?: 'left' | 'center'; tone?: 'dark' | 'light'; as?: 'h1' | 'h2'; mb?: [string, string]; id?: string }): N {
  const centred = p.align === 'center';
  const light = p.tone === 'light';
  const kids: N[] = [];
  if (p.eyebrow) kids.push(eyebrow(p.eyebrow, { anim: fadeUp(16), css: `&{margin:0 0 1rem;${light ? 'color:var(--lg-gold)' : ''}}` }));
  kids.push(heading(p.title, p.as ?? 'h2', 'lg', { anim: lineReveal(), css: `&{color:${light ? 'var(--lg-cream)' : 'var(--lg-charcoal)'}}` }));
  kids.push(divider({ anim: fadeUp(16), css: `&{margin:1.5rem 0 0;${centred ? 'width:4rem' : ''}}` }));
  if (p.lead) kids.push(text(p.lead, 'lg', { anim: fadeUp(20), css: `&{margin:2rem 0 0;max-width:36rem;color:${light ? 'color-mix(in srgb,var(--lg-cream) 85%,transparent)' : 'var(--lg-ink)'};${centred ? 'margin-inline:auto' : ''}}` }));
  const [mb, mbMd] = p.mb ?? ['4rem', '6rem'];
  return box(kids, { name: 'Section heading', id: p.id, css: `&{display:flex;flex-direction:column;align-items:${centred ? 'center' : 'flex-start'};${centred ? 'text-align:center;' : ''}margin-bottom:${mb}}${mq(MD, `&{margin-bottom:${mbMd}}`)}` });
}

/** The breadcrumb trail (Breadcrumb.tsx), as editable links. */
export function breadcrumb(c: Ctx, current: string, tone: 'dark' | 'light', o: Opts = {}): N {
  const light = tone === 'light';
  return box(
    [
      button('Home', c.pageLink('home'), 'ghost', { css: '' }),
      text('/', 'sm'),
      text(current, 'sm'),
    ],
    {
      name: 'Breadcrumb',
      tag: 'nav',
      ...o,
      css: `&{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;column-gap:.75rem;row-gap:.25rem}
& :is(.a-btn.a-btn,.a-text){${label('.16em', 'inherit')};padding:0;min-height:0;max-width:none}
& .a-btn.a-btn{--b-fg:${light ? 'color-mix(in srgb,var(--lg-cream) 75%,transparent)' : 'var(--lg-stone)'};color:var(--b-fg);transition:color .3s}
& .a-btn.a-btn:hover{--b-fg:${light ? 'var(--lg-gold)' : 'var(--lg-gold-ink)'}}
& .a-text:nth-child(2){color:${light ? 'var(--lg-gold)' : 'color-mix(in srgb,var(--lg-gold-ink) 70%,transparent)'}}
& .a-text:last-child{color:${light ? 'var(--lg-cream)' : 'var(--lg-charcoal)'}}${light ? textOnImage : ''}${o.css ?? ''}`,
    },
  );
}

/** ArrowLink.tsx */
export function arrowLink(label: string, link: unknown, o: Opts = {}): N {
  return button(label, link, 'link', { icon: 'arrow-right', ...o, css: `& .a-btn__icon{width:18px;height:18px}${maskCss('arrow-right', '& .a-btn__icon')}${o.css ?? ''}` });
}

/** An icon + text contact link (the `inline-flex items-center gap-3` anchors). */
export function contactLink(label: string, link: unknown, iconName: string, size = 16, o: Opts = {}): N {
  return button(label, link, 'ghost', { icon: LUCIDE[iconName] ?? 'phone', iconPosition: 'start', ...o, css: `& .a-btn__icon{width:${size}px;height:${size}px}${maskCss(iconName, '& .a-btn__icon')}${o.css ?? ''}` });
}

/** StatTile.tsx */
function statTile(stat: { value: string; suffix?: string; label: string }): N {
  return box([
    text(`${stat.value}${stat.suffix ?? ''}`, 'base', { css: `&{${display('var(--lg-display-xl)', '1')};margin:0 0 1rem;color:var(--lg-gold-ink);transition:transform .3s}` }),
    text(stat.label, 'base', { css: `&{${subheading('.15em')}}` }),
  ], {
    name: `Stat — ${stat.label}`,
    css: `&{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2.5rem;text-align:center;border:1px solid color-mix(in srgb,var(--lg-stone) 35%,transparent);background:var(--lg-surface);transition:border-color .3s}${mq(MD, '&{padding:3rem}')}&:hover{border-color:color-mix(in srgb,var(--lg-gold) 50%,transparent)}&:hover .a-text:first-child{transform:scale(1.06)}`,
  });
}

// ── sections/* ───────────────────────────────────────────────────────────────

export function intro(c: Ctx, p: { eyebrow: string; title: string; body: string[]; link?: { href: unknown; label: string } }, o: Opts & { tone?: Tone } = {}): N {
  const right: N[] = [
    box(p.body.map((para, i) => text(para, i === 0 ? 'lg' : 'base', { css: `&{color:${i === 0 ? 'var(--lg-charcoal)' : 'var(--lg-ink)'}}` })), { anim: fadeUp(24), css: '&{display:flex;flex-direction:column;gap:1.5rem}' }),
  ];
  if (p.link) right.push(arrowLink(p.link.label, p.link.href, { anim: fadeUp(16), css: '&{margin-top:2.5rem;align-self:flex-start}' }));
  return section([
    box([
      box([
        eyebrow(p.eyebrow, { anim: fadeUp(16) }),
        heading(p.title, 'h2', 'lg', { anim: lineReveal(), css: '&{margin-top:1.5rem}' }),
        divider({ anim: fadeUp(16), css: '&{margin:2rem 0 0}' }),
      ], { css: col(5) }),
      box(right, { css: col(6, 7) }),
    ], { css: grid12() }),
  ], { name: `Intro — ${p.title}`, ...o });
}

export function statBand(c: Ctx, stats: Array<{ value: string; suffix?: string; label: string }>, o: Opts & { tone?: Tone } = {}): N {
  const cols = Math.min(stats.length, 4);
  return section([
    box(stats.map(statTile), { anim: stagger(0.14, 40), css: `&{display:grid;grid-template-columns:minmax(0,1fr);gap:2rem}${mq(MD, `&{grid-template-columns:repeat(${cols},minmax(0,1fr))}`)}` }),
  ], { name: 'Stats', top: 'md', ...o });
}

export interface SplitFeatureProps {
  eyebrow: string;
  title: string;
  body: string | string[];
  detail?: readonly string[];
  image: string;
  reverse?: boolean;
  link?: { href: unknown; label: string };
  imageHeight?: 'tall' | 'standard';
  treatment?: Treatment;
}

export function splitFeature(c: Ctx, p: SplitFeatureProps, o: Opts & { tone?: Tone } = {}): N {
  const treatment = p.treatment ?? 'arch';
  const paras = typeof p.body === 'string' ? [p.body] : p.body;
  const copy: N[] = [
    eyebrow(p.eyebrow, { anim: fadeUp(16) }),
    heading(p.title, 'h2', 'lg', { anim: lineReveal(), css: '&{margin-top:1rem}' }),
    divider({ anim: fadeUp(16), css: '&{margin:1.5rem 0 0}' }),
    box(paras.map((t) => text(t)), { anim: fadeUp(24), css: '&{margin-top:2rem;display:flex;flex-direction:column;gap:1.5rem}' }),
  ];
  if (p.detail?.length) {
    copy.push(node('list', { items: p.detail.map((t) => ({ text: t })), style: 'none', columns: 1 }, undefined, {
      anim: fadeUp(20),
      css: `&{margin-top:2.5rem;display:flex;flex-direction:column;gap:0;border-top:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent);border-bottom:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent)}& li{display:block;padding:.75rem 0;${label('.15em', 'var(--lg-charcoal)')}}& li+li{border-top:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent)}`,
    }));
  }
  if (p.link) copy.push(arrowLink(p.link.label, p.link.href, { anim: fadeUp(16), css: '&{margin-top:2.5rem;align-self:flex-start}' }));
  const h = p.imageHeight === 'tall' ? ['420px', '700px'] : ['360px', '600px'];
  const isDouble = treatment === 'double';
  const frame = box([
    image(c.img(p.image), { anim: parallax(-3.75), css: `${coverCss(48)}&{translate:0 -30px}` }),
  ], {
    name: 'Frame',
    anim: clipReveal('top 85%'),
    css: `&{position:relative;overflow:hidden;height:${h[0]};background:var(--lg-surface-variant)}${mq(MD, `&{height:${h[1]}}`)}${zoomCss}${treatment === 'arch' || treatment === 'scallop' || treatment === 'notch' ? '' : hairline(isDouble ? 'color-mix(in srgb,var(--lg-gold) 55%,transparent)' : undefined)}`,
  });
  const shaped = box([frame], { name: `Shape — ${treatment}`, css: SHAPES[treatment] });
  const media = isDouble ? box([shaped], { name: 'Double rule', css: `&{position:relative;border:1px solid color-mix(in srgb,var(--lg-gold) 55%,transparent);padding:.5rem}${mq(MD, '&{padding:.75rem}')}` }) : shaped;
  return section([
    box([
      box(copy, { css: `&{display:flex;flex-direction:column}${p.reverse ? col(5, 8, 2) : col(5, undefined, 1)}` }),
      box([media], { css: p.reverse ? col(6, 1, 1) : col(6, 7, 2) }),
    ], { css: grid12('3rem', 'align-items:center') }),
  ], { name: `Feature — ${p.title}`, ...o });
}

export function scrollStory(c: Ctx, p: { eyebrow: string; title?: string; stages: Array<{ slug: string; title: string; body: string; image: string }>; link?: { href: unknown; label: string } }, o: Opts & { tone?: Tone } = {}): N {
  const story = c.name('lg-story');
  const images = p.stages.map((s, i) => image(c.img(s.image), { id: `${story}-img-${i}`, css: `${coverCss()}&{transition:opacity .7s var(--lg-ease-smooth),scale 1.2s var(--lg-ease-luxe);${i === 0 ? '' : 'opacity:0;'}}` }));
  const head: N[] = [eyebrow(p.eyebrow)];
  if (p.title) head.push(heading(p.title, 'h2', 'lg', { css: '&{margin-top:1rem}' }));
  const stages = p.stages.map((s, i) =>
    box([
      box([
        heading(s.title, 'h3', 'lg'),
        divider({ css: '&{margin:1.5rem 0 0}' }),
        text(s.body, 'lg', { css: '&{margin-top:2rem;max-width:32rem;color:var(--lg-ink)}' }),
      ], { anim: fadeUp(32, 0, { duration: 0.9, start: 'top 75%' }) }),
    ], { id: `${story}-stage-${i}`, anchor: s.slug, name: `Stage — ${s.title}`, css: `&{display:flex;flex-direction:column;justify-content:center;min-height:60vh;padding:3rem 0}${mq(MD, '&{min-height:80vh}')}` }),
  );
  const copy: N[] = [
    box(head, { css: `&{margin-bottom:3rem}${mq(MD, '&{margin-bottom:4rem}')}` }),
    box(stages, { name: 'Stages' }),
  ];
  if (p.link) copy.push(box([arrowLink(p.link.label, p.link.href)], { css: '&{padding-bottom:2rem;align-items:flex-start}' }));
  return section([
    box([
      box([
        box([
          box(images, { name: 'Photographs', css: `&{position:relative;height:46vh;overflow:hidden;background:var(--lg-surface-variant)}${mq(MD, '&{height:70vh}')}${hairline()}` }),
        ], { name: 'Sticky frame', css: '&{position:sticky;top:calc(var(--lg-nav-h) + 2rem)}' }),
      ], { css: mq(MD, '&{grid-column:7 / span 6;order:2}') }),
      box(copy, { css: mq(MD, '&{grid-column:span 5 / span 5;order:1}') }),
    ], { id: story, css: grid12() }),
  ], { name: `Story — ${p.title ?? p.eyebrow}`, ...o });
}

export function eventTypeGrid(c: Ctx, p: { eyebrow?: string; title: string; lead?: string; linkTo?: string; detailed?: boolean }, o: Opts & { tone?: Tone } = {}): N {
  const cards = c.data.EVENT_TYPES.map((e) => {
    const kids: N[] = [
      image(c.img(e.image), { css: coverCss() }),
      box([
        lgIcon(e.icon, 28, 'var(--lg-gold)'),
        heading(e.title, 'h3', 'sm', { css: '&{margin-top:1.5rem;color:var(--lg-cream)}' }),
        text(p.detailed ? e.body : e.summary, 'base', { css: '&{margin-top:.75rem;color:color-mix(in srgb,var(--lg-cream) 90%,transparent)}' }),
      ], { css: `&{position:relative;z-index:10}${textOnImage}` }),
    ];
    if (p.linkTo) kids.push(button(e.title, `${p.linkTo}#${e.slug}`, 'ghost', { id: c.name('lg-cardlink'), name: 'Card link', css: '&{position:absolute!important;inset:0;z-index:11;font-size:0!important;color:transparent!important}& .a-btn__label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' }));
    return box(kids, {
      tag: 'article',
      anchor: e.slug,
      name: `Occasion — ${e.title}`,
      css: `&{position:relative;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;background:var(--lg-charcoal);padding:2rem;height:${p.detailed ? '500px' : '420px'}}&::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(to top,var(--lg-charcoal),color-mix(in srgb,var(--lg-charcoal) 60%,transparent),color-mix(in srgb,var(--lg-charcoal) 20%,transparent));transition:opacity .5s;pointer-events:none}&:hover::before{opacity:.9}${zoomCss}`,
    });
  });
  return section([
    sectionHeading(c, { eyebrow: p.eyebrow, title: p.title, lead: p.lead }),
    box(cards, { anim: stagger(0.1, 40), css: `&{display:grid;grid-template-columns:minmax(0,1fr);gap:2rem}${mq(SM, '&{grid-template-columns:repeat(2,minmax(0,1fr))}')}${mq(LG, '&{grid-template-columns:repeat(3,minmax(0,1fr))}')}` }),
  ], { name: `Occasions — ${p.title}`, ...o });
}

export function packages(c: Ctx, p: { href?: string }, o: Opts & { tone?: Tone } = {}): N {
  const cards = c.data.PACKAGES.map((pack) => {
    const plus = '& .a-list__mark{width:16px;height:16px;margin-top:.25rem;color:var(--lg-gold-ink)}' + maskCss('plus', '& .a-list__mark');
    return box([
      box([
        heading(pack.name, 'h3', 'md'),
        ...(pack.highlight ? [text(pack.highlight, 'sm', { css: `&{border:1px solid var(--lg-gold-ink);padding:.25rem .75rem;${label('.15em', 'var(--lg-gold-ink)')};white-space:nowrap}` })] : []),
      ], { css: '&{display:flex;flex-direction:row;align-items:flex-start;justify-content:space-between;gap:1rem}' }),
      text('Starting from', 'sm', { css: `&{margin-top:2.5rem;${label()}}` }),
      text(c.data.prices[pack.slug]!, 'base', { css: `&{margin-top:.5rem;${display('var(--lg-display-xl)', '1')};letter-spacing:-0.02em}` }),
      text(pack.unit, 'sm', { css: `&{margin-top:.75rem;${label()}}` }),
      box([
        text(String(pack.total), 'base', { css: `&{${display('2rem', '2.5rem', 'var(--lg-gold-ink)')}}` }),
        text('food items in total', 'sm', { css: `&{${label()}}` }),
      ], { css: '&{margin-top:2.5rem;display:flex;flex-direction:row;align-items:baseline;gap:.75rem;border-top:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent);padding-top:2.5rem}' }),
      text(pack.summary, 'base', { css: '&{margin-top:1rem}' }),
      node('list', { items: pack.inclusions.map((t) => ({ text: t, icon: 'plus' })), style: 'icon', columns: 1 }, undefined, {
        css: `&{margin-top:2rem;display:flex;flex-direction:column;gap:1rem;border-top:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent);padding-top:2rem}& li{display:flex;align-items:flex-start;gap:1rem;font-size:1rem;line-height:1.625rem;color:var(--lg-ink)}${plus}`,
      }),
      box([
        button(`Enquire — ${pack.name}`, `/contact?package=${pack.slug}`, pack.highlight ? 'primary' : 'outline', { full: true }),
      ], { anim: fadeUp(12), css: '&{margin-top:3rem;padding-top:.5rem}' }),
    ], {
      tag: 'article',
      name: `Package — ${pack.name}`,
      css: `&{display:flex;flex-direction:column;border:1px solid ${pack.highlight ? 'color-mix(in srgb,var(--lg-gold) 50%,transparent)' : 'color-mix(in srgb,var(--lg-charcoal) 20%,transparent)'};background:var(--lg-cream);padding:2.5rem}${mq(MD, '&{padding:3rem}')}`,
    });
  });
  const foot: N[] = [text('Menus are customised to your event.')];
  if (p.href) foot.push(button('See Both Packages in Full', p.href, 'outline'));
  return section([
    sectionHeading(c, { eyebrow: 'Our Packages', title: 'Wedding & Event Menus', lead: 'Luxury dining for every celebration, priced per person. Both packages are served from our own kitchen and can be adjusted to your menu.', align: 'center' }),
    box(cards, { anim: stagger(0.14, 40), css: `&{display:grid;grid-template-columns:minmax(0,1fr);gap:2rem}${mq(MD, '&{grid-template-columns:repeat(2,minmax(0,1fr))}')}` }),
    box(foot, { anim: fadeUp(16), css: '&{margin-top:3rem;display:flex;flex-direction:column;align-items:center;gap:1.5rem;text-align:center}' }),
  ], { name: 'Packages', anchor: 'packages', ...o });
}

export function facilityStrip(c: Ctx, o: Opts & { tone?: Tone } = {}): N {
  const cells = c.data.FACILITIES.map((f) =>
    box([
      lgIcon(f.icon, 26, 'var(--lg-gold-ink)'),
      text(f.value, 'base', { css: `&{margin-top:1.5rem;${display('1.5rem', '2rem')}}` }),
      text(f.label, 'sm', { css: `&{margin-top:.5rem;${label()}}` }),
    ], { name: `Facility — ${f.label}`, css: '&{display:flex;flex-direction:column;background:var(--lg-cream);padding:2rem}' }),
  );
  return section([
    sectionHeading(c, { eyebrow: 'Venue Features', title: 'The Estate in Detail', mb: ['4rem', '5rem'] }),
    box(cells, { anim: stagger(0.05, 24), css: `&{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:color-mix(in srgb,var(--lg-charcoal) 20%,transparent)}${mq(MD, '&{grid-template-columns:repeat(4,minmax(0,1fr))}')}` }),
  ], { name: 'Facilities', ...o });
}

export function iconGrid(c: Ctx, p: { eyebrow?: string; title: string; lead?: string; items: Array<{ title: string; body: string; icon: string }> }, o: Opts & { tone?: Tone } = {}): N {
  const cards = p.items.map((it) =>
    box([
      lgIcon(it.icon, 32, 'var(--lg-gold-ink)', '&{transition:transform .5s}'),
      node('heading', { text: it.title, level: 'h3', size: 'sm', font: 'body' }, undefined, { css: `&{margin-top:2rem;${subheading('.15em')};font-size:.875rem!important;line-height:1.25rem!important}` }),
      text(it.body, 'base', { css: '&{margin-top:1rem}' }),
    ], { tag: 'article', name: `Item — ${it.title}`, css: '&{display:flex;flex-direction:column;background:var(--lg-cream);padding:2.5rem;transition:background-color .5s}&:hover{background:var(--lg-surface-low)}&:hover .a-icon-el{transform:translateY(-.25rem)}' }),
  );
  return section([
    sectionHeading(c, { eyebrow: p.eyebrow, title: p.title, lead: p.lead, align: 'center' }),
    box(cards, { anim: stagger(0.08, 40), css: `&{display:grid;grid-template-columns:minmax(0,1fr);gap:1px;background:color-mix(in srgb,var(--lg-charcoal) 20%,transparent)}${mq(SM, '&{grid-template-columns:repeat(2,minmax(0,1fr))}')}${mq(LG, '&{grid-template-columns:repeat(3,minmax(0,1fr))}')}` }),
  ], { name: `Grid — ${p.title}`, ...o });
}

export function quote(c: Ctx): N {
  return section([
    box([
      box([lgIcon('quote', 40, 'var(--lg-gold)', '&{opacity:.5}')], { anim: fadeUp(12) }),
      text(c.data.PHILOSOPHY.quote, 'base', { anim: lineReveal(), css: `&{margin-top:2.5rem;max-width:56rem;${display('var(--lg-headline-lg)', '1.375', 'var(--lg-cream)')};font-style:italic;text-wrap:pretty}` }),
      text(`— ${c.data.PHILOSOPHY.attribution}`, 'base', { anim: fadeUp(16), css: `&{margin-top:3rem;${subheading('.2em', 'var(--lg-gold)')}}` }),
    ], { css: '&{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center}' }),
  ], {
    name: 'Philosophy',
    tone: 'inverse',
    top: 'xl',
    css: '&{position:relative;overflow:hidden}&::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at center,var(--lg-gold) 0%,transparent 62%);opacity:.12;pointer-events:none}',
  });
}

export function locationBlock(c: Ctx, o: Opts & { tone?: Tone } = {}): N {
  const C = c.data.CONTACT;
  const addressLines = c.cfg.key === 'vilasa-by-leela' ? `${C.address.street}\n${C.address.locality} ${C.address.postalCode}\n${C.address.region}, ${C.address.country}` : `${C.address.locality}\n${C.address.region}, ${C.address.country}`;
  const dt = (t: string) => text(t, 'sm', { css: `&{${label('.2em')}}` });
  const dl = box([
    box([dt('Location'), text(addressLines, 'base', { css: '&{margin-top:1rem;color:var(--lg-charcoal)}' })]),
    box([
      dt('Enquiries'),
      box([
        contactLink(C.landline, { type: 'tel', phone: C.landline }, 'phone', 16),
        contactLink(C.mobile, { type: 'tel', phone: C.mobile }, 'phone', 16),
        contactLink(C.email, { type: 'email', email: C.email }, 'mail', 16),
      ], { css: '&{margin-top:1rem;display:flex;flex-direction:column;align-items:flex-start;gap:.5rem}' }),
    ]),
    box([
      dt('Hours'),
      box([
        ...C.hours.map((h) => text(`${h.days} · ${h.time}`, 'base', { css: '&{color:var(--lg-charcoal)}' })),
        text(C.hoursNote, 'sm', { css: `&{margin-top:.5rem;${label('.15em')}}` }),
      ], { css: '&{margin-top:1rem;display:flex;flex-direction:column;gap:.25rem}' }),
    ]),
    button('Open in Google Maps', { type: 'url', href: `https://www.google.com/maps/search/?api=1&query=${C.mapsPlaceQuery}`, newTab: true }, 'link', {
      icon: 'map-pin',
      iconPosition: 'start',
      css: `&{align-self:stretch;justify-content:flex-start;gap:.75rem;border-bottom:1px solid var(--lg-gold-ink);padding-bottom:.5rem!important;transition:color .3s,border-color .3s}&:hover{border-color:var(--lg-charcoal)}& .a-btn__icon{width:16px;height:16px}${maskCss('pin', '& .a-btn__icon')}&:hover .a-btn__icon{transform:none}`,
    }),
  ], { anim: fadeUp(24), css: `&{display:flex;flex-direction:column;gap:3rem;border-top:1px solid color-mix(in srgb,var(--lg-gold) 50%,transparent);padding-top:2rem}${col(4)}` });
  const map = box([
    node('embed', { mode: 'iframe', url: C.mapsEmbedUrl, title: `Map showing the location of ${c.data.SITE.name} in ${C.address.locality}`, aspect: '3:2' }, undefined, {
      css: `&{position:absolute!important;inset:0;aspect-ratio:auto!important;height:100%!important}& iframe{position:absolute;inset:0;width:100%;height:100%;border:0;filter:grayscale(25%)}`,
    }),
  ], { anim: fadeUp(24), css: `&{position:relative;aspect-ratio:4/3;overflow:hidden;background:var(--lg-surface-variant)}${mq(MD, '&{aspect-ratio:3/2}')}${hairline()}${col(7, 6)}` });
  return section([
    sectionHeading(c, { eyebrow: 'Find Us', title: 'Visit the Estate', lead: 'We welcome private viewings by appointment — walk the hall, see the scale, and picture your own evening in it.', mb: ['4rem', '5rem'] }),
    box([dl, map], { css: grid12() }),
  ], { name: 'Location', ...o });
}

export function ctaBand(c: Ctx, p: { title: string; lead: string; action: { href: unknown; label: string }; secondary?: { href: unknown; label: string }; image: string }): N {
  const buttons: N[] = [box([button(p.action.label, p.action.href, 'secondary', { size: 'lg' })], { id: c.name('lg-magnetic'), css: '&{display:inline-block}' })];
  if (p.secondary) buttons.push(button(p.secondary.label, p.secondary.href, 'outline', { size: 'lg' }));
  return section([
    image(c.img(p.image), { anim: { preset: 'parallax', distance: 5.4, scrub: 1, trigger: 'scroll', start: 'top bottom', end: 'bottom top' }, css: `${coverCss(64)}&{translate:0 35px}` }),
    box([
      heading(p.title, 'h2', 'lg', { anim: lineReveal(), css: '&{max-width:48rem;color:var(--lg-cream)}' }),
      box([text(p.lead, 'lg', { css: '&{margin-inline:auto;max-width:42rem;color:color-mix(in srgb,var(--lg-cream) 90%,transparent)}' })], { anim: fadeUp(20), css: '&{margin-top:2rem}' }),
      box(buttons, { anim: fadeUp(20), css: `&{margin-top:3rem;display:flex;flex-direction:column;gap:1rem}${mq(SM, '&{flex-direction:row}')}` }),
    ], { css: `&{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;text-align:center}${textOnImage}` }),
  ], {
    name: `Call to action — ${p.title}`,
    tone: 'inverse',
    top: 'xl',
    css: '&{position:relative;overflow:hidden;background:var(--lg-charcoal)}&::after{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--lg-charcoal) 80%,transparent);pointer-events:none}',
  });
}

export function bentoGrid(c: Ctx, p: { eyebrow?: string; title: string; lead?: string; items: Array<{ title: string; body: string; icon: string; span: 'wide' | 'standard'; image?: string }> }, o: Opts & { tone?: Tone } = {}): N {
  const cards = p.items.map((it) => {
    const img = it.image !== undefined;
    const kids: N[] = [];
    if (img) kids.push(image(c.img(it.image!), { css: coverCss() }));
    kids.push(box([
      lgIcon(it.icon, 28, img ? 'var(--lg-gold)' : 'var(--lg-gold-ink)'),
      heading(it.title, 'h3', 'md', { css: `&{margin-top:1.5rem;color:${img ? 'var(--lg-cream)' : 'var(--lg-charcoal)'}}` }),
      text(it.body, 'base', { css: `&{margin-top:1rem;color:${img ? 'color-mix(in srgb,var(--lg-cream) 90%,transparent)' : 'var(--lg-ink)'}}` }),
    ], { css: `&{position:relative;z-index:10;max-width:28rem}${img ? textOnImage : ''}` }));
    const wide = it.span === 'wide';
    return box(kids, {
      tag: 'article',
      name: `Inclusion — ${it.title}`,
      css: `&{position:relative;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;padding:2rem;${img ? 'min-height:380px;background:var(--lg-charcoal)' : 'min-height:280px;border:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent);background:var(--lg-surface-low)'}}${mq(MD, `&{padding:2.5rem;min-height:440px;grid-column:span ${wide ? 2 : 1} / span ${wide ? 2 : 1}}`)}${img ? `&::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(to top,var(--lg-charcoal),color-mix(in srgb,var(--lg-charcoal) 55%,transparent),transparent);pointer-events:none}${zoomCss}` : ''}`,
    });
  });
  return section([
    sectionHeading(c, { eyebrow: p.eyebrow, title: p.title, lead: p.lead, mb: ['4rem', '5rem'] }),
    box(cards, { anim: stagger(0.1, 40), css: `&{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem}${mq(MD, '&{grid-template-columns:repeat(3,minmax(0,1fr));gap:2rem}')}` }),
  ], { name: `Bento — ${p.title}`, anchor: 'inclusions', ...o });
}

// ── gallery/* ────────────────────────────────────────────────────────────────

export function galleryPreview(c: Ctx): N {
  const preview = c.data.GALLERY_ITEMS.slice(0, 7);
  const items = preview.map((it, i) =>
    image(c.img(it.key), {
      link: c.pageLink('gallery'),
      caption: it.caption,
      name: `Rail — ${it.caption}`,
      css: `&{width:78vw;flex:none;scroll-snap-align:center;display:block}${mq(SM, '&{width:52vw}')}${mq(LG, '&{width:34vw}')}${mq(XL, '&{width:27vw}')}
& .a-image__link{display:block}
& .a-frame{position:relative;overflow:hidden;background:var(--lg-surface-variant);height:${i % 3 === 1 ? '46vh' : '38vh'}}${mq(LG, `& .a-frame{height:${i % 3 === 1 ? '58vh' : '46vh'}}`)}
& .a-frame>.a-img{position:absolute!important;inset:0;width:100%;height:100%!important;object-fit:cover;transition:scale .7s var(--lg-ease-luxe)}
& .a-image__link:hover .a-img{scale:1.05;transform:none}
& .a-frame::after{content:"";position:absolute;inset:0;border:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent);pointer-events:none}
& .a-caption{margin-top:1rem;${label('.16em')};transition:color .3s}&:hover .a-caption{color:var(--lg-gold-ink)}`,
    }),
  );
  return section([
    box([
      box([
        eyebrow('Our Gallery', { anim: fadeUp(16) }),
        heading('Memorable Celebrations', 'h2', 'lg', { anim: lineReveal(), css: '&{margin-top:1rem}' }),
      ]),
      box([arrowLink('View the Gallery', c.pageLink('gallery'))], { anim: fadeUp(16), css: '&{align-items:flex-start}' }),
    ], { css: `&{margin-bottom:3.5rem;display:flex;flex-direction:column;gap:2rem}${mq(MD, '&{flex-direction:row;align-items:flex-end;justify-content:space-between}')}` }),
    box(items, {
      name: 'Rail',
      anim: { preset: 'slide-left', target: 'children', distance: 48, stagger: 0.09, duration: 1, ease: 'power2.inOut', trigger: 'scroll', start: 'top 85%', once: true },
      css: `&{display:flex;flex-direction:row;gap:1.5rem;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;margin-inline:calc(-1 * var(--a-gutter));padding:0 var(--a-gutter) 2rem}${mq(MD, '&{gap:2rem}')}`,
    }),
    box([
      lgIcon('arrow-right', 16, 'var(--lg-gold-ink)'),
      text('Scroll sideways', 'sm', { css: `&{${label('.16em')}}` }),
    ], { css: '&{display:flex;flex-direction:row;align-items:center;gap:.75rem}' }),
  ], { name: 'Gallery preview', tone: 'surface-alt', top: 'none', width: 'default', style: { padding: { base: '6rem 0', mobile: '5rem 0' } } });
}

export function videoGallery(c: Ctx): N {
  const cards = c.data.GALLERY_VIDEOS.map((v) => {
    const poster = c.img(v.poster);
    const video =
      v.source.kind === 'file'
        ? node('video', { source: 'file', video: { src: c.asset(`video/${v.source.src.split('/').pop()}`), mimeType: 'video/mp4' }, poster, title: v.title, aspect: '16:9', autoplay: false, loop: false, muted: false, controls: true, rounded: 'sm' }, undefined, { id: c.name('lg-film') })
        : node('video', { source: 'youtube', url: `https://www.youtube.com/watch?v=${v.source.videoId}`, poster, title: v.title, aspect: '16:9', autoplay: false, loop: false, muted: false, controls: true, rounded: 'sm' }, undefined, {});
    return box([
      video,
      heading(v.title, 'h3', 'sm', { css: '&{margin-top:1.25rem}' }),
      text(v.caption, 'base', { css: '&{margin-top:.5rem}' }),
    ], { tag: 'article', name: `Film — ${v.title}` });
  });
  return section([
    sectionHeading(c, { eyebrow: 'On Film', title: 'The Estate in Motion', lead: 'Two short films: a walk through the spaces, and an evening in full swing.', mb: ['3rem', '4rem'] }),
    box(cards, { anim: stagger(0.12, 40), css: `&{display:grid;grid-template-columns:minmax(0,1fr);gap:2.5rem}${mq(MD, '&{grid-template-columns:repeat(2,minmax(0,1fr))}')}` }),
  ], { name: 'Films', anchor: 'films', top: 'md' });
}

export function galleryGrid(c: Ctx): N {
  const labels = new Map(c.data.GALLERY_CATEGORIES.map((g) => [g.id, g.label]));
  const images = c.data.GALLERY_ITEMS.map((it) => ({ ...c.img(it.key), caption: it.caption, category: labels.get(it.category) ?? it.category }));
  return section([
    node('gallery', { tone: 'transparent', containerWidth: 'full', spacingTop: 'none', spacingBottom: 'none', eyebrow: '', heading: '', subheading: '', images, columns: 3, gap: 'md', lightbox: true, showCaptions: true, align: 'left', headingLevel: 'h2' }, undefined, { id: 'lg-gallery', variant: 'masonry', name: 'Gallery' }),
    text(`Showing ${images.length} of ${images.length} photographs`, 'sm', { id: 'lg-gallery-count', css: `&{margin-top:4rem;text-align:center;${label('.2em')}}` }),
  ], { name: 'Photographs', top: 'md' });
}

// ── hero/* ───────────────────────────────────────────────────────────────────

/** PageHero.tsx — photographic (`image`) or typographic (`plain`). */
export function pageHero(c: Ctx, p: { page: string; crumb: string; eyebrow: string; title: string; lead?: string; image?: string; clip?: boolean }): N {
  const isImage = !!p.image;
  const copy: N[] = [
    breadcrumb(c, p.crumb, isImage ? 'light' : 'dark', { anim: fadeUp(16, 0.2, { trigger: 'load' }), css: '&{margin-bottom:1.5rem}' }),
    eyebrow(p.eyebrow, { anim: fadeUp(16, 0.28, { trigger: 'load' }), css: `&{${isImage ? 'color:var(--lg-gold)' : 'color:var(--lg-stone)'}}${isImage ? textOnImage : ''}` }),
    heading(p.title, 'h1', 'display', { anim: lineReveal(0.4, { trigger: 'load' }), css: `&{margin-top:1.5rem;color:${isImage ? 'var(--lg-cream)' : 'var(--lg-charcoal)'}}${isImage ? textOnImage : ''}` }),
  ];
  if (p.lead) copy.push(text(p.lead, 'lg', { anim: fadeUp(20, 0.85, { trigger: 'load' }), css: `&{margin-top:2rem;max-width:42rem;color:${isImage ? 'var(--lg-cream)' : 'var(--lg-ink)'}}${isImage ? textOnImage : ''}` }));
  const content = box([box(copy, { css: '&{max-width:48rem}' })], { css: `&{position:relative;z-index:10;padding-top:calc(var(--lg-nav-h) + ${isImage ? '4rem' : '5rem'})}` });
  if (!isImage) {
    return section([content], { id: `lg-plainhero-${p.page}`, name: `Page hero — ${p.title}`, top: 'none', style: { padding: { base: '0 0 6rem', mobile: '0 0 4rem' } } });
  }
  return section([
    box([image(c.img(p.image!), { priority: true, css: coverCss() })], { id: `lg-pagehero-${p.page}-bg`, name: 'Backdrop', anim: { preset: 'fade', duration: 1.8, trigger: 'load', ease: 'power3.inOut' }, css: '&{position:absolute;inset:0;will-change:transform}& .a-image{transform:translateY(calc(var(--lg-p,0) * 14%))}& .a-img{animation:lg-settle 1.8s var(--lg-ease-reveal) both}' }),
    content,
  ], {
    id: `lg-pagehero-${p.page}`,
    name: `Page hero — ${p.title}`,
    tone: 'inverse',
    top: 'none',
    css: `&{position:relative;overflow:hidden;display:flex;align-items:flex-end;min-height:560px;padding-bottom:5rem;background:var(--lg-charcoal)}${mq(MD, '&{min-height:70vh;padding-bottom:7rem}')}&::before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(to top,color-mix(in srgb,var(--lg-charcoal) 85%,transparent),color-mix(in srgb,var(--lg-charcoal) 45%,transparent),color-mix(in srgb,var(--lg-charcoal) 30%,transparent));pointer-events:none}${p.clip ? '&{clip-path:polygon(0 0,100% 0,100% 90%,0 100%)}' : ''}`,
  });
}

/** Hero.tsx — the homepage film. */
export function homeHero(c: Ctx): N {
  return node('hero', {
    tone: 'inverse',
    containerWidth: 'default',
    spacingTop: 'none',
    spacingBottom: 'none',
    eyebrow: `${c.data.SITE.name} · Kathmandu`,
    heading: 'Where Every\nCelebration\nIs Remembered',
    subheading: 'A luxury banquet estate for weddings, receptions and celebrations — one address, one team, one evening that runs to time.',
    buttons: [
      { label: 'Plan Your Event', link: c.pageLink('contact'), style: 'secondary', iconPosition: 'end' },
      { label: 'Explore the Venue', link: c.pageLink('venue'), style: 'outline', iconPosition: 'end' },
    ],
    image: c.img('hero-film-poster'),
    video: { src: c.asset('video/hero-1080.h264.mp4'), mimeType: 'video/mp4' },
    overlayOpacity: 0,
    contentPosition: 'bottom-left',
    height: 'screen',
    showScrollCue: true,
  }, undefined, {
    id: 'lg-hero',
    variant: 'fullscreen-video',
    name: 'Hero',
    anim: { preset: 'cinematic-reveal', duration: 2.2, ease: 'power3.inOut', stagger: 0.14, trigger: 'load' },
    css: `&{min-height:max(620px,100svh);height:100svh;background:var(--lg-charcoal)}
& .a-hero__media>*{transform:translateY(calc(var(--lg-p,0) * 12%)) scale(calc(1 + var(--lg-p,0) * .08))}
& .a-hero__copy{transform:translateY(calc(var(--lg-p70,0) * -18%));opacity:calc(1 - var(--lg-p70,0))}
& .a-overlay{opacity:1!important;background:linear-gradient(to top,color-mix(in srgb,var(--lg-charcoal) 70%,transparent) 0%,color-mix(in srgb,var(--lg-charcoal) 24%,transparent) 18%,transparent 44%)}
& .a-hero__inner{padding:calc(var(--lg-nav-h) + 2rem) var(--a-gutter) 4rem!important;max-width:calc(1280px + 2 * var(--a-gutter))}${mq(MD, '& .a-hero__inner{padding-bottom:6rem!important}')}
& .a-hero__copy{position:relative;display:block;max-width:56rem;gap:0}
& .a-hero__copy::before{content:"";position:absolute;inset:-14% -30% -34% -34%;z-index:-1;pointer-events:none;background:radial-gradient(64% 64% at 38% 56%,color-mix(in srgb,var(--lg-charcoal) 92%,transparent) 0%,color-mix(in srgb,var(--lg-charcoal) 80%,transparent) 42%,color-mix(in srgb,var(--lg-charcoal) 46%,transparent) 70%,transparent 90%)}
& .a-hero__eyebrow{display:block;color:var(--lg-gold);letter-spacing:.22em}
& .a-hero__heading{margin-top:1.5rem;font-size:var(--lg-display-xl)!important;line-height:1.06;letter-spacing:-0.02em;color:var(--lg-cream);max-width:none}
& .a-hero__sub{margin-top:1.5rem;max-width:36rem;font-size:1.125rem;line-height:1.75rem;color:var(--lg-cream)!important}
& .a-hero__actions{margin-top:2.5rem;gap:1rem}
& .a-hero__actions .a-btn{padding:1.25rem 2.5rem}${mq(MD, '& .a-hero__actions .a-btn{padding-inline:3rem}')}
@media (max-width:639px){& .a-hero__actions{flex-direction:column;align-items:flex-start}}
& :is(.a-hero__eyebrow,.a-hero__heading,.a-hero__sub){text-shadow:0 1px 2px rgb(var(--lg-shadow-rgb) / .55),0 2px 10px rgb(var(--lg-shadow-rgb) / .45),0 6px 30px rgb(var(--lg-shadow-rgb) / .35)}
& .a-hero__cue{display:none;right:1rem;bottom:16rem;width:2.5rem;writing-mode:initial;gap:1rem;color:color-mix(in srgb,var(--lg-cream) 80%,transparent);letter-spacing:.25em;font-size:.8125rem;font-weight:600}
${mq(MD, '& .a-hero__cue{display:flex}')}${mq(LG, '& .a-hero__cue{right:2rem;bottom:17rem;width:3.25rem}')}
& .a-hero__cue>span:last-child{writing-mode:vertical-rl;order:-1;text-shadow:0 1px 2px rgb(var(--lg-shadow-rgb) / .45),0 2px 12px rgb(var(--lg-shadow-rgb) / .3)}
& .a-hero__cue-line{position:relative;width:1px;height:5rem;overflow:hidden;background:color-mix(in srgb,var(--lg-cream) 35%,transparent);animation:none}
& .a-hero__cue-line::after{content:"";position:absolute;left:0;right:0;top:0;height:2rem;background:var(--lg-gold);animation:lg-cue 2.45s ease-in-out infinite}
@keyframes lg-cue{0%{transform:translateY(-100%);opacity:0}14%{opacity:1}45%{opacity:1}65%{transform:translateY(250%);opacity:0}100%{transform:translateY(250%);opacity:0}}`,
  });
}
