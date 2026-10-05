import { sanitizeUrl } from '@atrium/schema';
import type { CSSProperties } from 'react';
import { Carousel } from '../islands/carousel';
import { VideoFacade } from '../islands/interactive';
import { Lightbox, type LightboxImage } from '../islands/lightbox';
import type { RenderContext, RenderProps } from '../types';
import { ALink, Buttons } from '../ui/actions';
import { aspectStyle, cx, editProp, part, Rich, root, toArray } from '../ui/core';
import { AImage, Frame, gridSizes, toMedia } from '../ui/media';
import { Intro, Section } from '../ui/section';

// ---------------------------------------------------------------- image

export function ImageRenderer({ props, ctx, attrs }: RenderProps) {
  const frame = (
    <Frame ctx={ctx} media={props.image} aspect={props.aspect} rounded={props.rounded} fit={props.fit} priority={props.priority} sizes="(max-width: 767px) 100vw, 60vw" className={cx(props.frame !== 'none' && `a-image__frame--${props.frame}`)} />
  );
  return (
    <figure {...root(attrs, 'a-image')}>
      {props.link ? <ALink ctx={ctx} link={props.link} className="a-image__link a-hover-zoom">{frame}</ALink> : frame}
      {props.caption ? <figcaption className="a-caption" {...editProp(ctx, 'caption')}><Rich text={props.caption} /></figcaption> : null}
    </figure>
  );
}

// ---------------------------------------------------------------- video

export function parseVideoUrl(url: string | undefined, source: string): { provider: 'youtube' | 'vimeo' | null; id?: string } {
  if (!url) return { provider: null };
  if (source === 'youtube' || /youtu\.?be/.test(url)) {
    const m = /(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/.exec(url);
    return m ? { provider: 'youtube', id: m[1] } : /^[\w-]{11}$/.test(url) ? { provider: 'youtube', id: url } : { provider: null };
  }
  if (source === 'vimeo' || /vimeo\.com/.test(url)) {
    const m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url) ?? /^(\d+)$/.exec(url);
    return m ? { provider: 'vimeo', id: m[1] } : { provider: null };
  }
  return { provider: null };
}

export function videoEmbedUrl(provider: 'youtube' | 'vimeo', id: string, opts: { loop?: boolean; muted?: boolean; controls?: boolean } = {}): string {
  if (provider === 'youtube') {
    const q = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', playsinline: '1' });
    if (opts.muted) q.set('mute', '1');
    if (opts.loop) { q.set('loop', '1'); q.set('playlist', id); }
    if (opts.controls === false) q.set('controls', '0');
    return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
  }
  const q = new URLSearchParams({ autoplay: '1', dnt: '1', title: '0', byline: '0', portrait: '0' });
  if (opts.muted) q.set('muted', '1');
  if (opts.loop) q.set('loop', '1');
  return `https://player.vimeo.com/video/${id}?${q}`;
}

export function VideoRenderer({ props, ctx, attrs }: RenderProps) {
  const aspect = aspectStyle(props.aspect)?.aspectRatio;
  const poster = toMedia(props.poster);
  const caption = props.caption ? <figcaption className="a-caption"><Rich text={props.caption} /></figcaption> : null;
  if (props.source === 'file') {
    const file = toMedia(props.video);
    const editor = ctx.mode === 'editor';
    return (
      <figure {...root(attrs, 'a-video-block')}>
        <div className={`a-video a-r-${props.rounded ?? 'sm'}`} style={{ aspectRatio: aspect }}>
          {file ? (
            <video className="a-video__el" controls={props.controls !== false} preload="none" poster={poster?.src} playsInline muted={props.muted || props.autoplay} loop={props.loop} autoPlay={props.autoplay && !editor} aria-label={props.title}>
              <source src={file.src} type={file.mimeType ?? 'video/mp4'} />
            </video>
          ) : poster ? <AImage ctx={ctx} media={poster} className="a-video__poster" /> : null}
        </div>
        {caption}
      </figure>
    );
  }
  const parsed = parseVideoUrl(props.url, props.source);
  const thumb = poster ?? (parsed.provider === 'youtube' && parsed.id ? { src: `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`, alt: '' } : undefined);
  const posterEl = thumb ? <AImage ctx={ctx} media={thumb} className="a-video__poster" sizes="(max-width: 767px) 100vw, 70vw" /> : <span className="a-video__blank" />;
  return (
    <figure {...root(attrs, 'a-video-block')}>
      {parsed.provider && parsed.id && ctx.mode !== 'editor' ? (
        <VideoFacade embedUrl={videoEmbedUrl(parsed.provider, parsed.id, props)} title={props.title ?? 'Video'} poster={posterEl} aspect={aspect} rounded={props.rounded} />
      ) : (
        <div className={`a-video a-r-${props.rounded ?? 'sm'}`} style={{ aspectRatio: aspect }}>
          <div className="a-video__facade">{posterEl}<span className="a-video__play" aria-hidden="true">▶</span></div>
        </div>
      )}
      {caption}
    </figure>
  );
}

