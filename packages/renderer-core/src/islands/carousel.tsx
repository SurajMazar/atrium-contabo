'use client';

import { Children, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface CarouselProps {
  label: string;
  children: ReactNode;
  autoplay?: boolean;
  interval?: number;
  loop?: boolean;
  showArrows?: boolean;
  showDots?: boolean;
  /** Editor/preview-safe: never autoplay. */
  paused?: boolean;
  className?: string;
  /** Visual style of slides: full (1 per view), peek, cards (several per view). */
  layout?: 'full' | 'peek' | 'cards';
}

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
  </svg>
);

/** Scroll-snap carousel. Slides are server-rendered children; JS adds arrows, dots, autoplay and keyboard control. */
export function Carousel({ label, children, autoplay, interval = 6, loop = true, showArrows = true, showDots = true, paused, className, layout = 'peek' }: CarouselProps) {
  const track = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children);
  const count = slides.length;
  const [active, setActive] = useState(0);
  const hovering = useRef(false);

  const slideEls = () => Array.from(track.current?.children ?? []) as HTMLElement[];
  const goTo = useCallback((i: number) => {
    const el = track.current;
    const items = slideEls();
    if (!el || !items.length) return;
    const idx = loop ? (i + items.length) % items.length : Math.max(0, Math.min(items.length - 1, i));
    const target = items[idx]!;
    el.scrollTo({ left: target.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft, behavior: 'smooth' });
  }, [loop]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const win = el.ownerDocument.defaultView ?? window;
    const io = new win.IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index ?? 0));
      },
      { root: el, threshold: 0.6 },
    );
    slideEls().forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [count]);

  useEffect(() => {
    const el = track.current;
    if (!el || !autoplay || paused || count < 2) return;
    const win = el.ownerDocument.defaultView ?? window;
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = win.setInterval(() => {
      if (hovering.current || el.ownerDocument.hidden || el.contains(el.ownerDocument.activeElement)) return;
      goTo(active + 1);
    }, Math.max(2, interval) * 1000);
    return () => win.clearInterval(t);
  }, [autoplay, paused, interval, active, count, goTo]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(active + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(active - 1);
    }
  };

  return (
    <div
      className={['a-slider', `a-slider--${layout}`, className].filter(Boolean).join(' ')}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
    >
      <div ref={track} className="a-slider__track" tabIndex={0} onKeyDown={onKey} aria-live={autoplay && !paused ? 'off' : 'polite'}>
        {slides.map((s, i) => (
          <div key={i} className={`a-slider__slide${i === active ? ' is-active' : ''}`} data-index={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`}>
            {s}
          </div>
        ))}
      </div>
      {count > 1 && (showArrows || showDots) ? (
        <div className="a-slider__controls">
          {showDots ? (
            <div className="a-slider__dots" role="tablist" aria-label="Choose slide">
              {slides.map((_, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`Go to slide ${i + 1}`} className={`a-slider__dot${i === active ? ' is-active' : ''}`} onClick={() => goTo(i)} />
              ))}
            </div>
          ) : <span />}
          {showArrows ? (
            <div className="a-slider__arrows">
              <span className="a-slider__count" aria-hidden="true">{String(active + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
              <button type="button" className="a-slider__arrow" onClick={() => goTo(active - 1)} aria-label="Previous slide" disabled={!loop && active === 0}><Chevron dir="left" /></button>
              <button type="button" className="a-slider__arrow" onClick={() => goTo(active + 1)} aria-label="Next slide" disabled={!loop && active === count - 1}><Chevron dir="right" /></button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
