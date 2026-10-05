'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Progressive enhancement for the server-rendered header: scroll state (solid after scroll,
 * hide on scroll down), dropdown toggles (click/Esc/outside), and the mobile drawer
 * (aria-expanded, focus trap, Esc, scroll lock). Uses the element's own document/window so it
 * works inside the editor iframe.
 */
export function HeaderBehavior({ hideOnScroll, editor }: { hideOnScroll?: boolean; editor?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const header = ref.current?.closest('header');
    if (!header) return;
    const doc = header.ownerDocument;
    const win = doc.defaultView ?? window;
    const toggle = header.querySelector<HTMLButtonElement>('[data-a-nav-toggle]');
    const drawer = header.querySelector<HTMLElement>('[data-a-nav-drawer]');
    const cleanups: Array<() => void> = [];
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn, opts);
      cleanups.push(() => el.removeEventListener(type, fn, opts));
    };

    // scroll state
    let lastY = win.scrollY;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = win.scrollY;
      header.classList.toggle('is-scrolled', y > 12);
      if (hideOnScroll && !header.classList.contains('is-open')) {
        header.classList.toggle('is-hidden', y > lastY && y > 160 && !header.contains(doc.activeElement));
      }
      lastY = y;
    };
    update();
    on(win, 'scroll', () => {
      if (!ticking) {
        ticking = true;
        win.requestAnimationFrame(update);
      }
    }, { passive: true });

    // dropdowns
    const closeAll = (except?: Element) => {
      header.querySelectorAll('.a-nav__item.is-open').forEach((li) => {
        if (li === except) return;
        li.classList.remove('is-open');
        li.querySelector('[data-a-sub-toggle]')?.setAttribute('aria-expanded', 'false');
      });
    };
    header.querySelectorAll<HTMLButtonElement>('[data-a-sub-toggle]').forEach((btn) => {
      on(btn, 'click', (e: MouseEvent) => {
        e.preventDefault();
        const li = btn.closest('.a-nav__item');
        if (!li) return;
        const open = !li.classList.contains('is-open');
        closeAll(li);
        li.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
    });
    on(doc, 'click', (e: MouseEvent) => {
      if (!(e.target instanceof win.Node) || !header.contains(e.target as Node)) closeAll();
    });

    // mobile drawer
    let lastFocus: HTMLElement | null = null;
    const setOpen = (open: boolean) => {
      if (!toggle || !drawer) return;
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      drawer.hidden = !open;
      if (!editor) doc.documentElement.style.overflow = open ? 'hidden' : '';
      if (open) {
        lastFocus = doc.activeElement as HTMLElement | null;
        win.requestAnimationFrame(() => drawer.querySelector<HTMLElement>(FOCUSABLE)?.focus());
      } else if (lastFocus) {
        (toggle ?? lastFocus).focus();
        lastFocus = null;
      }
    };
    if (toggle && drawer) {
      on(toggle, 'click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
      on(drawer, 'click', (e: MouseEvent) => {
        const a = (e.target as Element | null)?.closest?.('a[href]');
        if (a && !editor) setOpen(false);
      });
      on(doc, 'keydown', (e: KeyboardEvent) => {
        const open = header.classList.contains('is-open');
        if (e.key === 'Escape') {
          if (open) setOpen(false);
          else closeAll();
          return;
        }
        if (e.key !== 'Tab' || !open) return;
        const nodes = [toggle, ...Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE))].filter((n) => n.offsetParent !== null || n === toggle);
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && doc.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && doc.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
      const mq = win.matchMedia('(min-width: 992px)');
      const onMq = () => {
        if (mq.matches && !header.classList.contains('a-header--minimal')) setOpen(false);
      };
      mq.addEventListener?.('change', onMq);
      cleanups.push(() => mq.removeEventListener?.('change', onMq));
    } else {
      on(doc, 'keydown', (e: KeyboardEvent) => e.key === 'Escape' && closeAll());
    }
    header.classList.add('is-enhanced');
    return () => {
      cleanups.forEach((c) => c());
      doc.documentElement.style.overflow = '';
    };
  }, [hideOnScroll, editor]);
  return <span ref={ref} hidden />;
}
