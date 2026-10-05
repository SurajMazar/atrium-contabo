/**
 * The site stylesheet (WebsiteDefinition.customCss): globals.css + the Tailwind utility look of
 * the shared components, keyed on Atrium's own component classes so that elements an editor adds
 * later pick up the same design system.
 *
 * Specificity contract (site CSS is emitted *after* node styles):
 *  - rules that must beat Atrium component CSS use `.atrium-site .a-x` (0,2,0, later wins);
 *  - rules for properties node `style` may set use `:where()` so the inspector still wins.
 */
import type { SiteConfig } from './config.ts';

export function siteCss(cfg: SiteConfig, iconVars: string): string {
  const c = cfg.palette;
  const navCaptions = cfg.navCaptions
    .map((cap, i) => `.atrium-site .a-mnav>li:nth-child(${i + 1})>.a-mnav__link::after{content:${JSON.stringify(cap)}}`)
    .join('\n');
  return `
/* ── tokens (globals.css @theme) ─────────────────────────────────────────── */
.atrium-site{
  --lg-cream:var(--a-color-background);--lg-charcoal:var(--a-color-inverse);--lg-gold:var(--a-color-gold);--lg-stone:var(--a-color-muted);
  --lg-surface:var(--a-color-surface);--lg-surface-low:var(--a-color-surface-alt);--lg-surface-mid:var(--a-color-surface-mid);--lg-surface-variant:var(--a-color-surface-variant);
  --lg-gold-deep:var(--a-color-gold-deep);--lg-gold-light:var(--a-color-gold-light);--lg-gold-ink:var(--a-color-gold-ink);--lg-ink:var(--a-color-ink);
  --lg-hairline:color-mix(in srgb,var(--lg-charcoal) 18%,transparent);--lg-hairline-gold:color-mix(in srgb,var(--lg-gold) 45%,transparent);
  --lg-shadow-rgb:${c.shadowRgb};
  --lg-nav-h:88px;--a-header-h:88px;
  --lg-display-xl:clamp(2.25rem,min(5.6vw,9.5vh),5.25rem);--lg-headline-lg:clamp(2rem,3.6vw,3rem);
  --lg-ease-reveal:cubic-bezier(0.77,0,0.175,1);--lg-ease-luxe:cubic-bezier(0.25,1,0.5,1);--lg-ease-smooth:cubic-bezier(0.4,0,0.2,1);
  --lg-notch:2.25rem;
  --a-gutter:24px;--a-gap:32px;
  font-size:1rem;line-height:1.5rem;font-weight:400;color:var(--lg-charcoal);overflow-x:hidden;
}
@media (min-width:768px){.atrium-site{--a-gutter:48px}}
@media (min-width:1280px){.atrium-site{--a-gutter:80px}}
@media (max-width:767px){.atrium-site{--lg-nav-h:72px;--a-header-h:72px}}
html{scroll-behavior:auto;-webkit-text-size-adjust:100%}
html.lenis,html.lenis body{height:auto}
.lenis.lenis-smooth{scroll-behavior:auto!important}
.lenis.lenis-stopped{overflow:hidden}
${iconVars}

/* ── base ───────────────────────────────────────────────────────────────── */
.atrium-site *,.atrium-site *::before,.atrium-site *::after{border-color:var(--lg-hairline)}
.atrium-site :where(h1,h2,h3,h4){font-family:var(--a-font-heading);font-weight:400;font-optical-sizing:auto;text-wrap:balance}
.atrium-site ::selection{background-color:var(--lg-gold);color:var(--lg-charcoal)}
.atrium-site :focus-visible{outline:2px solid var(--lg-gold);outline-offset:3px;border-radius:0}
.atrium-site :where(input,select,textarea){font-family:var(--a-font-body);border-radius:0}
${cfg.hideNativeCursor ? `.atrium-site[data-custom-cursor='active'],.atrium-site[data-custom-cursor='active'] a,.atrium-site[data-custom-cursor='active'] button{cursor:none}` : ''}

/* containers: the 1440px estate measure with 24 / 48 / 80px margins */
.atrium-site .a-section>.a-flow{gap:0}
.atrium-site .a-box{gap:0}
/* section rhythm: lg = "full" (py-16 md:py-20), md = "half" (py-10 md:py-14), xl = "wide" (py-24 md:py-40) */
.atrium-site .a-section:not(.a-section--nested).a-pt-lg{padding-top:4rem}.atrium-site .a-section:not(.a-section--nested).a-pb-lg{padding-bottom:4rem}
.atrium-site .a-section:not(.a-section--nested).a-pt-md{padding-top:2.5rem}.atrium-site .a-section:not(.a-section--nested).a-pb-md{padding-bottom:2.5rem}
.atrium-site .a-section:not(.a-section--nested).a-pt-xl{padding-top:6rem}.atrium-site .a-section:not(.a-section--nested).a-pb-xl{padding-bottom:6rem}
.atrium-site .a-section:not(.a-section--nested).a-pt-sm{padding-top:2rem}.atrium-site .a-section:not(.a-section--nested).a-pb-sm{padding-bottom:2rem}
@media (min-width:768px){
  .atrium-site .a-section:not(.a-section--nested).a-pt-lg{padding-top:5rem}.atrium-site .a-section:not(.a-section--nested).a-pb-lg{padding-bottom:5rem}
  .atrium-site .a-section:not(.a-section--nested).a-pt-md{padding-top:3.5rem}.atrium-site .a-section:not(.a-section--nested).a-pb-md{padding-bottom:3.5rem}
  .atrium-site .a-section:not(.a-section--nested).a-pt-xl{padding-top:10rem}.atrium-site .a-section:not(.a-section--nested).a-pb-xl{padding-bottom:10rem}
}
/* tones: cream / surface / surface-low / charcoal */
.atrium-site .a-tone-inverse{--t-muted:color-mix(in srgb,var(--lg-cream) 70%,transparent);--t-border:color-mix(in srgb,var(--lg-cream) 20%,transparent)}

/* ── type scale ─────────────────────────────────────────────────────────── */
.atrium-site .a-heading{font-weight:400;letter-spacing:normal}
.atrium-site .a-heading--display{font-size:var(--lg-display-xl)!important;line-height:1.06;letter-spacing:-0.02em}
.atrium-site .a-heading--lg{font-size:var(--lg-headline-lg)!important;line-height:1.16}
.atrium-site .a-heading--md{font-size:2rem!important;line-height:2.5rem}
.atrium-site .a-heading--sm{font-size:1.5rem!important;line-height:2rem}
.atrium-site .a-heading.a-font-body{font-family:var(--a-font-body)}
.atrium-site .a-text{max-width:none;font-size:1rem;line-height:1.625rem}
.atrium-site .a-text--lg{font-size:1.125rem;line-height:1.75rem}
.atrium-site .a-text--sm{font-size:.8125rem;line-height:1.125rem}
.atrium-site :where(.a-text){color:var(--lg-ink)}
.atrium-site :where(.a-tone-inverse) :where(.a-text){color:color-mix(in srgb,var(--lg-cream) 85%,transparent)}
.atrium-site .a-text.a-muted{color:var(--lg-stone)}
.atrium-site .a-eyebrow{display:block;gap:0;font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase}
.atrium-site .a-eyebrow::before{display:none!important}
.atrium-site :where(.a-eyebrow){color:var(--lg-stone)}
.atrium-site .a-tone-inverse .a-eyebrow{color:var(--lg-gold)}
.atrium-site .a-richtext{max-width:none}
.atrium-site .a-richtext a{text-decoration:none}
/* the brass hairline under a heading */
.atrium-site hr.a-divider--short{display:block;width:6rem;height:1px;border:0;border-top:0;background:var(--lg-gold);opacity:1;color:var(--lg-gold)}
.atrium-site .a-list{display:flex;flex-direction:column;gap:0}
.atrium-site .a-list li{display:block}
/* text over photographs and film */
.atrium-site .lg-on-image,.atrium-site .lg-on-image .a-heading,.atrium-site .lg-on-image .a-text,.atrium-site .lg-on-image .a-eyebrow{text-shadow:0 1px 2px rgb(var(--lg-shadow-rgb) / .45),0 2px 12px rgb(var(--lg-shadow-rgb) / .3)}
.atrium-site .lg-on-video,.atrium-site .lg-on-video .a-heading,.atrium-site .lg-on-video .a-hero__sub,.atrium-site .lg-on-video .a-eyebrow{text-shadow:0 1px 2px rgb(var(--lg-shadow-rgb) / .55),0 2px 10px rgb(var(--lg-shadow-rgb) / .45),0 6px 30px rgb(var(--lg-shadow-rgb) / .35)}

/* ── buttons (Button.tsx) ───────────────────────────────────────────────── */
.atrium-site .a-btn{min-height:0;gap:.75rem;padding:.875rem 2rem;border-radius:0;font-family:var(--a-font-body);font-size:.875rem;line-height:1.25rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;transition:background-color .3s,color .3s,border-color .3s}
.atrium-site .a-btn--lg{padding:1.25rem 2.5rem;font-size:.875rem;min-height:0}
@media (min-width:768px){.atrium-site .a-btn--lg{padding-inline:3rem}}
.atrium-site .a-btn--primary{--b-bg:var(--lg-charcoal);--b-fg:var(--lg-cream);--b-bd:var(--lg-charcoal)}
.atrium-site .a-btn--primary:hover{--b-bg:var(--lg-gold);--b-fg:var(--lg-charcoal);--b-bd:var(--lg-gold)}
.atrium-site .a-btn--secondary{--b-bg:var(--lg-gold);--b-fg:var(--lg-charcoal);--b-bd:var(--lg-gold)}
.atrium-site .a-btn--secondary:hover{--b-bg:var(--lg-cream);--b-fg:var(--lg-charcoal);--b-bd:var(--lg-cream)}
.atrium-site .a-btn--outline{--b-bg:transparent;--b-fg:var(--lg-charcoal);--b-bd:var(--lg-charcoal)}
.atrium-site .a-btn--outline:hover{--b-bg:var(--lg-charcoal);--b-fg:var(--lg-cream);--b-bd:var(--lg-charcoal)}
.atrium-site :is(.a-tone-inverse,.lg-dark) .a-btn--outline{--b-fg:var(--lg-cream);--b-bd:color-mix(in srgb,var(--lg-cream) 60%,transparent)}
.atrium-site :is(.a-tone-inverse,.lg-dark) .a-btn--outline:hover{--b-bg:var(--lg-cream);--b-fg:var(--lg-charcoal);--b-bd:var(--lg-cream)}
.atrium-site .a-btn .a-btn__icon{width:18px;height:18px}
.atrium-site .a-btn:hover .a-btn__icon{transform:none}
/* ArrowLink: uppercase tracked label, arrow slides forward on hover */
.atrium-site .a-btn--link{--b-bg:transparent;--b-bd:transparent;--b-fg:var(--lg-gold-ink);padding:0;min-height:0;background-image:none!important;gap:.75rem;letter-spacing:.15em}
.atrium-site .a-btn--link:hover{--b-fg:var(--lg-charcoal)}
.atrium-site .a-btn--link .a-btn__icon{transition:transform .3s}
.atrium-site .a-btn--link:hover .a-btn__icon{transform:translateX(.375rem)}
.atrium-site :is(.a-tone-inverse,.lg-dark) .a-btn--link{--b-fg:var(--lg-cream)}
.atrium-site :is(.a-tone-inverse,.lg-dark) .a-btn--link:hover{--b-fg:var(--lg-gold)}
/* contact links: icon + body text (the inline-flex gap-3 links) */
.atrium-site .a-btn--ghost{--b-bg:transparent;--b-bd:transparent;--b-fg:var(--lg-charcoal);padding:0;min-height:0;gap:.75rem;font-size:1rem;line-height:1.625rem;font-weight:400;letter-spacing:normal;text-transform:none;justify-content:flex-start;white-space:normal;text-align:left}
.atrium-site .a-btn--ghost:hover{--b-bg:transparent;--b-fg:var(--lg-gold-ink)}
.atrium-site .a-btn--ghost .a-btn__icon{color:var(--lg-gold-ink);width:16px;height:16px}
.atrium-site :is(.a-tone-inverse,.lg-dark) .a-btn--ghost{--b-fg:color-mix(in srgb,var(--lg-cream) 80%,transparent)}
.atrium-site :is(.a-tone-inverse,.lg-dark) .a-btn--ghost:hover{--b-fg:var(--lg-gold)}
.atrium-site :is(.a-tone-inverse,.lg-dark) .a-btn--ghost .a-btn__icon{color:inherit}
.atrium-site .a-actions{gap:1rem}
@media (max-width:639px){.atrium-site .lg-actions{flex-direction:column;align-items:flex-start}}

/* ── photographs (Figure.tsx) ───────────────────────────────────────────── */
.atrium-site .a-image{margin:0}
.atrium-site .a-frame{background:var(--lg-surface-variant)}
.atrium-site .lg-cover{position:absolute;inset:0;width:100%;height:100%}
.atrium-site .lg-cover .a-frame,.atrium-site .lg-cover .a-image__link{position:absolute!important;inset:0;height:100%;display:block}
.atrium-site .lg-cover .a-frame>.a-img{position:absolute!important;inset:0;width:100%;height:100%!important;object-fit:cover}
.atrium-site .lg-zoom .a-img{transition:scale .7s var(--lg-ease-luxe),transform 0s;will-change:transform}
.atrium-site .lg-zoom:hover .a-img,.atrium-site :hover>.lg-zoom .a-img{scale:1.05}
.atrium-site .a-hover-zoom:hover .a-frame>.a-img{transform:none}
.atrium-site .lg-hairline::after{content:"";position:absolute;inset:0;border:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent);pointer-events:none;z-index:2}
/* silhouettes traced from the venue's own openings (ClipPaths.tsx), as stretch-to-fit masks */
.atrium-site{
  --lg-arch:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'%3E%3Cpath d='M0,1 L0,0.40 C0,0.205 0.175,0.055 0.5,0 C0.825,0.055 1,0.205 1,0.40 L1,1 Z'/%3E%3C/svg%3E");
  --lg-scallop:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'%3E%3Cpath d='M0,1 L0,0.46 C0,0.355 0.045,0.285 0.115,0.285 C0.185,0.285 0.235,0.345 0.245,0.375 C0.255,0.185 0.36,0.045 0.5,0 C0.64,0.045 0.745,0.185 0.755,0.375 C0.765,0.345 0.815,0.285 0.885,0.285 C0.955,0.285 1,0.355 1,0.46 L1,1 Z'/%3E%3C/svg%3E");
}
.atrium-site .lg-arch{-webkit-mask:var(--lg-arch) 0 0/100% 100% no-repeat;mask:var(--lg-arch) 0 0/100% 100% no-repeat}
.atrium-site .lg-scallop{-webkit-mask:var(--lg-scallop) 0 0/100% 100% no-repeat;mask:var(--lg-scallop) 0 0/100% 100% no-repeat}
.atrium-site .lg-notch{clip-path:polygon(var(--lg-notch) 0,100% 0,100% calc(100% - var(--lg-notch)),calc(100% - var(--lg-notch)) 100%,0 100%,0 var(--lg-notch))}
.atrium-site .lg-soft{border-radius:3px;overflow:hidden}
.atrium-site .lg-lozenge{border-radius:2rem;overflow:hidden}

/* ── header (Header.tsx / NavLink.tsx / Logo.tsx) ───────────────────────── */
.atrium-site .a-header.a-header{position:fixed;top:0;left:0;right:0;z-index:50;--hdr-bg:color-mix(in srgb,var(--lg-cream) 70%,transparent);--hdr-fg:var(--lg-charcoal);
  border-bottom:1px solid var(--lg-hairline);box-shadow:none;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);transition:background-color .5s,color .5s,border-color .5s;
  --t-text:var(--lg-charcoal);--t-btn-bg:var(--lg-charcoal);--t-btn-text:var(--lg-cream)}
.atrium-site:has([class*="a-n-lg-hero"],[class*="a-n-lg-pagehero"]) .a-header.a-header:not(.lg-docked):not(.is-open){--hdr-bg:transparent;--hdr-fg:var(--lg-cream);border-bottom-color:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}
.atrium-site:has([class*="a-n-lg-hero"],[class*="a-n-lg-pagehero"]) .a-header:not(.lg-docked):not(.is-open)::before{content:"";position:absolute;inset:0 0 auto;height:calc(var(--lg-nav-h) + 3rem);pointer-events:none;
  background:linear-gradient(to bottom,color-mix(in srgb,var(--lg-charcoal) 75%,transparent),color-mix(in srgb,var(--lg-charcoal) 40%,transparent),transparent)}
/* In the builder canvas no script docks the bar, so let it scroll away with the page instead. */
.atrium-site[data-mode=editor] .a-header.a-header{position:absolute}
.atrium-site .a-header__bar{position:relative;max-width:calc(1280px + 2 * var(--a-gutter));min-height:0;height:var(--lg-nav-h);justify-content:space-between;gap:1rem}
.atrium-site .a-header__brand{margin-right:0;min-height:0;gap:${cfg.logo.gap};color:var(--hdr-fg);transition:color .5s}
.atrium-site .a-header .a-brand__logo{height:${cfg.logo.h[0]};max-height:none;width:auto;max-width:none;opacity:.9;transition:opacity .5s}
.atrium-site .a-header .a-brand:hover .a-brand__logo{opacity:1}
.atrium-site:has([class*="a-n-lg-hero"],[class*="a-n-lg-pagehero"]) .a-header:not(.lg-docked) .a-brand__logo{opacity:1}
${cfg.logo.h[1] ? `@media (min-width:768px){.atrium-site .a-header .a-brand__logo{height:${cfg.logo.h[1]}}}` : ''}
@media (min-width:1280px){.atrium-site .a-header .a-brand__logo{height:${cfg.logo.h[2]}}}
${cfg.logo.wordmark ? `.atrium-site .a-header .a-brand::after{content:${JSON.stringify(cfg.logo.wordmark)};font-family:var(--a-font-heading);font-size:1.375rem;line-height:1;letter-spacing:-0.025em;white-space:nowrap;transition:color .5s}
@media (min-width:768px){.atrium-site .a-header .a-brand::after{font-size:1.625rem}}
.atrium-site .a-header .a-brand:hover::after{color:var(--lg-gold-ink)}
.atrium-site:has([class*="a-n-lg-hero"],[class*="a-n-lg-pagehero"]) .a-header:not(.lg-docked) .a-brand:hover::after{color:var(--lg-gold)}
@media (min-width:1024px) and (max-width:1279px){.atrium-site .a-header .a-brand__logo{display:none}}
@media (min-width:1280px){.atrium-site .a-header__brand{gap:.75rem}}` : ''}
.atrium-site .a-header .a-nav{gap:1.5rem}
@media (min-width:1280px){.atrium-site .a-header .a-nav{gap:2rem}}
.atrium-site .a-header .a-nav__link{padding:.25rem 0;font-family:var(--a-font-body);font-size:.875rem;line-height:1.25rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--hdr-fg);transition:color .3s}
.atrium-site .a-header .a-nav__link:hover{color:var(--lg-gold-ink)}
.atrium-site .a-header .a-nav__link.is-current{color:var(--lg-gold-ink)}
.atrium-site:has([class*="a-n-lg-hero"],[class*="a-n-lg-pagehero"]) .a-header:not(.lg-docked) .a-nav__link:is(:hover,.is-current){color:var(--lg-gold)}
.atrium-site .a-header .a-nav__link::after{bottom:-.25rem;height:2px;background:var(--lg-gold);transform:scaleX(0);transform-origin:left;transition:transform .3s}
.atrium-site .a-header .a-nav__link:hover::after{transform:scaleX(0)}
.atrium-site .a-header .a-nav__link.is-current::after{transform:scaleX(1)}
.atrium-site .a-header__end{gap:1rem}
.atrium-site .a-header .a-header__cta{white-space:nowrap;padding:.875rem 2rem;font-size:.875rem;min-height:0;--b-bg:var(--lg-charcoal);--b-fg:var(--lg-cream);--b-bd:var(--lg-charcoal)}
.atrium-site .a-header .a-header__cta:hover{--b-bg:var(--lg-gold);--b-fg:var(--lg-charcoal);--b-bd:var(--lg-gold)}
.atrium-site:has([class*="a-n-lg-hero"],[class*="a-n-lg-pagehero"]) .a-header:not(.lg-docked) .a-header__cta{--b-bg:var(--lg-gold);--b-fg:var(--lg-charcoal);--b-bd:var(--lg-gold)}
.atrium-site:has([class*="a-n-lg-hero"],[class*="a-n-lg-pagehero"]) .a-header:not(.lg-docked) .a-header__cta:hover{--b-bg:var(--lg-cream);--b-bd:var(--lg-cream)}
@media (min-width:1024px){.atrium-site .a-header__nav{display:block!important}.atrium-site .a-header__toggle{display:none!important}}
@media (max-width:1023px){.atrium-site .a-header__nav{display:none!important}.atrium-site .a-header .a-header__cta{display:none}.atrium-site .a-header__toggle{display:inline-flex}}
/* the hamburger: Icon "menu", 28px, three strokes with a short last line */
.atrium-site .a-header__toggle{width:2.75rem;height:2.75rem;margin-right:-.5rem;color:var(--hdr-fg);transition:color .3s}
.atrium-site .a-header__toggle:hover{color:var(--lg-gold-ink)}
.atrium-site .a-header .a-burger{width:1.3125rem;height:.875rem}
.atrium-site .a-header .a-burger span{height:1.5px}
.atrium-site .a-header:not(.is-open) .a-burger::after{content:"";position:absolute;left:0;top:calc(50% - .75px);width:100%;height:1.5px;background:currentColor}
.atrium-site .a-header:not(.is-open) .a-burger span:last-child{right:25%}
/* the full-screen menu (MobileMenu.tsx) */
.atrium-site .a-header.a-header.is-open{--hdr-bg:var(--lg-charcoal);--hdr-fg:var(--lg-cream);border-bottom-color:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;z-index:70}
.atrium-site .a-header.is-open .a-header__toggle{color:var(--lg-cream)}
.atrium-site .a-header.is-open .a-brand__logo{display:none!important}
.atrium-site .a-header.is-open .a-brand::after{content:${JSON.stringify(cfg.shortName)};font-family:var(--a-font-heading);font-size:1.5rem!important;line-height:2rem;letter-spacing:normal;color:var(--lg-gold)!important}
.atrium-site .a-header__drawer-inner>nav{margin-block:auto}
.atrium-site .a-header__drawer-foot>.a-btn .a-btn__label{font-size:0}
.atrium-site .a-header__drawer-foot>.a-btn .a-btn__label::after{content:"Enquire Now";font-size:.875rem}
.atrium-site .a-header__drawer{background:var(--lg-charcoal);color:var(--lg-cream);padding-top:calc(var(--lg-nav-h) + .5rem)}
.atrium-site .a-header__drawer-inner{gap:2rem;padding-bottom:calc(2rem + env(safe-area-inset-bottom))}
.atrium-site .a-header__drawer .a-mnav{border-top:0}
.atrium-site .a-header__drawer .a-mnav>li{border-bottom:1px solid color-mix(in srgb,var(--lg-cream) 20%,transparent)}
.atrium-site .a-header__drawer .a-mnav__link{display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;padding:.875rem 0;font-family:var(--a-font-heading);font-size:1.5rem;line-height:2rem;color:var(--lg-cream);transition:color .3s}
.atrium-site .a-header__drawer .a-mnav__link:hover,.atrium-site .a-header__drawer .a-mnav__link.is-current{color:var(--lg-gold);font-style:normal}
.atrium-site .a-header__drawer .a-mnav__link::after{font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb,var(--lg-cream) 60%,transparent)}
${navCaptions}
.atrium-site .a-header__drawer-foot{gap:1.25rem;justify-items:stretch;margin-top:0}
.atrium-site .a-header__drawer-foot>.a-btn{--b-bg:var(--lg-gold);--b-fg:var(--lg-charcoal);--b-bd:var(--lg-gold);width:100%}
.atrium-site .a-header__drawer .a-header__contact{flex-direction:row;font-size:1rem}
.atrium-site .a-header__drawer .a-header__contact li:nth-child(2){display:none}
.atrium-site .a-header__drawer .a-header__contact a{gap:.75rem;opacity:1;color:color-mix(in srgb,var(--lg-cream) 85%,transparent)}
.atrium-site .a-header__drawer .a-social{justify-content:flex-start;margin:-.25rem 0 0 -.625rem}
.atrium-site .a-header__drawer .a-header__drawer-foot{grid-template-columns:auto auto;justify-content:space-between;align-items:center}
.atrium-site .a-header__drawer .a-header__drawer-foot>.a-btn{grid-column:1/-1}
.atrium-site .a-social a{border-radius:0;min-width:0;min-height:0;padding:.625rem;color:color-mix(in srgb,var(--lg-cream) 80%,transparent);opacity:1}
.atrium-site .a-social a:hover{background:transparent;color:var(--lg-gold)}
.atrium-site .a-social a[aria-label=Facebook] svg{-webkit-mask:var(--lgi-facebook) center/100% 100% no-repeat;mask:var(--lgi-facebook) center/100% 100% no-repeat;background:currentColor}
.atrium-site .a-social a[aria-label=Instagram] svg{-webkit-mask:var(--lgi-instagram) center/100% 100% no-repeat;mask:var(--lgi-instagram) center/100% 100% no-repeat;background:currentColor}
.atrium-site .a-social a[aria-label=TikTok] svg{-webkit-mask:var(--lgi-tiktok) center/100% 100% no-repeat;mask:var(--lgi-tiktok) center/100% 100% no-repeat;background:currentColor}
.atrium-site .a-social a svg>*{visibility:hidden}
.atrium-site .a-header__contact .a-icon{-webkit-mask:var(--lgi-phone) center/100% 100% no-repeat;mask:var(--lgi-phone) center/100% 100% no-repeat;background:currentColor;width:18px;height:18px}
.atrium-site .a-header__contact .a-icon>*{visibility:hidden}

/* ── form (InquiryForm.tsx / Field.tsx): underline-only controls, chip radios ── */
.atrium-site .a-fm{gap:2.5rem}
.atrium-site .a-fm__fields{grid-template-columns:repeat(2,minmax(0,1fr));gap:2.5rem}
.atrium-site .a-field,.atrium-site .a-fm--grid .a-field--half,.atrium-site .a-fm--grid .a-field--third{grid-column:auto;gap:0}
.atrium-site .a-field--full,.atrium-site .a-field--choices{grid-column:1/-1!important}
@media (max-width:767px){.atrium-site .a-fm__fields{grid-template-columns:1fr}}
.atrium-site .a-field__label{margin-bottom:.5rem;font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--lg-stone)}
.atrium-site .a-field--choices>.a-field__label{margin-bottom:1rem}
.atrium-site .a-field__req{margin-left:.25rem;color:var(--lg-gold-ink)}
.atrium-site .a-field :is(input:not([type=checkbox]):not([type=radio]),select,textarea){min-height:0;padding:.75rem 0;border:0;border-bottom:1px solid var(--lg-stone);border-radius:0;background:transparent;font-size:1rem;line-height:1.625rem;color:var(--lg-charcoal);box-shadow:none}
.atrium-site .a-field :is(input,select,textarea):hover{border-color:var(--lg-stone)}
.atrium-site .a-field :is(input,select,textarea):focus{border-color:var(--lg-gold-ink);box-shadow:none}
.atrium-site .a-field input[type=date]{color:var(--lg-stone);height:51px}
.atrium-site .a-field select{height:48px;padding-block:0}
.atrium-site .a-field input[type=date]::-webkit-calendar-picker-indicator{cursor:pointer;opacity:.5}
.atrium-site .a-field textarea{min-height:0;resize:none}
.atrium-site .a-select::after{right:.25rem}
.atrium-site .a-field__help{margin-top:.5rem;font-size:.8125rem;line-height:1.125rem;color:var(--lg-stone)}
.atrium-site .a-field__error{margin-top:.5rem;font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#ba1a1a}
.atrium-site .a-field.is-invalid :is(input,select,textarea){border-color:#ba1a1a}
.atrium-site .a-choices{gap:1rem}
.atrium-site .a-choice{position:relative;gap:0;font-size:.8125rem;line-height:1.125rem}
.atrium-site .a-choice input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
.atrium-site .a-choice span{display:inline-block;padding:.625rem 1.25rem;border:1px solid var(--lg-stone);font-family:var(--a-font-body);font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--lg-stone);transition:color .3s,background-color .3s,border-color .3s}
.atrium-site .a-choice:hover span{border-color:var(--lg-charcoal);color:var(--lg-charcoal)}
.atrium-site .a-choice input:checked+span{border-color:var(--lg-charcoal);background:var(--lg-charcoal);color:var(--lg-cream)}
.atrium-site .a-choice input:focus-visible+span{outline:2px solid var(--lg-gold);outline-offset:4px}
.atrium-site .a-fm__submit{gap:1rem;flex-wrap:wrap}
.atrium-site .a-fm__submit .a-btn{padding:1.25rem 2.5rem}
@media (min-width:768px){.atrium-site .a-fm__submit .a-btn{padding-inline:3rem}}
.atrium-site .a-fm__status{font-size:1rem}
.atrium-site .a-fm__status.is-error{padding:1.5rem;border:1px solid rgb(186 26 26 / .4);background:rgb(186 26 26 / .05);color:var(--lg-charcoal)}
.atrium-site .a-fm__success{gap:0;align-items:start;padding:2.5rem;border:1px solid color-mix(in srgb,var(--lg-gold) 55%,transparent);border-radius:0;background:var(--lg-surface)}
@media (min-width:768px){.atrium-site .a-fm__success{padding:3rem}}
.atrium-site .a-fm__success::before{content:"";display:block;width:36px;height:36px;margin-bottom:2rem;background:var(--lg-gold-ink);-webkit-mask:var(--lgi-rings) center/100% 100% no-repeat;mask:var(--lgi-rings) center/100% 100% no-repeat}
.atrium-site .a-fm__success-title{font-size:0!important}
.atrium-site .a-fm__success-title::after{content:"Thank you — your enquiry is with us.";font-family:var(--a-font-heading);font-size:2rem;line-height:2.5rem;color:var(--lg-charcoal)}
.atrium-site .a-fm__success>p:last-child{margin-top:1rem;max-width:32rem;color:var(--lg-ink)}

/* ── gallery (GalleryGrid.tsx): editorial masonry, shaped tiles, hover captions ── */
.atrium-site .a-gallery__masonry{column-count:1;column-gap:2rem;display:block}
@media (min-width:768px){.atrium-site .a-gallery__masonry{column-count:2}}
@media (min-width:1024px){.atrium-site .a-gallery__masonry{column-count:3}}
.atrium-site .a-gallery__masonry>.a-gallery__item{break-inside:avoid;margin:0 0 2rem;position:relative;display:block}
.atrium-site .a-gallery__item .a-frame{border-radius:0;position:relative}
.atrium-site .a-gallery__item .a-frame>.a-img{transition:scale .7s var(--lg-ease-luxe)}
.atrium-site .a-gallery__item:hover .a-frame>.a-img{scale:1.05;transform:none}
.atrium-site .a-gallery__item:nth-child(10n+2) .a-gallery__open,.atrium-site .a-gallery__item:nth-child(10n+8) .a-gallery__open{-webkit-mask:var(--lg-arch) 0 0/100% 100% no-repeat;mask:var(--lg-arch) 0 0/100% 100% no-repeat}
.atrium-site .a-gallery__item:nth-child(10n+4) .a-gallery__open{clip-path:polygon(var(--lg-notch) 0,100% 0,100% calc(100% - var(--lg-notch)),calc(100% - var(--lg-notch)) 100%,0 100%,0 var(--lg-notch))}
.atrium-site .a-gallery__item:nth-child(10n+6) .a-gallery__open{-webkit-mask:var(--lg-scallop) 0 0/100% 100% no-repeat;mask:var(--lg-scallop) 0 0/100% 100% no-repeat}
.atrium-site .a-gallery__item:nth-child(10n) .a-gallery__open{border-radius:2rem;overflow:hidden}
.atrium-site .a-gallery__item:nth-child(odd) .a-frame::after,.atrium-site .a-gallery__item:nth-child(10n) .a-frame::after{content:"";position:absolute;inset:0;border:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent);pointer-events:none;border-radius:inherit}
.atrium-site .a-gallery__open{display:block;position:relative;overflow:hidden;cursor:pointer}
.atrium-site .a-gallery__item .a-caption{position:absolute;inset:auto 0 0;display:flex;align-items:flex-end;margin:0;padding:1.5rem;background:linear-gradient(to top,color-mix(in srgb,var(--lg-charcoal) 80%,transparent),transparent);
  font-family:var(--a-font-heading);font-size:1.5rem;line-height:2rem;color:var(--lg-cream);opacity:0;transition:opacity .5s;pointer-events:none;text-shadow:0 1px 2px rgb(var(--lg-shadow-rgb) / .45),0 2px 12px rgb(var(--lg-shadow-rgb) / .3)}
.atrium-site .a-gallery__item:hover .a-caption,.atrium-site .a-gallery__item:focus-within .a-caption{opacity:1}
.atrium-site .a-gallery__item.lg-filtered-out{display:none}

/* ── lightbox (Lightbox.tsx look) ───────────────────────────────────────── */
.atrium-site .a-lightbox{background:color-mix(in srgb,var(--lg-charcoal) 97%,transparent)!important;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.atrium-site .a-lightbox{padding:5.5rem 1rem 2.5rem}
@media (min-width:768px){.atrium-site .a-lightbox{padding:5.5rem 5rem 2.5rem}}
.atrium-site .a-lightbox__figure{gap:0;height:100%;grid-template-rows:minmax(0,1fr) auto}
.atrium-site .a-lightbox__img{max-height:calc(100vh - 13rem)}
.atrium-site .a-lightbox__caption{flex-direction:column;align-items:center;padding-top:1rem;text-align:center}
.atrium-site .a-lightbox__caption>span:first-child{font-family:var(--a-font-heading);font-size:1.5rem;line-height:2rem;color:var(--lg-cream)}
.atrium-site .a-lightbox__count{position:fixed;top:1.5rem;left:1.5rem;font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:color-mix(in srgb,var(--lg-cream) 80%,transparent)}
@media (min-width:768px){.atrium-site .a-lightbox__count{left:5rem}}
.atrium-site .a-lightbox__btn{width:auto;height:auto;padding:.75rem;border:0;border-radius:0;background:none!important;color:var(--lg-cream);transition:color .3s}
.atrium-site .a-lightbox__btn:hover{color:var(--lg-gold)}
.atrium-site .a-lightbox__btn svg{width:28px;height:28px;background:currentColor}
.atrium-site .a-lightbox__btn svg>*{visibility:hidden}
.atrium-site .a-lightbox__close{top:1rem;right:1rem}@media (min-width:768px){.atrium-site .a-lightbox__close{right:4.5rem}}
.atrium-site .a-lightbox__close svg{-webkit-mask:var(--lgi-close) center/100% 100% no-repeat;mask:var(--lgi-close) center/100% 100% no-repeat}
.atrium-site .a-lightbox__prev{left:.5rem}@media (min-width:768px){.atrium-site .a-lightbox__prev{left:1.5rem}}
.atrium-site .a-lightbox__next{right:.5rem}@media (min-width:768px){.atrium-site .a-lightbox__next{right:1.5rem}}
.atrium-site .a-lightbox__prev svg{-webkit-mask:var(--lgi-arrow-left) center/100% 100% no-repeat;mask:var(--lgi-arrow-left) center/100% 100% no-repeat}
.atrium-site .a-lightbox__next svg{-webkit-mask:var(--lgi-arrow-right) center/100% 100% no-repeat;mask:var(--lgi-arrow-right) center/100% 100% no-repeat}

/* ── film cards (VideoGallery.tsx) ──────────────────────────────────────── */
.atrium-site .a-video{border-radius:3px;background:var(--lg-charcoal)}
.atrium-site .a-video__facade,.atrium-site .lg-video-facade{position:absolute;inset:0;cursor:pointer}
.atrium-site .a-video__poster,.atrium-site .lg-video-facade img{transition:scale .7s var(--lg-ease-luxe)}
.atrium-site .lg-video-facade{display:block;padding:0;border:0;background:none;overflow:hidden}
.atrium-site .lg-video-facade img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.atrium-site .a-video:hover .lg-video-facade img{scale:1.05}
.atrium-site .a-video:hover .a-video__poster{scale:1.05}
.atrium-site .a-video__facade::before,.atrium-site .lg-video-facade::before{content:"";position:absolute;inset:0;z-index:1;background:color-mix(in srgb,var(--lg-charcoal) 45%,transparent);transition:background-color .5s;pointer-events:none}
.atrium-site .a-video:hover .a-video__facade::before,.atrium-site .a-video:hover .lg-video-facade::before{background:color-mix(in srgb,var(--lg-charcoal) 30%,transparent)}
.atrium-site .a-video__play,.atrium-site .lg-video-play{position:absolute;left:50%;top:50%;z-index:2;display:flex;align-items:center;justify-content:center;width:5rem;height:5rem;transform:translate(-50%,-50%);border:1px solid color-mix(in srgb,var(--lg-gold) 70%,transparent);border-radius:0!important;
  background:color-mix(in srgb,var(--lg-charcoal) 70%,transparent)!important;color:transparent!important;font-size:0!important;box-shadow:none!important;transition:background-color .3s}
.atrium-site .a-video__play::after,.atrium-site .lg-video-play::after{content:"";width:26px;height:26px;background:var(--lg-gold);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M8 5.5v13l11-6.5z'/%3E%3C/svg%3E") center/100% no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M8 5.5v13l11-6.5z'/%3E%3C/svg%3E") center/100% no-repeat}
.atrium-site .a-video:hover :is(.a-video__play,.lg-video-play){background:var(--lg-gold)!important}
/* Keep the play square centred in every state: Atrium's own facade hover rule (scale) would otherwise
   replace the centring translate. The YouTube facade also prints a text glyph; the mask icon replaces it. */
.atrium-site :is(.a-video__facade,.a-video__facade:hover,.a-video:hover .a-video__facade) :is(.a-video__play,.lg-video-play){transform:translate(-50%,-50%)!important}
.atrium-site .a-video__play{font-size:0!important;line-height:0;box-shadow:none!important}
.atrium-site .a-video__play>svg{display:none!important}
.atrium-site .a-video:hover :is(.a-video__play,.lg-video-play)::after{background:var(--lg-charcoal)}

/* gallery filter bar (built by the motion script from each photo's category) */
.lg-filters{border-bottom:1px solid color-mix(in srgb,var(--lg-stone) 35%,transparent);padding-bottom:2.5rem;margin-bottom:4rem}
.lg-filters ul{display:flex;flex-wrap:wrap;justify-content:center;gap:2rem;margin:0;padding:0;list-style:none}
@media (min-width:768px){.lg-filters ul{gap:3.5rem}}
.lg-filters button{position:relative;padding:0 0 .5rem;border:0;background:none;cursor:pointer;font-family:var(--a-font-body);font-size:.875rem;line-height:1.25rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--lg-stone);transition:color .3s}
.lg-filters button:hover{color:var(--lg-charcoal)}
.lg-filters button[aria-pressed=true]{color:var(--lg-gold-ink)}
.lg-filters button::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:2px;background:var(--lg-gold);transform:scaleX(0);transform-origin:left;transition:transform .3s}
.lg-filters button[aria-pressed=true]::after{transform:scaleX(1)}
.lg-filters__n{margin-left:.5rem;font-size:.8125rem;line-height:1.125rem;color:var(--lg-stone)}
/* ?package= note on /contact */
.lg-package-note{margin-top:2rem;border:1px solid color-mix(in srgb,var(--lg-gold) 55%,transparent);background:var(--lg-surface);padding:1.5rem;font-size:1rem;line-height:1.625rem;color:var(--lg-charcoal)}
.lg-package-note strong{font-family:var(--a-font-body);font-weight:600}
@keyframes lg-settle{from{transform:scale(1.1)}to{transform:scale(1)}}

/* ── motion guards (globals.css) ─────────────────────────────────────────── */
@media (prefers-reduced-motion:reduce){
  .atrium-site *,.atrium-site *::before,.atrium-site *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}
/* page transition veil (PageTransition.tsx) */
.lg-veil{position:fixed;inset:0;z-index:65;background:var(--lg-cream);opacity:0;pointer-events:none;transition:opacity .4s var(--lg-ease-smooth)}
.lg-veil.is-on{opacity:1;transition:none}
/* the pointer ring (Cursor.tsx) */
.lg-cursor{position:fixed;left:0;top:0;z-index:80;display:flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid var(--lg-gold);border-radius:9999px;pointer-events:none;opacity:0;
  transition:width .16s var(--lg-ease-luxe),height .16s var(--lg-ease-luxe),background-color .16s,border-width .16s,opacity .15s;will-change:transform}
.lg-cursor.is-visible{opacity:1}
.lg-cursor.is-link{width:56px;height:56px}
.lg-cursor.is-view{width:104px;height:104px;background:var(--lg-gold);border-width:0}
.lg-cursor span{font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--lg-charcoal);opacity:0;transition:opacity .14s;user-select:none}
.lg-cursor.is-view span{opacity:1}
`;
}
