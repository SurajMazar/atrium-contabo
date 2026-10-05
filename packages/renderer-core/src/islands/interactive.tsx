'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

// ---------------------------------------------------------------- tabs

/** WAI-ARIA tabs with roving tabindex and arrow/Home/End keys. Panels are server-rendered. */
export function Tabs({ labels, panels, style = 'underline', align = 'left' }: { labels: string[]; panels: ReactNode[]; style?: string; align?: string }) {
  const base = useId().replace(/:/g, '');
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = labels.length;
    let next = active;
    if (e.key === 'ArrowRight') next = (active + 1) % n;
    else if (e.key === 'ArrowLeft') next = (active - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <div className={`a-tabs a-tabs--${style} a-tabs--${align}`}>
      <div className="a-tabs__list" role="tablist" onKeyDown={onKey}>
        {labels.map((l, i) => (
          <button
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-t${i}`}
            aria-selected={i === active}
            aria-controls={`${base}-p${i}`}
            tabIndex={i === active ? 0 : -1}
            className={`a-tabs__tab${i === active ? ' is-active' : ''}`}
            onClick={() => setActive(i)}
          >
            {l}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div key={i} role="tabpanel" id={`${base}-p${i}`} aria-labelledby={`${base}-t${i}`} hidden={i !== active} tabIndex={0} className="a-tabs__panel">
          {p}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- modal / drawer

export function Dialog({ triggerLabel, triggerClass, title, kind = 'modal', side = 'right', size = 'md', children }: { triggerLabel: string; triggerClass: string; title?: string; kind?: 'modal' | 'drawer'; side?: string; size?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId().replace(/:/g, '');
  const open = () => ref.current?.showModal();
  const close = () => ref.current?.close();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const html = d.ownerDocument.documentElement;
    const onClose = () => (html.style.overflow = '');
    d.addEventListener('close', onClose);
    return () => d.removeEventListener('close', onClose);
  }, []);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => { open(); ref.current!.ownerDocument.documentElement.style.overflow = 'hidden'; }} aria-haspopup="dialog">
        <span className="a-btn__label">{triggerLabel}</span>
      </button>
      <dialog ref={ref} className={`a-dialog a-dialog--${kind} a-dialog--${kind === 'drawer' ? side : size}`} aria-labelledby={title ? titleId : undefined} onClick={(e) => e.target === ref.current && close()}>
        <div className="a-dialog__panel">
          <div className="a-dialog__head">
            {title ? <h2 id={titleId} className="a-dialog__title">{title}</h2> : <span />}
            <button type="button" className="a-dialog__close" onClick={close} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="a-dialog__body">{children}</div>
        </div>
      </dialog>
    </>
  );
}

// ---------------------------------------------------------------- before / after

export function BeforeAfter({ before, after, beforeLabel, afterLabel, start = 50, aspect }: { before: ReactNode; after: ReactNode; beforeLabel: string; afterLabel: string; start?: number; aspect?: string }) {
  const [pos, setPos] = useState(start);
  const id = useId();
  return (
    <div className="a-ba" style={{ ['--pos' as string]: `${pos}%`, aspectRatio: aspect }}>
      <div className="a-ba__layer a-ba__after">{after}<span className="a-ba__label a-ba__label--after">{afterLabel}</span></div>
      <div className="a-ba__layer a-ba__before">{before}<span className="a-ba__label a-ba__label--before">{beforeLabel}</span></div>
      <div className="a-ba__handle" aria-hidden="true"><span /></div>
      <label htmlFor={id} className="a-sr">Comparison position</label>
      <input id={id} className="a-ba__range" type="range" min={0} max={100} step={1} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-valuetext={`${pos}% ${beforeLabel}`} />
    </div>
  );
}

// ---------------------------------------------------------------- rotating words

export function RotatingWords({ words, interval = 2.6, effect = 'slide', paused, italic }: { words: string[]; interval?: number; effect?: string; paused?: boolean; italic?: boolean }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || paused || words.length < 2) return;
    const win = el.ownerDocument.defaultView ?? window;
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = win.setInterval(() => setI((x) => (x + 1) % words.length), Math.max(1, interval) * 1000);
    return () => win.clearInterval(t);
  }, [words.length, interval, paused]);
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '');
  return (
    <span ref={ref} className={`a-rotator a-rotator--${effect}${italic ? ' a-rotator--italic' : ''}`} aria-hidden="true">
      <span className="a-rotator__sizer">{longest}</span>
      {words.map((w, idx) => (
        <span key={idx} className={`a-rotator__word${idx === i ? ' is-active' : ''}${idx === (i - 1 + words.length) % words.length ? ' is-leaving' : ''}`}>
          {effect === 'type' ? <span className="a-rotator__type" style={{ ['--chars' as string]: w.length }}>{w}</span> : w}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- video facade

export function VideoFacade({ embedUrl, title, poster, aspect, rounded }: { embedUrl: string; title: string; poster?: ReactNode; aspect?: string; rounded?: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={`a-video a-r-${rounded ?? 'sm'}`} style={{ aspectRatio: aspect }}>
      {playing ? (
        <iframe className="a-video__frame" src={embedUrl} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button type="button" className="a-video__facade" onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`}>
          {poster}
          <span className="a-video__play" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z" /></svg>
          </span>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sticky steps

/** Swaps the pinned media to match the step currently in view (IntersectionObserver). */
export function StickySteps({ media, steps }: { media: ReactNode[]; steps: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const win = el.ownerDocument.defaultView ?? window;
    const io = new win.IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step ?? 0));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    el.querySelectorAll('[data-step]').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [steps.length]);
  return (
    <div ref={ref} className="a-story__grid">
      <div className="a-story__media">
        <div className="a-story__stage">
          {media.map((m, i) => (
            <div key={i} className={`a-story__frame${i === active ? ' is-active' : ''}`} aria-hidden={i !== active}>{m}</div>
          ))}
        </div>
      </div>
      <ol className="a-story__steps">
        {steps.map((s, i) => (
          <li key={i} data-step={i} className={`a-story__step${i === active ? ' is-active' : ''}`}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
