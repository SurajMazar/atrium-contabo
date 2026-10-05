import type { CSSProperties, ReactNode } from 'react';
import { Crossfade } from '../islands/crossfade';
import type { RenderContext, RenderProps } from '../types';
import { Buttons } from '../ui/actions';
import { cx, editProp, part, Rich, root, toArray } from '../ui/core';
import { AImage, Frame, toMedia } from '../ui/media';

const IMMERSIVE = new Set(['fullscreen-image', 'fullscreen-video', 'carousel', 'cinematic']);

function HeroCopy({ ctx, props, className, size }: { ctx: RenderContext; props: Record<string, any>; className?: string; size?: string }) {
  const meta = toArray<{ label: string; value: string }>(props.meta).filter((m) => m.label || m.value);
  return (
    <div className={cx('a-hero__copy', className)}>
      {props.eyebrow ? <p className="a-eyebrow a-hero__eyebrow" {...part} {...editProp(ctx, 'eyebrow')}><Rich text={props.eyebrow} /></p> : null}
      <h1 className={cx('a-heading', 'a-hero__heading', size && `a-hero__heading--${size}`)} {...part} {...editProp(ctx, 'heading')}>
        <Rich text={props.heading} />
      </h1>
      {props.subheading ? <p className="a-hero__sub" {...part} {...editProp(ctx, 'subheading')}><Rich text={props.subheading} /></p> : null}
      <Buttons ctx={ctx} buttons={props.buttons} asPart className="a-hero__actions" />
      {meta.length ? (
        <dl className="a-hero__meta" {...part}>
          {meta.map((m, i) => (
            <div key={i}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function ScrollCue({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="a-hero__cue" aria-hidden="true">
      <span className="a-hero__cue-line" />
      <span>Scroll</span>
    </span>
  );
}

function BackgroundMedia({ ctx, props, variant }: { ctx: RenderContext; props: Record<string, any>; variant: string }): ReactNode {
  const image = toMedia(props.image) ?? toMedia(toArray(props.images)[0]);
  const video = toMedia(props.video);
  const editor = ctx.mode === 'editor';
  if (variant === 'carousel') {
    const slides = toArray(props.images).map(toMedia).filter(Boolean);
    const list = slides.length ? slides : image ? [image] : [];
    return (
      <div className="a-hero__media" data-a-bg="">
        <Crossfade interval={6} paused={editor} className="a-hero__slides" label="Background images">
          {list.map((m, i) => (
            <div key={i} className={cx('a-hero__slide', i === 0 && 'is-active')}>
              <AImage ctx={ctx} media={m} priority={i === 0} sizes="100vw" />
            </div>
          ))}
        </Crossfade>
      </div>
    );
  }
  if ((variant === 'fullscreen-video' || variant === 'cinematic') && video) {
    return (
      <div className="a-hero__media" data-a-bg="">
        {image ? <AImage ctx={ctx} media={image} priority sizes="100vw" className="a-hero__poster" /> : null}
        {!editor ? (
          <video className="a-hero__video" autoPlay muted loop playsInline preload="metadata" poster={image?.src} aria-hidden="true" tabIndex={-1}>
            <source src={video.src} type={video.mimeType ?? (video.src.endsWith('.webm') ? 'video/webm' : 'video/mp4')} />
          </video>
        ) : null}
      </div>
    );
  }
  if (!image) return <div className="a-hero__media a-hero__media--empty" data-a-bg="" />;
  return (
    <div className="a-hero__media" data-a-bg="">
      <AImage ctx={ctx} media={image} priority sizes="100vw" />
    </div>
  );
}

export function HeroRenderer(rp: RenderProps) {
  const { props, ctx, attrs, node } = rp;
  const variant = rp.variant ?? 'fullscreen-image';
  const immersive = IMMERSIVE.has(variant);
  const tone = immersive ? 'inverse' : ((props.tone as string) || 'default');
  const cls = cx(
    'a-section', 'a-hero', `a-hero--${variant}`, immersive && 'a-hero--immersive', `a-tone-${tone}`,
    `a-hero--h-${props.height ?? 'screen'}`, `a-hero--pos-${props.contentPosition ?? 'bottom-left'}`,
    `a-pt-${props.spacingTop ?? 'none'}`, `a-pb-${props.spacingBottom ?? 'none'}`,
    ctx.headerOverlay && ctx.depth === 0 && 'a-hero--under-header', ctx.depth > 0 && 'a-section--nested',
  );
  const width = `a-container--${props.containerWidth ?? 'wide'}`;
  const overlayStyle = { '--overlay': props.overlayOpacity ?? 0.35 } as CSSProperties;
  const image = toMedia(props.image) ?? toMedia(toArray(props.images)[0]);

  if (immersive) {
    return (
      <section {...root(attrs, cls)} style={overlayStyle}>
        <BackgroundMedia ctx={ctx} props={props} variant={variant} />
        <div className="a-overlay" />
        {variant === 'cinematic' ? <div className="a-scrim" /> : null}
        <div className={cx('a-container', width, 'a-hero__inner', 'a-on-media')}>
          <HeroCopy ctx={ctx} props={props} size={variant === 'cinematic' ? 'cinematic' : undefined} />
        </div>
        <ScrollCue show={props.showScrollCue} />
      </section>
    );
  }

  if (variant === 'split' || variant === 'editorial') {
    const side = props.imageSide === 'left' ? 'left' : 'right';
    return (
      <section {...root(attrs, cls, `a-hero--img-${side}`)}>
        <div className={cx('a-container', width, 'a-hero__inner')}>
          <HeroCopy ctx={ctx} props={props} />
          <div className="a-hero__figure" data-a-bg="">
            <Frame ctx={ctx} media={image} aspect={variant === 'editorial' ? '4:5' : undefined} priority sizes="(max-width: 767px) 100vw, 50vw" className="a-hero__frame" />
          </div>
        </div>
        <ScrollCue show={props.showScrollCue} />
      </section>
    );
  }

  if (variant === 'text-overlay') {
    return (
      <section {...root(attrs, cls)}>
        <div className={cx('a-container', width, 'a-hero__inner')}>
          <Frame ctx={ctx} media={image} aspect="16:9" priority sizes="100vw" className="a-hero__frame" />
          <div className="a-hero__panel"><HeroCopy ctx={ctx} props={props} /></div>
        </div>
      </section>
    );
  }

  if (variant === 'centered') {
    return (
      <section {...root(attrs, cls)}>
        <div className={cx('a-container', width, 'a-hero__inner')}>
          <HeroCopy ctx={ctx} props={props} className="a-hero__copy--center" />
          {image ? <div className="a-hero__figure" data-a-bg=""><Frame ctx={ctx} media={image} aspect="21:9" priority sizes="100vw" className="a-hero__frame" /></div> : null}
        </div>
      </section>
    );
  }

  // minimal
  return (
    <section {...root(attrs, cls)}>
      <div className={cx('a-container', width, 'a-hero__inner')}>
        <HeroCopy ctx={ctx} props={props} className={props.contentPosition === 'center' || props.contentPosition === 'bottom-center' ? 'a-hero__copy--center' : undefined} />
      </div>
      <ScrollCue show={props.showScrollCue} />
      {node.children?.length ? null : null}
    </section>
  );
}

export const HERO_CSS = /* css */ `
.atrium-site .a-hero{position:relative;overflow:hidden;display:flex;flex-direction:column}
.atrium-site .a-hero__copy{position:relative;z-index:2;display:grid;gap:clamp(1rem,2vw,1.5rem);max-width:52rem}
.atrium-site .a-hero__copy--center{text-align:center;justify-items:center;margin-inline:auto}
.atrium-site .a-hero__copy--center .a-actions{justify-content:center}
.atrium-site .a-hero__heading{font-size:var(--a-text-6xl);line-height:1}
.atrium-site .a-hero__sub{font-size:var(--a-text-lg);line-height:1.55;color:var(--t-muted);max-width:36rem;text-wrap:pretty}
.atrium-site .a-hero__copy--center .a-hero__sub{margin-inline:auto}
.atrium-site .a-hero__actions{margin-top:var(--a-space-2)}
.atrium-site .a-hero__meta{display:flex;flex-wrap:wrap;gap:var(--a-space-4) clamp(1.5rem,4vw,3.5rem);margin-top:var(--a-space-4);padding-top:var(--a-space-5);border-top:1px solid var(--t-border)}
.atrium-site .a-hero__meta div{display:grid;gap:.3rem}
.atrium-site .a-hero__meta dt{font-size:var(--a-text-xs);letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-hero__meta dd{margin:0;font-family:var(--a-font-heading);font-size:var(--a-text-xl)}
.atrium-site .a-hero--h-screen{min-height:100svh}
.atrium-site .a-hero--h-tall{min-height:min(86svh,58rem)}
.atrium-site .a-hero--immersive.a-hero--h-auto{min-height:34rem}
.atrium-site .a-hero__inner{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;width:100%}

/* immersive (image / video / slideshow / cinematic) */
.atrium-site .a-hero--immersive{color:var(--a-color-inverse-text);background:var(--a-color-inverse)}
.atrium-site .a-hero__media{position:absolute;inset:0;z-index:0;overflow:hidden}
.atrium-site .a-hero__media .a-img,.atrium-site .a-hero__media video,.atrium-site .a-hero__slide{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.atrium-site .a-hero__media--empty{background:linear-gradient(135deg,var(--a-color-inverse),color-mix(in srgb,var(--a-color-primary) 55%,var(--a-color-inverse)))}
.atrium-site .a-hero__video{z-index:1}
.atrium-site .a-hero__slide{opacity:0;transition:opacity 1.6s var(--a-ease);transform:scale(1.04)}
.atrium-site .a-hero__slide.is-active{opacity:1;transform:scale(1);transition:opacity 1.6s var(--a-ease),transform 7s linear}
.atrium-site .a-hero--immersive .a-hero__inner{padding-block:clamp(7rem,14vh,10rem) clamp(3rem,8vh,5.5rem)}
.atrium-site .a-hero--immersive .a-hero__copy{max-width:58rem}
.atrium-site .a-hero--immersive .a-hero__sub{color:color-mix(in srgb,var(--a-color-inverse-text) 86%,transparent)}
.atrium-site .a-hero--pos-bottom-left .a-hero__inner{justify-content:flex-end}
.atrium-site .a-hero--pos-bottom-center .a-hero__inner{justify-content:flex-end;align-items:center;text-align:center}
.atrium-site .a-hero--pos-bottom-center .a-hero__copy,.atrium-site .a-hero--pos-center .a-hero__copy{justify-items:center;text-align:center;margin-inline:auto}
.atrium-site .a-hero--pos-bottom-center .a-actions,.atrium-site .a-hero--pos-center .a-actions{justify-content:center}
.atrium-site .a-hero--pos-bottom-center .a-hero__sub,.atrium-site .a-hero--pos-center .a-hero__sub{margin-inline:auto}
.atrium-site .a-hero--pos-center .a-hero__inner{justify-content:center;align-items:center}
.atrium-site .a-hero--pos-left .a-hero__inner{justify-content:center}
.atrium-site .a-hero--pos-top-left .a-hero__inner{justify-content:flex-start}
.atrium-site .a-hero--immersive .a-hero__meta{border-top-color:color-mix(in srgb,var(--a-color-inverse-text) 28%,transparent)}
.atrium-site .a-hero--cinematic .a-overlay{opacity:calc(var(--overlay,.35) * .6)}
.atrium-site .a-hero__heading--cinematic{font-size:clamp(3.2rem,9.5vw,9.5rem);line-height:.92;letter-spacing:-.025em}
.atrium-site .a-hero--cinematic .a-hero__copy{max-width:none}
.atrium-site .a-hero--cinematic .a-hero__sub{max-width:34rem}
.atrium-site .a-hero__cue{position:absolute;z-index:3;right:var(--a-gutter);bottom:clamp(2rem,6vh,3.5rem);display:flex;flex-direction:column;align-items:center;gap:.75rem;font-size:var(--a-text-xs);letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted);writing-mode:vertical-rl}
.atrium-site .a-hero__cue-line{width:1px;height:3.5rem;background:linear-gradient(currentColor,transparent);animation:a-cue 2.4s var(--a-ease) infinite}
@keyframes a-cue{0%{transform:scaleY(0);transform-origin:top}45%{transform:scaleY(1);transform-origin:top}55%{transform:scaleY(1);transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}

/* split & editorial */
.atrium-site .a-hero--split .a-hero__inner,.atrium-site .a-hero--editorial .a-hero__inner{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:clamp(2rem,6vw,6rem);padding-block:clamp(7rem,15vh,10rem) clamp(3rem,8vh,6rem)}
.atrium-site .a-hero--img-left .a-hero__figure{order:-1}
.atrium-site .a-hero--split .a-hero__figure{align-self:stretch;min-height:28rem}
.atrium-site .a-hero--split .a-hero__frame{height:100%;border-radius:var(--a-radius-md)}
.atrium-site .a-hero--split .a-hero__frame>.a-img{position:absolute}
.atrium-site .a-hero--editorial .a-hero__inner{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);align-items:end}
.atrium-site .a-hero--editorial.a-hero--img-left .a-hero__inner{grid-template-columns:minmax(0,1fr) minmax(0,1.25fr)}
.atrium-site .a-hero--editorial .a-hero__heading{font-size:clamp(3rem,7.4vw,7.25rem);line-height:.95}
.atrium-site .a-hero--editorial .a-hero__figure{position:relative}
.atrium-site .a-hero--editorial .a-hero__figure::before{content:"";position:absolute;inset:auto auto -1.25rem -1.25rem;width:45%;height:45%;border:1px solid var(--t-border);z-index:-1}
.atrium-site .a-hero--editorial .a-hero__frame{border-radius:var(--a-radius-sm)}
.atrium-site .a-hero--split.a-hero--h-auto .a-hero__inner,.atrium-site .a-hero--editorial.a-hero--h-auto .a-hero__inner{padding-block:clamp(6rem,12vh,8rem) clamp(2rem,6vh,4rem)}

/* centered, minimal, overlay panel */
.atrium-site .a-hero--centered .a-hero__inner{gap:clamp(2.5rem,6vw,5rem);padding-block:clamp(8rem,16vh,11rem) clamp(2rem,6vh,4rem);justify-content:center}
.atrium-site .a-hero--centered.a-hero--h-screen,.atrium-site .a-hero--centered.a-hero--h-tall,.atrium-site .a-hero--minimal.a-hero--h-tall{min-height:auto}
.atrium-site .a-hero--centered .a-hero__frame{border-radius:var(--a-radius-md)}
.atrium-site .a-hero--minimal .a-hero__inner{justify-content:flex-end;padding-block:clamp(9rem,20vh,13rem) clamp(3rem,8vh,5rem)}
.atrium-site .a-hero--minimal.a-hero--h-screen .a-hero__inner{justify-content:center}
.atrium-site .a-hero--minimal .a-hero__heading{font-size:clamp(3rem,8vw,8rem);line-height:.96;max-width:16ch}
.atrium-site .a-hero--minimal .a-hero__copy{max-width:none}
.atrium-site .a-hero--minimal .a-hero__copy--center .a-hero__heading{margin-inline:auto}
.atrium-site .a-hero--text-overlay .a-hero__inner{position:relative;padding-block:clamp(7rem,14vh,9rem) clamp(3rem,8vh,5rem)}
.atrium-site .a-hero--text-overlay.a-hero--h-screen{min-height:auto}
.atrium-site .a-hero--text-overlay .a-hero__frame{border-radius:var(--a-radius-md)}
.atrium-site .a-hero__panel{position:relative;z-index:2;width:min(36rem,92%);margin:-8rem 0 0 clamp(1rem,4vw,3.5rem);padding:clamp(1.75rem,4vw,3.25rem);background:var(--t-bg);color:var(--t-text);border-radius:var(--a-radius-sm);box-shadow:var(--a-shadow-lg)}
.atrium-site .a-hero__panel .a-hero__heading{font-size:var(--a-text-5xl)}
.atrium-site .a-hero--under-header:not(.a-hero--immersive) .a-hero__inner{padding-top:calc(var(--a-header-h) + clamp(3rem,8vh,5rem))}

@media (max-width:991px){
  .atrium-site .a-hero--split .a-hero__inner,.atrium-site .a-hero--editorial .a-hero__inner,.atrium-site .a-hero--editorial.a-hero--img-left .a-hero__inner{grid-template-columns:1fr;align-items:start}
  .atrium-site .a-hero--img-left .a-hero__figure{order:0}
  .atrium-site .a-hero--split .a-hero__figure{min-height:0}
  .atrium-site .a-hero--split .a-hero__frame{aspect-ratio:4/3}
  .atrium-site .a-hero--split.a-hero--h-screen,.atrium-site .a-hero--editorial.a-hero--h-screen{min-height:auto}
  .atrium-site .a-hero--editorial .a-hero__figure::before{display:none}
}
@media (max-width:767px){
  .atrium-site .a-hero--h-screen.a-hero--immersive{min-height:92svh}
  .atrium-site .a-hero__heading{font-size:var(--a-text-5xl)}
  .atrium-site .a-hero__cue{display:none}
  .atrium-site .a-hero__panel{margin:-3rem auto 0;width:94%}
  .atrium-site .a-hero--centered .a-hero__frame{aspect-ratio:4/3}
}
@media (prefers-reduced-motion:reduce){.atrium-site .a-hero__video{display:none}.atrium-site .a-hero__slide{transition:none!important;transform:none!important}}
`;