// ---------------------------------------------------------------- background video

export function BackgroundVideoRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const video = toMedia(props.video);
  const poster = toMedia(props.poster);
  const editor = ctx.mode === 'editor';
  return (
    <Section rp={rp} container={false} className={cx('a-on-media', `a-bgvideo--h-${props.height ?? 'tall'}`, `a-bgvideo--pos-${props.contentPosition ?? 'center'}`)} labelled>
      <div className="a-bgvideo__media" data-a-bg="">
        {poster ? <AImage ctx={ctx} media={poster} sizes="100vw" className="a-bgvideo__poster" /> : null}
        {video && !editor ? (
          <video className="a-bgvideo__video" autoPlay muted loop playsInline preload="metadata" poster={poster?.src} aria-hidden="true" tabIndex={-1}>
            <source src={video.src} type={video.mimeType ?? 'video/mp4'} {...(props.mobilePosterOnly ? { media: '(min-width: 768px)' } : {})} />
          </video>
        ) : null}
      </div>
      <div className="a-overlay" style={{ '--overlay': props.overlayOpacity ?? 0.4 } as CSSProperties} />
      <div className={cx('a-container', `a-container--${props.containerWidth ?? 'default'}`, 'a-bgvideo__inner')}>
        <div className="a-bgvideo__copy">
          {props.eyebrow ? <p className="a-eyebrow" {...part} {...editProp(ctx, 'eyebrow')}>{props.eyebrow}</p> : null}
          {props.heading ? <h2 className="a-heading a-bgvideo__heading" id={`h-${node.id}`} {...part} {...editProp(ctx, 'heading')}><Rich text={props.heading} /></h2> : null}
          {props.subheading ? <p className="a-lead" {...part} {...editProp(ctx, 'subheading')}><Rich text={props.subheading} /></p> : null}
          <Buttons ctx={ctx} buttons={props.buttons} asPart align={props.contentPosition === 'bottom-left' ? undefined : 'center'} />
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- gallery

type GalleryItem = { src: string; alt?: string; caption?: string; category?: string; width?: number; height?: number; mediaId?: string; focalPoint?: { x: number; y: number } };

export function galleryImages(ctx: RenderContext, props: Record<string, any>): GalleryItem[] {
  const field = props.fromItemField as string | undefined;
  if (field && ctx.scope.item) {
    const v = (ctx.scope.item as Record<string, unknown>)[field];
    const list = toArray(v).map((x) => toMedia(x)).filter(Boolean) as GalleryItem[];
    if (list.length) return list;
  }
  return toArray<GalleryItem>(props.images).filter((i) => i?.src);
}

const EDITORIAL_PATTERN = ['a-g-wide', 'a-g-tall', '', '', 'a-g-tall', 'a-g-wide'];

export function GalleryRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'editorial';
  const images = galleryImages(ctx, props);
  const cols = Number(props.columns ?? 3);
  const lightbox = props.lightbox !== false && ctx.mode !== 'editor';
  const showCaptions = !!props.showCaptions;
  const item = (img: GalleryItem, i: number, opts: { aspect?: string; sizes: string; className?: string }) => {
    const inner = (
      <>
        <Frame ctx={ctx} media={img} aspect={opts.aspect} sizes={opts.sizes} rounded="sm" />
        {showCaptions && (img.caption || variant === 'stacked') ? <figcaption className="a-caption"><Rich text={img.caption ?? img.alt} /></figcaption> : null}
      </>
    );
    return (
      <figure key={i} className={cx('a-gallery__item', opts.className)} data-category={img.category || undefined}>
        {lightbox && sanitizeUrl(img.src, 'media') ? <a href={sanitizeUrl(img.src, 'media')} className="a-gallery__open a-hover-zoom" data-lightbox-index={i} aria-label={`Open image: ${img.alt || `image ${i + 1}`}`}>{inner}</a> : inner}
      </figure>
    );
  };

  let body;
  if (!images.length) body = ctx.mode === 'editor' ? <div className="a-dropzone">Add images to the gallery</div> : null;
  else if (variant === 'carousel') {
    body = (
      <Carousel label={props.heading ? String(props.heading).replace(/\*/g, '') : 'Gallery'} layout="cards" paused={ctx.mode === 'editor'} className="a-gallery__carousel" >
        {images.map((img, i) => item(img, i, { aspect: props.aspect, sizes: gridSizes(cols) }))}
      </Carousel>
    );
  } else if (variant === 'masonry') {
    body = <div className={cx('a-gallery__masonry', `a-gap-${props.gap ?? 'md'}`)} style={{ '--cols': cols } as CSSProperties}>{images.map((img, i) => item(img, i, { sizes: gridSizes(cols) }))}</div>;
  } else if (variant === 'stacked') {
    body = <div className="a-gallery__stacked">{images.map((img, i) => item(img, i, { sizes: '(max-width: 991px) 100vw, 1100px' }))}</div>;
  } else if (variant === 'grid') {
    body = (
      <div className={cx('a-grid', `a-gap-${props.gap ?? 'md'}`)} style={{ '--cols': cols, '--cols-t': Math.min(cols, 2), '--cols-m': cols > 2 ? 2 : 1 } as CSSProperties}>
        {images.map((img, i) => item(img, i, { aspect: props.aspect, sizes: gridSizes(cols) }))}
      </div>
    );
  } else {
    body = (
      <div className={cx('a-gallery__editorial', `a-gap-${props.gap ?? 'md'}`)}>
        {images.map((img, i) => item(img, i, { sizes: '(max-width: 767px) 100vw, 50vw', className: EDITORIAL_PATTERN[i % EDITORIAL_PATTERN.length] }))}
      </div>
    );
  }

  const lbImages: LightboxImage[] = images.map((img) => ({ src: img.src, srcSet: ctx.image.srcSet(img.src, img.mediaId), alt: img.alt ?? '', caption: img.caption }));
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {lightbox && images.length ? <Lightbox images={lbImages} label="Gallery viewer">{body}</Lightbox> : body}
    </Section>
  );
}

