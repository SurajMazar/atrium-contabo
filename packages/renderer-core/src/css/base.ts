/**
 * Base renderer CSS: reset, tone system, typography, buttons, layout primitives and media frames.
 * Every rule is scoped under `.atrium-site`; colors/fonts/spacing come from theme tokens only.
 */
export const BASE_CSS = /* css */ `
.atrium-site{
  --t-bg:var(--a-color-background);--t-text:var(--a-color-text);--t-muted:var(--a-color-muted);--t-border:var(--a-color-border);
  --t-accent:var(--a-color-primary);--t-surface:var(--a-color-surface);--t-btn-bg:var(--a-color-primary);--t-btn-text:var(--a-color-primary-contrast);
  --a-gutter:clamp(1.25rem,4.2vw,3.25rem);--a-ease:cubic-bezier(.22,.61,.36,1);--a-ease-out:cubic-bezier(.16,1,.3,1);
  --a-gap:clamp(1.5rem,3vw,2.75rem);--a-header-h:4.75rem;
  background:var(--a-color-background);color:var(--a-color-text);font-family:var(--a-font-body);font-weight:var(--a-weight-body);
  font-size:var(--a-text-base);line-height:var(--a-leading-body);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
  text-rendering:optimizeLegibility;font-kerning:normal;overflow-x:clip;min-height:100vh;display:flex;flex-direction:column;margin:0}
.atrium-site *,.atrium-site *::before,.atrium-site *::after{box-sizing:border-box}
.atrium-site :where(h1,h2,h3,h4,h5,h6,p,figure,blockquote,dl,dd,ul,ol,fieldset){margin:0}
.atrium-site :where(ul,ol){padding:0;list-style:none}
.atrium-site :where(img,video,svg,iframe,canvas){display:block;max-width:100%}
.atrium-site img{height:auto}
.atrium-site a{color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}
.atrium-site :where(button,input,select,textarea){font:inherit;color:inherit;letter-spacing:inherit}
.atrium-site button{cursor:pointer}
.atrium-site :focus-visible{outline:2px solid var(--t-accent);outline-offset:3px;border-radius:1px}
.atrium-site ::selection{background:color-mix(in srgb,var(--a-color-primary) 20%,transparent)}
.atrium-site .a-main{flex:1 0 auto;display:block}
.atrium-site .a-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.atrium-site .a-skip{position:absolute;left:1rem;top:-6rem;z-index:1000;padding:.75rem 1.25rem;background:var(--a-color-inverse);color:var(--a-color-inverse-text);font-size:var(--a-text-sm);border-radius:var(--a-radius-sm);transition:top .2s}
.atrium-site .a-skip:focus{top:1rem}
.atrium-site .a-icon{flex:none}

/* tones */
.atrium-site .a-tone-surface{--t-bg:var(--a-color-surface);--t-surface:var(--a-color-background)}
.atrium-site .a-tone-surface-alt{--t-bg:var(--a-color-surface-alt);--t-surface:var(--a-color-background)}
.atrium-site .a-tone-default{--t-bg:var(--a-color-background);--t-surface:var(--a-color-surface)}
.atrium-site .a-tone-inverse,.atrium-site .a-on-media{--t-text:var(--a-color-inverse-text);--t-muted:color-mix(in srgb,var(--a-color-inverse-text) 70%,transparent);
  --t-border:color-mix(in srgb,var(--a-color-inverse-text) 18%,transparent);--t-accent:var(--a-color-accent);--t-btn-bg:var(--a-color-inverse-text);
  --t-btn-text:var(--a-color-inverse);--t-surface:color-mix(in srgb,var(--a-color-inverse-text) 7%,transparent)}
.atrium-site .a-tone-inverse{--t-bg:var(--a-color-inverse)}
.atrium-site .a-tone-primary{--t-bg:var(--a-color-primary);--t-text:var(--a-color-primary-contrast);--t-muted:color-mix(in srgb,var(--a-color-primary-contrast) 72%,transparent);
  --t-border:color-mix(in srgb,var(--a-color-primary-contrast) 22%,transparent);--t-accent:var(--a-color-primary-contrast);--t-btn-bg:var(--a-color-primary-contrast);
  --t-btn-text:var(--a-color-primary);--t-surface:color-mix(in srgb,var(--a-color-primary-contrast) 8%,transparent)}
.atrium-site .a-tone-transparent{--t-bg:transparent}

/* sections & containers */
.atrium-site .a-section{position:relative;background:var(--t-bg);color:var(--t-text);
  padding-block:calc(var(--a-space-section) * var(--pt,1)) calc(var(--a-space-section) * var(--pb,1))}
.atrium-site .a-pt-none{--pt:0}.atrium-site .a-pt-sm{--pt:.42}.atrium-site .a-pt-md{--pt:.7}.atrium-site .a-pt-lg{--pt:1}.atrium-site .a-pt-xl{--pt:1.45}
.atrium-site .a-pb-none{--pb:0}.atrium-site .a-pb-sm{--pb:.42}.atrium-site .a-pb-md{--pb:.7}.atrium-site .a-pb-lg{--pb:1}.atrium-site .a-pb-xl{--pb:1.45}
.atrium-site .a-section--nested{padding-block:0;background:transparent}
.atrium-site .a-section--nested.a-tone-surface,.atrium-site .a-section--nested.a-tone-surface-alt,.atrium-site .a-section--nested.a-tone-inverse,.atrium-site .a-section--nested.a-tone-primary{background:var(--t-bg);padding:clamp(1.5rem,4vw,3rem);border-radius:var(--a-radius-md)}
.atrium-site .a-container{width:100%;margin-inline:auto;padding-inline:var(--a-gutter);max-width:calc(var(--a-container-default) + 2 * var(--a-gutter))}
.atrium-site .a-container--narrow{max-width:calc(var(--a-container-narrow) + 2 * var(--a-gutter))}
.atrium-site .a-container--wide{max-width:calc(var(--a-container-wide) + 2 * var(--a-gutter))}
.atrium-site .a-container--full{max-width:none}
.atrium-site .a-section--nested>.a-container{padding-inline:0;max-width:none}

/* typography */
.atrium-site .a-heading{font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);line-height:var(--a-leading-heading);
  letter-spacing:var(--a-tracking-heading);text-transform:var(--a-transform-heading);text-wrap:balance;color:inherit}
.atrium-site .a-heading em{font-style:italic;font-weight:inherit;letter-spacing:-.005em}
/* level sizes use :where() so component classes (.a-x__title) always win */
.atrium-site :where(.a-heading){font-size:var(--a-text-3xl)}
.atrium-site :where(h1.a-heading){font-size:var(--a-text-5xl)}
.atrium-site :where(h2.a-heading){font-size:var(--a-text-4xl)}
.atrium-site :where(h3.a-heading){font-size:var(--a-text-2xl);line-height:1.15}
.atrium-site :where(h4.a-heading){font-size:var(--a-text-xl);line-height:1.2}
.atrium-site :where(h5.a-heading,h6.a-heading){font-size:var(--a-text-lg);line-height:1.25}
.atrium-site .a-heading--display{font-size:var(--a-text-6xl)!important;line-height:.98}
.atrium-site .a-heading--xl{font-size:var(--a-text-5xl)!important}
.atrium-site .a-heading--lg{font-size:var(--a-text-4xl)!important}
.atrium-site .a-heading--md{font-size:var(--a-text-3xl)!important}
.atrium-site .a-heading--sm{font-size:var(--a-text-xl)!important;line-height:1.2}
.atrium-site .a-eyebrow{display:inline-flex;align-items:center;gap:.9em;font-family:var(--a-font-body);font-size:var(--a-text-xs);font-weight:600;
  line-height:1.4;letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-intro--left .a-eyebrow::before,.atrium-site .a-eyebrow--rule::before{content:"";width:2rem;height:1px;background:currentColor;opacity:.55}
.atrium-site .a-lead{font-size:var(--a-text-lg);line-height:1.6;color:var(--t-muted);text-wrap:pretty;max-width:40rem}
.atrium-site p{text-wrap:pretty}
.atrium-site .a-prose{display:grid;gap:1em}
.atrium-site .a-muted{color:var(--t-muted)}
.atrium-site .a-small{font-size:var(--a-text-sm)}
.atrium-site .a-intro{display:grid;gap:var(--a-space-4);max-width:46rem;margin-bottom:clamp(2.25rem,5vw,4.25rem)}
.atrium-site .a-intro:last-child{margin-bottom:0}
.atrium-site .a-intro--center{text-align:center;margin-inline:auto;justify-items:center}
.atrium-site .a-intro--center .a-lead{margin-inline:auto}
.atrium-site .a-intro--right{margin-left:auto;text-align:right;justify-items:end}
.atrium-site .a-intro .a-actions{margin-top:var(--a-space-3)}
.atrium-site .a-intro__heading+.a-intro__sub{margin-top:var(--a-space-1)}

/* actions & buttons */
.atrium-site .a-actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--a-space-3) var(--a-space-5)}
.atrium-site .a-actions--center{justify-content:center}
.atrium-site .a-actions--right{justify-content:flex-end}
.atrium-site .a-btn{--b-bg:var(--t-btn-bg);--b-fg:var(--t-btn-text);--b-bd:var(--b-bg);position:relative;display:inline-flex;align-items:center;justify-content:center;gap:.7em;
  min-height:2.75rem;padding:var(--a-button-py) var(--a-button-px);border:1px solid var(--b-bd);border-radius:var(--a-button-radius);background:var(--b-bg);color:var(--b-fg);
  font-family:var(--a-font-body);font-size:var(--a-text-sm);font-weight:var(--a-button-weight);letter-spacing:var(--a-button-tracking);text-transform:var(--a-button-transform);
  line-height:1.1;white-space:nowrap;text-decoration:none;cursor:pointer;transition:background-color .4s var(--a-ease),color .4s var(--a-ease),border-color .4s var(--a-ease),opacity .3s}
.atrium-site .a-btn:hover{--b-bg:color-mix(in srgb,var(--t-btn-bg) 84%,var(--t-text))}
.atrium-site .a-tone-inverse .a-btn--primary:hover,.atrium-site .a-on-media .a-btn--primary:hover,.atrium-site .a-tone-primary .a-btn--primary:hover{--b-bg:color-mix(in srgb,var(--t-btn-bg) 86%,var(--t-bg,#000))}
.atrium-site .a-btn--secondary{--b-bg:var(--a-color-secondary);--b-fg:var(--a-color-primary-contrast)}
.atrium-site .a-btn--secondary:hover{--b-bg:color-mix(in srgb,var(--a-color-secondary) 85%,var(--a-color-text))}
.atrium-site .a-btn--outline{--b-bg:transparent;--b-fg:var(--t-text);--b-bd:color-mix(in srgb,var(--t-text) 38%,transparent)}
.atrium-site .a-btn--outline:hover{--b-bg:var(--t-text);--b-fg:var(--t-bg,var(--a-color-background));--b-bd:var(--t-text)}
.atrium-site .a-on-media .a-btn--outline:hover{--b-fg:var(--a-color-inverse)}
.atrium-site .a-btn--ghost{--b-bg:transparent;--b-fg:var(--t-text);--b-bd:transparent}
.atrium-site .a-btn--ghost:hover{--b-bg:color-mix(in srgb,var(--t-text) 8%,transparent)}
.atrium-site .a-btn--link{--b-bg:transparent;--b-fg:var(--t-text);--b-bd:transparent;min-height:0;padding:.4em 0;border-radius:0;
  background-image:linear-gradient(currentColor,currentColor);background-size:100% 1px;background-position:0 100%;background-repeat:no-repeat;transition:background-size .5s var(--a-ease)}
.atrium-site .a-btn--link:hover{--b-bg:transparent;background-size:0 1px;background-position:100% 100%}
.atrium-site .a-btn__icon{transition:transform .45s var(--a-ease)}
.atrium-site .a-btn:hover .a-btn__icon{transform:translateX(3px)}
.atrium-site .a-btn--sm{min-height:2.25rem;padding:.6em 1.15em;font-size:var(--a-text-xs)}
.atrium-site .a-btn--lg{min-height:3.25rem;font-size:var(--a-text-base)}
.atrium-site .a-btn--block{display:flex;width:100%}
.atrium-site .a-link{background-image:linear-gradient(currentColor,currentColor);background-size:0 1px;background-position:0 100%;background-repeat:no-repeat;transition:background-size .45s var(--a-ease)}
.atrium-site .a-link:hover{background-size:100% 1px}

/* media frames */
.atrium-site .a-frame{position:relative;overflow:hidden;isolation:isolate;background:color-mix(in srgb,var(--t-text) 7%,transparent)}
.atrium-site .a-frame>.a-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 1.4s var(--a-ease-out)}
.atrium-site .a-frame:not([style*="aspect-ratio"])>.a-img{position:relative;height:auto}
.atrium-site .a-frame--empty{min-height:12rem}
.atrium-site .a-r-none{border-radius:0}.atrium-site .a-r-sm{border-radius:var(--a-radius-sm)}.atrium-site .a-r-md{border-radius:var(--a-radius-md)}
.atrium-site .a-r-lg{border-radius:var(--a-radius-lg)}.atrium-site .a-r-full{border-radius:var(--a-radius-full)}
.atrium-site .a-hover-zoom:hover .a-frame>.a-img,.atrium-site a.a-hover-zoom:focus-visible .a-frame>.a-img{transform:scale(1.045)}
.atrium-site .a-overlay{position:absolute;inset:0;background:var(--a-color-inverse);opacity:var(--overlay,.35);pointer-events:none;z-index:1}
.atrium-site .a-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,color-mix(in srgb,var(--a-color-inverse) 45%,transparent) 0%,transparent 28%,transparent 52%,color-mix(in srgb,var(--a-color-inverse) 70%,transparent) 100%)}

/* grids */
.atrium-site .a-grid{display:grid;gap:var(--gap,var(--a-gap));grid-template-columns:repeat(var(--cols,3),minmax(0,1fr))}
@media (max-width:991px){.atrium-site .a-grid{grid-template-columns:repeat(var(--cols-t,2),minmax(0,1fr))}}
@media (max-width:767px){.atrium-site .a-grid{grid-template-columns:repeat(var(--cols-m,1),minmax(0,1fr))}}
.atrium-site .a-gap-none{--gap:0}.atrium-site .a-gap-sm{--gap:var(--a-space-3)}.atrium-site .a-gap-md{--gap:clamp(1rem,2vw,1.5rem)}.atrium-site .a-gap-lg{--gap:clamp(1.5rem,3.5vw,3rem)}.atrium-site .a-gap-xl{--gap:clamp(2rem,5vw,4.5rem)}
.atrium-site .a-rule{border:0;border-top:1px solid var(--t-border);margin:0}
.atrium-site .a-meta{display:flex;flex-wrap:wrap;gap:.35rem 1.1rem;font-size:var(--a-text-sm);color:var(--t-muted)}
.atrium-site .a-meta>*{display:inline-flex;align-items:center;gap:.4em}
.atrium-site .a-tag{display:inline-flex;align-items:center;font-size:var(--a-text-xs);font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-pill{display:inline-flex;align-items:center;gap:.4em;padding:.35em .85em;border:1px solid var(--t-border);border-radius:var(--a-radius-full);font-size:var(--a-text-xs);font-weight:500;letter-spacing:.04em;background:var(--t-bg)}
.atrium-site .a-card-title{font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);font-size:var(--a-text-xl);line-height:1.2;letter-spacing:var(--a-tracking-heading);text-wrap:balance}
.atrium-site .a-card-title em{font-style:italic}
.atrium-site .a-price{font-family:var(--a-font-heading);font-size:var(--a-text-lg);line-height:1}
.atrium-site .a-price small{font-family:var(--a-font-body);font-size:var(--a-text-xs);color:var(--t-muted);letter-spacing:.04em;margin-left:.35em}
.atrium-site .a-check-list{display:grid;gap:.6rem}
.atrium-site .a-check-list li{display:flex;gap:.7rem;align-items:flex-start}
.atrium-site .a-check-list .a-icon{margin-top:.25em;color:var(--t-accent)}
.atrium-site .a-stretch::after{content:"";position:absolute;inset:0;z-index:2}

/* editor affordances */
.atrium-site [data-node-hidden]{opacity:.38;outline:1px dashed color-mix(in srgb,var(--a-color-text) 40%,transparent)}
.atrium-site .a-dropzone{display:flex;align-items:center;justify-content:center;min-height:5.5rem;padding:1rem;border:1.5px dashed color-mix(in srgb,var(--t-text) 28%,transparent);border-radius:var(--a-radius-md);color:var(--t-muted);font-size:var(--a-text-sm);background:color-mix(in srgb,var(--t-text) 3%,transparent)}
.atrium-site .a-editor-notice{padding:.85rem 1.1rem;border:1px dashed color-mix(in srgb,var(--t-text) 35%,transparent);border-radius:var(--a-radius-sm);font-size:var(--a-text-sm);color:var(--t-muted);background:color-mix(in srgb,var(--t-text) 4%,transparent)}
.atrium-site .a-unknown{padding:1rem}

@media (prefers-reduced-motion:reduce){.atrium-site *,.atrium-site *::before,.atrium-site *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
`;
