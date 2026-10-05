import { IFRAME_SANDBOX_TRUSTED, IFRAME_SANDBOX_UNTRUSTED, isAllowedIframeHost, parseHttpsUrl } from '@atrium/schema';
import { Children, createElement, type CSSProperties, type ReactNode } from 'react';
import { BeforeAfter, Dialog, RotatingWords, StickySteps, Tabs } from '../islands/interactive';
import type { RenderProps } from '../types';
import { Buttons } from '../ui/actions';
import { aspectStyle, cx, editProp, Heading, Paragraphs, part, Rich, root, subLevel, toArray } from '../ui/core';
import { AImage, Frame, toMedia } from '../ui/media';
import { sanitizeHtml } from '../ui/sanitize';
import { headingId, Intro, Section } from '../ui/section';
import { FaqList } from './marketing';

// ---------------------------------------------------------------- tabs

export function TabsRenderer({ props, ctx, attrs, node, children }: RenderProps) {
  const items = toArray<{ label: string; heading?: string; text?: string; image?: unknown; buttons?: unknown[] }>(props.items);
  const childPanels = node.children?.length ? Children.toArray(children) : [];
  const count = Math.max(items.length, childPanels.length);
  const labels = Array.from({ length: count }, (_, i) => items[i]?.label ?? `Tab ${i + 1}`);
  const panels = Array.from({ length: count }, (_, i) => {
    if (childPanels[i]) return childPanels[i];
    const it = items[i];
    if (!it) return null;
    return (
      <div className={cx('a-tabpanel', toMedia(it.image) && 'a-tabpanel--media')}>
        {toMedia(it.image) ? <Frame ctx={ctx} media={it.image} aspect="4:3" sizes="(max-width: 767px) 100vw, 45vw" rounded="sm" /> : null}
        <div className="a-tabpanel__copy">
          {it.heading ? <Heading as="h3" text={it.heading} className="a-tabpanel__heading" {...editProp(ctx, `items.${i}.heading`)} /> : null}
          {it.text ? <Paragraphs text={it.text} className="a-muted" ctx={ctx} editName={`items.${i}.text`} /> : null}
          <Buttons ctx={ctx} buttons={it.buttons as never} editPrefix={`items.${i}.buttons`} />
        </div>
      </div>
    );
  });
  return (
    <div {...root(attrs, 'a-tabs-block')}>
      {count ? <Tabs labels={labels} panels={panels} style={props.style} align={props.align} /> : children}
    </div>
  );
}

// ---------------------------------------------------------------- accordion

export function AccordionRenderer({ props, ctx, attrs, node }: RenderProps) {
  return (
    <div {...root(attrs, 'a-accordion-block')}>
      <FaqList ctx={ctx} items={toArray(props.items)} allowMultiple={props.allowMultiple} openFirst={props.openFirst} groupName={`acc-${node.id}`} titleKey="title" bodyKey="content" boxed={props.style === 'boxed'} />
    </div>
  );
}

// ---------------------------------------------------------------- modal & drawer

function overlay(kind: 'modal' | 'drawer') {
  return function OverlayRenderer({ props, ctx, attrs, node, children }: RenderProps) {
    const content = (
      <>
        {props.text ? <Paragraphs text={props.text} ctx={ctx} editName="text" /> : null}
        {node.children?.length ? children : null}
      </>
    );
    if (ctx.mode === 'editor') {
      // Editor: show content inline so it can be edited without opening a dialog.
      return (
        <div {...root(attrs, 'a-overlay-block', 'a-overlay-block--editor')}>
          <span className={cx('a-btn', `a-btn--${props.triggerStyle ?? 'outline'}`)}><span className="a-btn__label" {...editProp(ctx, 'triggerLabel')}>{props.triggerLabel}</span></span>
          <div className="a-overlay-block__preview">
            {props.title ? <p className="a-dialog__title" {...editProp(ctx, 'title')}>{props.title}</p> : null}
            {content}
            {!node.children?.length ? children : null}
          </div>
        </div>
      );
    }
    return (
      <div {...root(attrs, 'a-overlay-block')}>
        <Dialog triggerLabel={props.triggerLabel} triggerClass={cx('a-btn', `a-btn--${props.triggerStyle ?? 'outline'}`)} title={props.title} kind={kind} side={props.side} size={props.size}>
          {content}
        </Dialog>
      </div>
    );
  };
}
export const ModalRenderer = overlay('modal');
export const DrawerRenderer = overlay('drawer');