// ---------------------------------------------------------------- carousel

export function CarouselRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'peek';
  const slides = toArray<{ image?: unknown; eyebrow?: string; title?: string; text?: string; link?: unknown }>(props.slides);
  return (
    <Section rp={rp} labelled width={variant === 'full' ? props.containerWidth : 'wide'}>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <Carousel label={props.heading ? String(props.heading).replace(/\*/g, '') : 'Carousel'} layout={variant as 'full' | 'peek' | 'cards'} autoplay={props.autoplay} interval={props.interval} loop={props.loop} showArrows={props.showArrows} showDots={props.showDots} paused={ctx.mode === 'editor'}>
        {slides.map((s, i) => {
          const card = (
            <figure className="a-slide">
              <Frame ctx={ctx} media={s.image} aspect={variant === 'cards' ? '4:5' : props.aspect} sizes={variant === 'cards' ? gridSizes(3) : '(max-width: 767px) 100vw, 80vw'} rounded="sm" />
              {s.title || s.text || s.eyebrow ? (
                <figcaption className="a-slide__caption">
                  {s.eyebrow ? <span className="a-tag">{s.eyebrow}</span> : null}
                  {s.title ? <span className="a-card-title"><Rich text={s.title} /></span> : null}
                  {s.text ? <span className="a-muted a-small">{s.text}</span> : null}
                </figcaption>
              ) : null}
            </figure>
          );
          return s.link ? <ALink key={i} ctx={ctx} link={s.link as string} className="a-hover-zoom a-slide__link">{card}</ALink> : <div key={i}>{card}</div>;
        })}
      </Carousel>
    </Section>
  );
}

// ---------------------------------------------------------------- logo cloud

