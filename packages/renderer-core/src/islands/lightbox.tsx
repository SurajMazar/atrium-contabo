'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface LightboxImage {
  src: string;
  srcSet?: string;
  alt: string;
  caption?: string;
}

/**
 * Accessible lightbox for a server-rendered gallery: clicks on `[data-lightbox-index]` open a
 * native <dialog> (focus trap + Esc built in) with prev/next and arrow-key navigation.
 */
export function Lightbox({ images, children, label = 'Image viewer', disabled }: { images: LightboxImage[]; children: ReactNode; label?: string; disabled?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);

  const open = useCallback((i: number) => {
    setIndex(i);
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  const close = useCallback(() => dialog.current?.close(), []);
  const step = useCallback((delta: number) => setIndex((i) => (i === null ? i : (i + delta + images.length) % images.length)), [images.length]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || disabled) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('[data-lightbox-index]') as HTMLElement | null;
      if (!a || !el.contains(a) || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      open(Number(a.dataset.lightboxIndex ?? 0));
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [open, disabled]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    const onClose = () => setIndex(null);
    d.addEventListener('keydown', onKey);
    d.addEventListener('close', onClose);
    return () => {
      d.removeEventListener('keydown', onKey);
      d.removeEventListener('close', onClose);
    };
  }, [step]);

  const img = index === null ? null : images[index];
  return (
    <div ref={wrap} className="a-lightbox-scope">
      {children}
      <dialog ref={dialog} className="a-lightbox" aria-label={label} onClick={(e) => e.target === dialog.current && close()}>
        {img ? (
          <figure className="a-lightbox__figure">
            <img src={img.src} srcSet={img.srcSet} sizes="100vw" alt={img.alt} className="a-lightbox__img" />
            <figcaption className="a-lightbox__caption">
              <span>{img.caption ?? img.alt}</span>
              <span className="a-lightbox__count">{(index ?? 0) + 1} / {images.length}</span>
            </figcaption>
          </figure>
        ) : null}
        <button type="button" className="a-lightbox__btn a-lightbox__close" onClick={close} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        {images.length > 1 ? (
          <>
            <button type="button" className="a-lightbox__btn a-lightbox__prev" onClick={() => step(-1)} aria-label="Previous image">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button type="button" className="a-lightbox__btn a-lightbox__next" onClick={() => step(1)} aria-label="Next image">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </>
        ) : null}
      </dialog>
    </div>
  );
}