// ---------------------------------------------------------------- marquee

export function MarqueeRenderer(rp: RenderProps) {
  const { props } = rp;
  const items = toArray<{ text: string }>(props.items).filter((i) => i.text);
  const row = (hidden?: boolean) =>
    items.map((it, i) => (
      <li key={`${hidden ? 'h' : 'v'}${i}`} className="a-ticker__item" aria-hidden={hidden || undefined}>
        <span>{it.text}</span>
        <span className="a-ticker__sep" aria-hidden="true">{props.separator}</span>
      </li>
    ));
  return (
    <Section rp={rp} container={false} className={cx(`a-ticker--${props.size ?? 'lg'}`, props.italic && 'a-ticker--italic', props.pauseOnHover === false && 'a-ticker--nopause')}>
      <div className={cx('a-ticker', props.direction === 'right' && 'a-ticker--reverse')} style={{ '--speed': `${props.speed ?? 36}s` } as CSSProperties}>
        <ul className="a-ticker__track">{row()}{row(true)}{row(true)}{row(true)}</ul>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- before / after

export function BeforeAfterRenderer({ props, ctx, attrs }: RenderProps) {
  const ratio = aspectStyle(props.aspect)?.aspectRatio;
  return (
    <div {...root(attrs, 'a-ba-block')}>
      <BeforeAfter
        before={<AImage ctx={ctx} media={props.before} sizes="(max-width: 991px) 100vw, 70vw" />}
        after={<AImage ctx={ctx} media={props.after} sizes="(max-width: 991px) 100vw, 70vw" />}
        beforeLabel={props.beforeLabel ?? 'Before'}
        afterLabel={props.afterLabel ?? 'After'}
        start={props.start ?? 50}
        aspect={ratio}
      />
    </div>
  );
}

// ---------------------------------------------------------------- horizontal scroll

export function HorizontalScrollRenderer(rp: RenderProps) {
  const { props, ctx, node, attrs, children } = rp;
  const items = toArray<{ image?: unknown; eyebrow?: string; title?: string; text?: string }>(props.items);
  const wantPin = props.pin !== false && ctx.animationsEnabled && !attrs['data-a-anim'];
  return (
    <Section rp={rp} labelled container={false} className="a-hscroll" extra={wantPin ? { 'data-a-anim': JSON.stringify({ preset: 'horizontal-scroll' }) } : undefined}>
      <div className="a-container a-container--wide"><Intro ctx={ctx} props={props} nodeId={node.id} /></div>
      <div className="a-hscroll__viewport">
        <div className="a-hscroll__track" data-a-track="">
          {node.children?.length
            ? Children.toArray(children).map((c, i) => <div key={i} className={`a-hscroll__card a-hscroll__card--${props.cardWidth ?? 'md'}`}>{c}</div>)
            : items.map((it, i) => (
                <figure key={i} className={`a-hscroll__card a-hscroll__card--${props.cardWidth ?? 'md'} a-hcard`}>
                  <Frame ctx={ctx} media={it.image} aspect={props.imageAspect} sizes="(max-width: 767px) 80vw, 30rem" rounded="sm" />
                  <figcaption className="a-hcard__caption">
                    {it.eyebrow ? <span className="a-tag">{it.eyebrow}</span> : null}
                    {it.title ? <span className="a-card-title" {...editProp(ctx, `items.${i}.title`)}><Rich text={it.title} /></span> : null}
                    {it.text ? <span className="a-muted a-small">{it.text}</span> : null}
                  </figcaption>
                </figure>
              ))}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- sticky story

export function StickyStoryRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const steps = toArray<{ eyebrow?: string; title: string; text?: string; image?: unknown }>(props.steps);
  const level = subLevel(props.headingLevel);
  const media = steps.map((s, i) => <Frame key={i} ctx={ctx} media={s.image} aspect={props.mediaAspect} sizes="(max-width: 991px) 100vw, 50vw" rounded="sm" />);
  const stepEls = steps.map((s, i) => (
    <div key={i} className="a-story__step-inner">
      {s.eyebrow ? <p className="a-eyebrow">{s.eyebrow}</p> : null}
      <Heading as={level} text={s.title} className="a-story__title" {...editProp(ctx, `steps.${i}.title`)} />
      {s.text ? <Paragraphs text={s.text} className="a-muted" ctx={ctx} editName={`steps.${i}.text`} /> : null}
      <div className="a-story__inline-media">{toMedia(s.image) ? <Frame ctx={ctx} media={s.image} aspect="4:3" sizes="100vw" rounded="sm" /> : null}</div>
    </div>
  ));
  return (
    <Section rp={rp} labelled className={cx(`a-story--media-${props.mediaSide ?? 'left'}`)}>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <StickySteps media={media} steps={stepEls} />
    </Section>
  );
}

// ---------------------------------------------------------------- parallax band

export function ParallaxBandRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const level = props.headingLevel ?? 'h2';
  const hasCopy = props.heading || props.eyebrow || props.text;
  return (
    <Section rp={rp} container={false} className={cx('a-on-media', `a-parallax--h-${props.height ?? 'lg'}`, `a-parallax--${props.intensity ?? 'subtle'}`)} labelled={!!props.heading}>
      <div className="a-parallax__media" data-a-bg="">
        <AImage ctx={ctx} media={props.image} sizes="100vw" className="a-parallax__img" extra={{ 'data-a-parallax': '' }} />
      </div>
      <div className="a-overlay" style={{ '--overlay': props.overlayOpacity ?? 0.3 } as CSSProperties} />
      {hasCopy ? (
        <div className="a-container a-parallax__inner">
          {props.eyebrow ? <p className="a-eyebrow" {...part} {...editProp(ctx, 'eyebrow')}>{props.eyebrow}</p> : null}
          {props.heading ? createElement(level, { className: 'a-heading a-parallax__heading', id: headingId(node.id), 'data-a-part': '', ...editProp(ctx, 'heading') }, <Rich text={props.heading} />) : null}
          {props.text ? <p className="a-lead" {...part}>{props.text}</p> : null}
          <Buttons ctx={ctx} buttons={props.buttons} align="center" asPart />
        </div>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------- animated text

export function AnimatedTextRenderer({ props, ctx, attrs }: RenderProps) {
  const words = toArray<{ text: string }>(props.words).map((w) => w.text).filter(Boolean);
  const tag = props.level ?? 'h2';
  const full = [props.prefix, words.join(', '), props.suffix].filter(Boolean).join(' ');
  return createElement(
    tag,
    { ...root(attrs, tag !== 'p' && 'a-heading', 'a-animated-text', `a-animated-text--${props.size ?? 'xl'}`) },
    <span className="a-sr">{full}</span>,
    <span aria-hidden="true">
      {props.prefix ? <span {...editProp(ctx, 'prefix')}>{props.prefix} </span> : null}
      <RotatingWords words={words} interval={props.interval} effect={props.effect} italic={props.italicWords !== false} paused={ctx.mode === 'editor'} />
      {props.suffix ? <span {...editProp(ctx, 'suffix')}> {props.suffix}</span> : null}
    </span>,
  );
}

// ---------------------------------------------------------------- embed

/** https URL for an iframe embed (no credentials), or undefined. */
export function safeIframeUrl(url?: string): string | undefined {
  return parseHttpsUrl(url)?.href;
}

/** Static stand-in for third-party content inside the builder canvas (same origin as the admin). */
function EmbedPlaceholder({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="a-embed__placeholder" role="img" aria-label={`${label}${detail ? `: ${detail}` : ''}`}>
      <span className="a-embed__placeholder-label">{label}</span>
      {detail ? <span className="a-embed__placeholder-host">{detail}</span> : null}
      <span className="a-embed__placeholder-note">Live content loads on the published site and in preview.</span>
    </div>
  );
}

/**
 * Embeds. Third-party code never runs inside the builder canvas (it shares the admin origin):
 * editor mode renders a static placeholder for every mode. On public sites:
 *  - `iframe`: allowlisted hosts (EMBED_IFRAME_HOSTS) keep their own origin; any other https page
 *    is sandboxed without `allow-same-origin` (opaque origin, no cookies/storage).
 *  - `html`: sanitized markup; iframes only from the allowlist.
 *  - `sandbox`: srcDoc in an opaque-origin sandbox.
 */
export function EmbedRenderer({ props, ctx, attrs }: RenderProps) {
  const style: CSSProperties = props.height ? { height: `${props.height}px` } : { aspectRatio: aspectStyle(props.aspect)?.aspectRatio ?? '16 / 9' };
  const editor = ctx.mode === 'editor';
  if (props.mode === 'html') {
    if (editor) return <div {...root(attrs, 'a-embed', 'a-embed--placeholder')} style={style}><EmbedPlaceholder label="HTML embed" detail={props.title} /></div>;
    const content = <div className="a-embed__html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(props.html ?? ''), { allowIframes: true }) }} />;
    return <div {...root(attrs, 'a-embed', 'a-embed--html')}>{content}</div>;
  }
  let content: ReactNode = null;
  if (props.mode === 'sandbox') {
    content = editor
      ? <EmbedPlaceholder label="Sandboxed embed" detail={props.title} />
      : <iframe className="a-embed__frame" title={props.title} srcDoc={String(props.html ?? '')} sandbox={IFRAME_SANDBOX_UNTRUSTED} loading="lazy" referrerPolicy="no-referrer" />;
  } else {
    const src = safeIframeUrl(props.url);
    const host = src ? parseHttpsUrl(src)?.hostname : undefined;
    if (!src) content = editor ? <div className="a-editor-notice">Add an https:// URL to embed.</div> : null;
    else if (editor) content = <EmbedPlaceholder label="Embedded page" detail={host} />;
    else {
      const trusted = isAllowedIframeHost(src);
      content = (
        <iframe
          className="a-embed__frame"
          title={props.title}
          src={src}
          allow={trusted ? props.allow : undefined}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox={trusted ? IFRAME_SANDBOX_TRUSTED : IFRAME_SANDBOX_UNTRUSTED}
          allowFullScreen={trusted}
        />
      );
    }
  }
  return <div {...root(attrs, 'a-embed')} style={style}>{content}</div>;
}

export const ADVANCED_CSS = /* css */ `
.atrium-site .a-tabs{display:grid;gap:clamp(1.5rem,3vw,2.5rem)}
.atrium-site .a-tabs__list{display:flex;flex-wrap:wrap;gap:.25rem 2rem;border-bottom:1px solid var(--t-border);overflow-x:auto;scrollbar-width:none}
.atrium-site .a-tabs--center .a-tabs__list{justify-content:center}
.atrium-site .a-tabs__tab{position:relative;padding:.9rem 0;border:0;background:none;font-size:var(--a-text-sm);font-weight:500;letter-spacing:.04em;color:var(--t-muted);white-space:nowrap;transition:color .3s}
.atrium-site .a-tabs__tab::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:var(--t-text);transform:scaleX(0);transition:transform .4s var(--a-ease)}
.atrium-site .a-tabs__tab:hover,.atrium-site .a-tabs__tab.is-active{color:var(--t-text)}
.atrium-site .a-tabs__tab.is-active::after{transform:scaleX(1)}
.atrium-site .a-tabs--pills .a-tabs__list{border:0;gap:.5rem}
.atrium-site .a-tabs--pills .a-tabs__tab{padding:.6rem 1.2rem;border:1px solid var(--t-border);border-radius:var(--a-radius-full)}
.atrium-site .a-tabs--pills .a-tabs__tab::after{display:none}
.atrium-site .a-tabs--pills .a-tabs__tab.is-active{background:var(--t-text);color:var(--t-bg);border-color:var(--t-text)}
.atrium-site .a-tabs__panel:focus-visible{outline-offset:6px}
.atrium-site .a-tabs__panel{animation:a-fade .4s var(--a-ease)}
.atrium-site .a-tabpanel{display:grid;gap:clamp(1.5rem,4vw,3.5rem)}
.atrium-site .a-tabpanel--media{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center}
.atrium-site .a-tabpanel__copy{display:grid;gap:1rem;justify-items:start}
.atrium-site .a-tabpanel__heading{font-size:var(--a-text-3xl)}
@media (max-width:767px){.atrium-site .a-tabpanel--media{grid-template-columns:1fr}}
.atrium-site .a-overlay-block{display:block}
.atrium-site .a-overlay-block--editor{display:grid;gap:1rem;justify-items:start}
.atrium-site .a-overlay-block__preview{width:100%;padding:1.25rem;border:1px dashed var(--t-border);border-radius:var(--a-radius-md)}
.atrium-site .a-dialog{padding:0;border:0;background:transparent;color:var(--a-color-text);max-width:none;max-height:none}
.atrium-site .a-dialog::backdrop{background:color-mix(in srgb,var(--a-color-inverse) 55%,transparent);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.atrium-site .a-dialog[open]{animation:a-fade .3s var(--a-ease)}
.atrium-site .a-dialog__panel{display:grid;gap:1.25rem;padding:clamp(1.5rem,4vw,2.5rem);background:var(--a-color-background);border-radius:var(--a-radius-md);box-shadow:var(--a-shadow-lg);--t-text:var(--a-color-text);--t-muted:var(--a-color-muted);--t-border:var(--a-color-border);--t-bg:var(--a-color-background)}
.atrium-site .a-dialog--modal{width:min(92vw,40rem);margin:auto}
.atrium-site .a-dialog--sm{width:min(92vw,28rem)}.atrium-site .a-dialog--lg{width:min(94vw,60rem)}
.atrium-site .a-dialog--drawer{position:fixed;inset:0 0 0 auto;height:100dvh;width:min(92vw,30rem);margin:0}
.atrium-site .a-dialog--drawer.a-dialog--left{inset:0 auto 0 0}
.atrium-site .a-dialog--drawer .a-dialog__panel{height:100%;align-content:start;overflow-y:auto;border-radius:0}
.atrium-site .a-dialog--drawer[open]{animation:a-drawer-r .45s var(--a-ease-out)}
.atrium-site .a-dialog--drawer.a-dialog--left[open]{animation-name:a-drawer-l}
@keyframes a-drawer-r{from{transform:translateX(100%)}to{transform:none}}
@keyframes a-drawer-l{from{transform:translateX(-100%)}to{transform:none}}
.atrium-site .a-dialog__head{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.atrium-site .a-dialog__title{font-family:var(--a-font-heading);font-size:var(--a-text-2xl);font-weight:var(--a-weight-heading)}
.atrium-site .a-dialog__close{display:grid;place-items:center;width:2.5rem;height:2.5rem;border:1px solid var(--a-color-border);border-radius:50%;background:none;color:inherit}
.atrium-site .a-dialog__body{display:grid;gap:1rem;color:var(--a-color-muted)}
.atrium-site .a-ticker--md{font-size:var(--a-text-2xl)}.atrium-site .a-ticker--lg{font-size:var(--a-text-4xl)}.atrium-site .a-ticker--xl{font-size:clamp(3rem,8vw,7rem)}
.atrium-site .a-ticker .a-ticker__item{display:inline-flex;align-items:center;gap:clamp(1.5rem,3vw,3rem);padding-right:clamp(1.5rem,3vw,3rem);font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);line-height:1.1;white-space:nowrap}
.atrium-site .a-ticker--italic .a-ticker__item>span:first-child{font-style:italic}
.atrium-site .a-ticker__sep{font-size:.45em;color:var(--t-muted)}
.atrium-site .a-ticker--reverse .a-ticker__track{animation-direction:reverse}
.atrium-site .a-ticker .a-ticker__track{animation-name:a-ticker4}
@keyframes a-ticker4{from{transform:translateX(0)}to{transform:translateX(-25%)}}
.atrium-site .a-ticker--nopause .a-ticker:hover .a-ticker__track{animation-play-state:running}
.atrium-site .a-ba{position:relative;overflow:hidden;width:100%;aspect-ratio:16/9;border-radius:var(--a-radius-sm);user-select:none;touch-action:pan-y}
.atrium-site .a-ba__layer{position:absolute;inset:0}
.atrium-site .a-ba__layer .a-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.atrium-site .a-ba__before{clip-path:inset(0 calc(100% - var(--pos,50%)) 0 0)}
.atrium-site .a-ba__label{position:absolute;bottom:1rem;z-index:2;padding:.35rem .75rem;border-radius:var(--a-radius-full);background:color-mix(in srgb,var(--a-color-inverse) 70%,transparent);color:var(--a-color-inverse-text);font-size:var(--a-text-xs);letter-spacing:.1em;text-transform:uppercase}
.atrium-site .a-ba__label--before{left:1rem}.atrium-site .a-ba__label--after{right:1rem}
.atrium-site .a-ba__handle{position:absolute;top:0;bottom:0;left:var(--pos,50%);width:2px;margin-left:-1px;background:var(--a-color-inverse-text);z-index:3;pointer-events:none}
.atrium-site .a-ba__handle span{position:absolute;top:50%;left:50%;width:2.75rem;height:2.75rem;margin:-1.375rem 0 0 -1.375rem;border-radius:50%;background:var(--a-color-inverse-text);box-shadow:var(--a-shadow-md)}
.atrium-site .a-ba__handle span::before{content:"";position:absolute;inset:0;margin:auto;width:.9rem;height:.9rem;border-left:1.5px solid var(--a-color-inverse);border-right:1.5px solid var(--a-color-inverse)}
.atrium-site .a-ba__range{position:absolute;inset:0;z-index:4;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}
.atrium-site .a-ba__range:focus-visible+*,.atrium-site .a-ba:has(.a-ba__range:focus-visible){outline:2px solid var(--t-accent);outline-offset:3px}
.atrium-site .a-hcard{margin:0;display:grid;gap:1rem}
.atrium-site .a-hcard__caption{display:grid;gap:.35rem}
.atrium-site .a-story__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(2.5rem,7vw,7rem)}
.atrium-site .a-story--media-right .a-story__media{order:2}
.atrium-site .a-story__media{position:relative}
.atrium-site .a-story__stage{position:sticky;top:calc(var(--a-header-h) + 2rem);display:grid}
.atrium-site .a-story__frame{grid-area:1/1;opacity:0;transform:scale(1.02);transition:opacity .8s var(--a-ease),transform 1.2s var(--a-ease-out)}
.atrium-site .a-story__frame.is-active{opacity:1;transform:none}
.atrium-site .a-story__steps{display:grid}
.atrium-site .a-story__step{min-height:72vh;display:flex;align-items:center;opacity:.35;transition:opacity .6s var(--a-ease)}
.atrium-site .a-story__step.is-active{opacity:1}
.atrium-site .a-story__step-inner{display:grid;gap:1rem;max-width:30rem}
.atrium-site .a-story__title{font-size:var(--a-text-3xl)}
.atrium-site .a-story__inline-media{display:none}
@media (max-width:991px){
  .atrium-site .a-story__grid{grid-template-columns:1fr}
  .atrium-site .a-story__media{display:none}
  .atrium-site .a-story__step{min-height:0;opacity:1;padding-block:1.5rem;border-top:1px solid var(--t-border)}
  .atrium-site .a-story__inline-media{display:block;margin-top:.5rem}
}
.atrium-site .a-parallax-band{display:flex;align-items:center;overflow:hidden;background:var(--a-color-inverse);color:var(--a-color-inverse-text)}
.atrium-site .a-parallax--h-sm{min-height:clamp(18rem,40vh,26rem)}.atrium-site .a-parallax--h-md{min-height:clamp(24rem,55vh,36rem)}.atrium-site .a-parallax--h-lg{min-height:clamp(28rem,75vh,48rem)}.atrium-site .a-parallax--h-screen{min-height:100svh}
.atrium-site .a-parallax__media{position:absolute;inset:-12% 0;z-index:0}
.atrium-site .a-parallax__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.atrium-site .a-parallax__inner{position:relative;z-index:2;display:grid;gap:1.25rem;justify-items:center;text-align:center;padding-block:clamp(3rem,8vw,6rem)}
.atrium-site .a-parallax__heading{font-size:var(--a-text-5xl);max-width:20ch}
@supports (animation-timeline:view()){
  @media (prefers-reduced-motion:no-preference){
    .atrium-site .a-parallax-band .a-parallax__img{animation:a-parallax linear both;animation-timeline:view();animation-range:cover}
    .atrium-site .a-parallax--medium .a-parallax__img{--drift:10%}.atrium-site .a-parallax--strong .a-parallax__img{--drift:16%}
  }
}
@keyframes a-parallax{from{transform:translateY(calc(var(--drift,6%) * -1))}to{transform:translateY(var(--drift,6%))}}
.atrium-site .a-animated-text--md{font-size:var(--a-text-3xl)}.atrium-site .a-animated-text--lg{font-size:var(--a-text-4xl)}.atrium-site .a-animated-text--xl{font-size:var(--a-text-5xl)}.atrium-site .a-animated-text--display{font-size:var(--a-text-6xl)}
.atrium-site .a-rotator{position:relative;display:inline-grid;vertical-align:bottom;overflow:hidden}
.atrium-site .a-rotator--italic{font-style:italic}
.atrium-site .a-rotator__sizer{visibility:hidden;grid-area:1/1}
.atrium-site .a-rotator__word{grid-area:1/1;opacity:0;transform:translateY(60%);transition:opacity .5s var(--a-ease),transform .6s var(--a-ease-out);white-space:nowrap}
.atrium-site .a-rotator__word.is-active{opacity:1;transform:none}
.atrium-site .a-rotator__word.is-leaving{transform:translateY(-60%)}
.atrium-site .a-rotator--fade .a-rotator__word{transform:none}
.atrium-site .a-rotator__type{display:inline-block;overflow:hidden;white-space:nowrap;border-right:2px solid currentColor}
.atrium-site .a-rotator--type .a-rotator__word{transform:none}
.atrium-site .a-rotator--type .is-active .a-rotator__type{animation:a-type 1.1s steps(var(--chars,8)) both}
@keyframes a-type{from{width:0}to{width:calc(var(--chars,8) * 1ch)}}
.atrium-site .a-embed{position:relative;width:100%;overflow:hidden;border-radius:var(--a-radius-sm)}
.atrium-site .a-embed--html{overflow:visible}
.atrium-site .a-embed__frame{position:absolute;inset:0;width:100%;height:100%;border:0}
.atrium-site .a-embed__placeholder{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:.35rem;padding:1rem;text-align:center;border:1px dashed color-mix(in srgb,var(--t-text) 30%,transparent);border-radius:inherit;background:color-mix(in srgb,var(--t-text) 4%,transparent);color:var(--t-muted);font-size:var(--a-text-sm)}
.atrium-site .a-embed--placeholder{min-height:8rem}
.atrium-site .a-embed__placeholder-label{font-weight:600;color:var(--t-text)}
.atrium-site .a-embed__placeholder-host{font-family:ui-monospace,monospace;overflow-wrap:anywhere}
.atrium-site .a-embed__placeholder-note{font-size:var(--a-text-xs)}
.atrium-site .a-global{display:contents}
`;