export function LogoCloudRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'grid';
  const logos = toArray<{ name: string; image?: unknown; link?: unknown }>(props.logos);
  const renderLogo = (l: { name: string; image?: unknown; link?: unknown }, i: number, hidden?: boolean) => {
    const m = toMedia(l.image);
    const inner = m ? <AImage ctx={ctx} media={m} alt={hidden ? '' : l.name} className="a-logos__img" sizes="12rem" /> : <span className="a-logos__word">{l.name}</span>;
    return (
      <li key={`${hidden ? 'd' : 'l'}${i}`} className="a-logos__item" aria-hidden={hidden || undefined}>
        {l.link && !hidden ? <ALink ctx={ctx} link={l.link as string} label={l.name}>{inner}</ALink> : inner}
      </li>
    );
  };
  const intro = props.eyebrow || props.heading ? <Intro ctx={ctx} props={props} nodeId={node.id} className="a-logos__intro" /> : null;
  if (variant === 'marquee') {
    return (
      <Section rp={rp} className={cx(props.grayscale && 'a-logos--mono')} width="full">
        {intro}
        <div className="a-ticker a-logos__marquee" style={{ '--speed': `${props.speed ?? 40}s` } as CSSProperties}>
          <ul className="a-ticker__track">
            {logos.map((l, i) => renderLogo(l, i))}
            {logos.map((l, i) => renderLogo(l, i, true))}
          </ul>
        </div>
      </Section>
    );
  }
  const cols = Number(props.columns ?? 6);
  return (
    <Section rp={rp} className={cx(props.grayscale && 'a-logos--mono')}>
      {intro}
      <ul className={cx('a-logos__grid', props.align === 'center' && 'a-logos__grid--center')} style={{ '--cols': Math.min(cols, Math.max(logos.length, 1)) } as CSSProperties}>
        {logos.map((l, i) => renderLogo(l, i))}
      </ul>
    </Section>
  );
}

