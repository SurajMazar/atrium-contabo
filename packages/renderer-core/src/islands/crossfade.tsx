'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Cycles `is-active` across children (server-rendered slides). Pauses when hidden, on reduced motion and in the editor. */
export function Crossfade({ interval = 6, paused, className, label, children }: { interval?: number; paused?: boolean; className?: string; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || paused) return;
    const win = el.ownerDocument.defaultView ?? window;
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const slides = Array.from(el.children) as HTMLElement[];
    if (slides.length < 2) return;
    let i = Math.max(0, slides.findIndex((s) => s.classList.contains('is-active')));
    let visible = true;
    const io = new win.IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; });
    io.observe(el);
    const t = win.setInterval(() => {
      if (!visible || el.ownerDocument.hidden) return;
      slides[i]?.classList.remove('is-active');
      i = (i + 1) % slides.length;
      slides[i]?.classList.add('is-active');
    }, Math.max(2, interval) * 1000);
    return () => {
      win.clearInterval(t);
      io.disconnect();
    };
  }, [interval, paused]);
  return (
    <div ref={ref} className={className} role="img" aria-label={label}>
      {children}
    </div>
  );
}