export const MEDIA_CSS = /* css */ `
.atrium-site .a-image{display:grid;gap:.85rem;margin:0}
.atrium-site .a-image__link{display:block}
.atrium-site .a-image__frame--border{border:1px solid var(--t-border);padding:.6rem;background:var(--t-bg)}
.atrium-site .a-image__frame--border>.a-img{position:relative;inset:auto}
.atrium-site .a-image__frame--inset{box-shadow:inset 0 0 0 .6rem var(--t-bg)}
.atrium-site .a-caption{font-size:var(--a-text-sm);color:var(--t-muted);line-height:1.5}
.atrium-site .a-video-block{display:grid;gap:.85rem;margin:0}
.atrium-site .a-video{position:relative;overflow:hidden;width:100%;aspect-ratio:16/9;background:var(--a-color-inverse)}
.atrium-site .a-video__el,.atrium-site .a-video__frame{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover}
.atrium-site .a-video__facade{position:absolute;inset:0;display:grid;place-items:center;width:100%;padding:0;border:0;background:none;cursor:pointer}
.atrium-site .a-video__poster,.atrium-site .a-video__blank{position:absolute!important;inset:0;width:100%;height:100%!important;object-fit:cover;transition:transform 1.2s var(--a-ease-out)}
.atrium-site .a-video__blank{background:linear-gradient(135deg,var(--a-color-inverse),color-mix(in srgb,var(--a-color-primary) 50%,var(--a-color-inverse)))}
.atrium-site .a-video__facade:hover .a-video__poster{transform:scale(1.03)}
.atrium-site .a-video__play{position:relative;display:grid;place-items:center;width:4.5rem;height:4.5rem;border-radius:50%;background:color-mix(in srgb,var(--a-color-inverse-text) 92%,transparent);color:var(--a-color-inverse);box-shadow:var(--a-shadow-lg);transition:transform .4s var(--a-ease)}
.atrium-site .a-video__play svg{margin-left:3px}
.atrium-site .a-video__facade:hover .a-video__play{transform:scale(1.08)}

.atrium-site .a-background-video{display:flex;overflow:hidden;background:var(--a-color-inverse);color:var(--a-color-inverse-text)}
.atrium-site .a-bgvideo--h-half{min-height:55svh}.atrium-site .a-bgvideo--h-tall{min-height:80svh}.atrium-site .a-bgvideo--h-screen{min-height:100svh}.atrium-site .a-bgvideo--h-auto{min-height:28rem}
.atrium-site .a-bgvideo__media{position:absolute;inset:0;z-index:0}
.atrium-site .a-bgvideo__media :is(.a-img,video){position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.atrium-site .a-bgvideo__inner{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;padding-block:clamp(4rem,10vw,7rem)}
.atrium-site .a-bgvideo__copy{display:grid;gap:1.25rem;max-width:46rem;text-align:center;justify-items:center;margin-inline:auto}
.atrium-site .a-bgvideo--pos-bottom-left .a-bgvideo__inner{justify-content:flex-end}
.atrium-site .a-bgvideo--pos-bottom-left .a-bgvideo__copy{text-align:left;justify-items:start;margin-inline:0}
.atrium-site .a-bgvideo--pos-bottom-center .a-bgvideo__inner{justify-content:flex-end}
.atrium-site .a-bgvideo__heading{font-size:var(--a-text-5xl)}
.atrium-site .a-bgvideo__copy .a-lead{color:color-mix(in srgb,var(--a-color-inverse-text) 85%,transparent)}
@media (prefers-reduced-motion:reduce){.atrium-site .a-bgvideo__video{display:none}}

.atrium-site .a-gallery__item{margin:0;display:grid;gap:.7rem;min-width:0}
.atrium-site .a-gallery__open{display:block;cursor:zoom-in}
.atrium-site .a-gallery__editorial{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:clamp(9rem,17vw,15rem);grid-auto-flow:dense;gap:var(--gap,var(--a-gap))}
.atrium-site .a-gallery__editorial .a-gallery__item{grid-row:span 2}
.atrium-site .a-gallery__editorial .a-g-wide{grid-column:span 2}
.atrium-site .a-gallery__editorial .a-g-tall{grid-row:span 3}
.atrium-site .a-gallery__editorial .a-gallery__item,.atrium-site .a-gallery__editorial .a-gallery__open{height:100%}
.atrium-site .a-gallery__editorial .a-frame{height:100%}
.atrium-site .a-gallery__editorial .a-frame>.a-img{position:absolute;inset:0;width:100%;height:100%}
.atrium-site .a-gallery__editorial .a-gallery__item:has(.a-caption){grid-template-rows:minmax(0,1fr) auto}
@media (max-width:991px){.atrium-site .a-gallery__editorial{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:clamp(8rem,26vw,13rem)}}
@media (max-width:540px){.atrium-site .a-gallery__editorial{grid-template-columns:1fr}.atrium-site .a-gallery__editorial .a-g-wide{grid-column:auto}}
.atrium-site .a-gallery__masonry{columns:var(--cols,3);column-gap:var(--gap,var(--a-gap))}
.atrium-site .a-gallery__masonry .a-gallery__item{break-inside:avoid;margin-bottom:var(--gap,var(--a-gap))}
@media (max-width:991px){.atrium-site .a-gallery__masonry{columns:2}}
@media (max-width:540px){.atrium-site .a-gallery__masonry{columns:1}}
.atrium-site .a-gallery__stacked{display:grid;gap:clamp(2rem,6vw,5rem);max-width:68rem;margin-inline:auto}
.atrium-site .a-lightbox-scope{display:block}

.atrium-site .a-lightbox{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:clamp(1rem,4vw,3rem);border:0;background:color-mix(in srgb,var(--a-color-inverse) 96%,transparent);color:var(--a-color-inverse-text)}
.atrium-site .a-lightbox[open]{display:grid;place-items:center;animation:a-fade .3s var(--a-ease)}
.atrium-site .a-lightbox::backdrop{background:transparent}
@keyframes a-fade{from{opacity:0}to{opacity:1}}
.atrium-site .a-lightbox__figure{display:grid;gap:1rem;max-width:min(96vw,1600px);margin:0}
.atrium-site .a-lightbox__img{max-height:82vh;width:auto;max-width:100%;margin-inline:auto;object-fit:contain}
.atrium-site .a-lightbox__caption{display:flex;justify-content:space-between;gap:1rem;font-size:var(--a-text-sm);color:color-mix(in srgb,var(--a-color-inverse-text) 75%,transparent)}
.atrium-site .a-lightbox__btn{position:absolute;display:grid;place-items:center;width:3rem;height:3rem;border:1px solid color-mix(in srgb,var(--a-color-inverse-text) 30%,transparent);border-radius:50%;background:transparent;color:inherit;transition:background-color .3s}
.atrium-site .a-lightbox__btn:hover{background:color-mix(in srgb,var(--a-color-inverse-text) 12%,transparent)}
.atrium-site .a-lightbox__close{top:1.25rem;right:1.25rem}
.atrium-site .a-lightbox__prev{left:1.25rem;top:50%;transform:translateY(-50%)}
.atrium-site .a-lightbox__next{right:1.25rem;top:50%;transform:translateY(-50%)}

.atrium-site .a-slider{position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem;min-width:0}
.atrium-site .a-slider__track{min-width:0;width:100%;display:grid;grid-auto-flow:column;grid-auto-columns:var(--slide,82%);gap:var(--a-gap);overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;padding-bottom:2px}
.atrium-site .a-slider__track::-webkit-scrollbar{display:none}
.atrium-site .a-slider__slide{scroll-snap-align:start;min-width:0}
.atrium-site .a-slider--full .a-slider__track{--slide:100%}
.atrium-site .a-slider--cards .a-slider__track{--slide:calc((100% - 2 * var(--a-gap)) / 3)}
@media (max-width:991px){.atrium-site .a-slider--cards .a-slider__track{--slide:calc((100% - var(--a-gap)) / 2.2)}.atrium-site .a-slider--peek .a-slider__track{--slide:88%}}
@media (max-width:767px){.atrium-site .a-slider--cards .a-slider__track{--slide:82%}}
.atrium-site .a-slider__controls{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-width:0}
.atrium-site .a-slider__dots{flex:1 1 auto;min-width:0;flex-wrap:wrap;row-gap:.25rem}
@media (max-width:767px){.atrium-site .a-slider__count{display:none}.atrium-site .a-slider__dot{width:1.1rem}.atrium-site .a-slider__dot.is-active{width:1.9rem}}
.atrium-site .a-slider__dots{display:flex;gap:.5rem}
.atrium-site .a-slider__dot{width:1.75rem;height:2px;padding:0;border:0;background:var(--t-border);transition:background-color .3s,width .4s var(--a-ease)}
.atrium-site .a-slider__dot.is-active{width:3rem;background:var(--t-text)}
.atrium-site .a-slider__dot::before{content:"";display:block;height:1.25rem;margin-top:-.6rem}
.atrium-site .a-slider__arrows{display:flex;align-items:center;gap:.6rem}
.atrium-site .a-slider__count{margin-right:.75rem;font-size:var(--a-text-xs);letter-spacing:.12em;color:var(--t-muted);font-variant-numeric:tabular-nums}
.atrium-site .a-slider__arrow{display:grid;place-items:center;width:3rem;height:3rem;border:1px solid var(--t-border);border-radius:50%;background:transparent;color:inherit;transition:background-color .3s,border-color .3s}
.atrium-site .a-slider__arrow:hover:not([disabled]){background:var(--t-text);color:var(--t-bg);border-color:var(--t-text)}
.atrium-site .a-slider__arrow[disabled]{opacity:.35;cursor:default}
.atrium-site .a-slide{display:grid;gap:1rem;margin:0}
.atrium-site .a-slide__caption{display:grid;gap:.35rem}
.atrium-site .a-slide__link{display:block}

.atrium-site .a-logos__intro{margin-bottom:clamp(1.5rem,4vw,2.75rem)}
.atrium-site .a-logos__grid{display:grid;grid-template-columns:repeat(var(--cols,6),minmax(0,1fr));align-items:center;gap:2rem 2.5rem}
@media (max-width:991px){.atrium-site .a-logos__grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:540px){.atrium-site .a-logos__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.atrium-site .a-logos__item{display:flex;align-items:center;justify-content:center;min-height:3rem}
.atrium-site .a-logos__img{max-height:2.4rem;width:auto;max-width:9rem;object-fit:contain}
.atrium-site .a-logos__word{font-family:var(--a-font-heading);font-size:var(--a-text-xl);letter-spacing:-.01em;white-space:nowrap;opacity:.78}
.atrium-site .a-logos--mono .a-logos__img{filter:grayscale(1);opacity:.7;transition:filter .3s,opacity .3s}
.atrium-site .a-logos--mono .a-logos__item:hover .a-logos__img{filter:none;opacity:1}
.atrium-site .a-ticker{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.atrium-site .a-ticker__track{display:flex;width:max-content;animation:a-ticker var(--speed,40s) linear infinite}
.atrium-site .a-ticker:hover .a-ticker__track{animation-play-state:paused}
.atrium-site .a-logos__marquee .a-logos__item{padding-inline:clamp(1.5rem,4vw,3.5rem)}
@keyframes a-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.atrium-site .a-ticker__track{animation:none;flex-wrap:wrap;width:auto;justify-content:center}.atrium-site .a-ticker__track>[aria-hidden]{display:none}}
`;
