'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';

const FILE_EXT = /\.(xml|txt|pdf|zip|jpe?g|png|webp|avif|gif|svg|ico|mp4|webm|mp3|ics|json|csv|docx?|xlsx?)$/i;
/** The bar only appears when the next page takes longer than this (fast navigations stay calm). */
const SHOW_BAR_AFTER_MS = 120;
/** A navigation still pending after this falls back to a normal page load. */
const HARD_NAVIGATION_AFTER_MS = 12_000;

const CSS = `
#a-navbar{position:fixed;inset:0 0 auto 0;z-index:2147483646;height:3px;pointer-events:none;opacity:0;transition:opacity .2s ease .1s}
#a-navbar.is-on{opacity:1;transition-delay:0s}
#a-navbar>span{display:block;height:100%;transform-origin:0 50%;transform:scaleX(0);background:var(--a-color-primary,currentColor);box-shadow:0 0 8px var(--a-color-primary,currentColor)}
#a-navbar.is-on>span{transform:scaleX(.85);transition:transform 8s cubic-bezier(.08,.82,.17,1)}
#a-navbar.is-done>span{transform:scaleX(1);transition:transform .18s ease-out}
html[data-a-navigating],html[data-a-navigating] *{cursor:progress}
[data-a-nav-pending]{opacity:.65;transition:opacity .12s}
@media (prefers-reduced-motion:reduce){#a-navbar.is-on>span{transform:scaleX(1);transition:none;opacity:.6}}
`;

/**
 * The loading bar lives outside React: this component is re-created with every page, and the bar
 * has to carry on across that and finish with a sweep once the new page is in.
 */
let barTimer = 0;
function barEl(): HTMLElement {
  let el = document.getElementById('a-navbar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'a-navbar';
    el.className = 'a-navbar';
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-label', 'Loading page');
    el.setAttribute('aria-hidden', 'true');
    el.appendChild(document.createElement('span'));
    document.body.appendChild(el);
  }
  return el;
}
function startBar() {
  window.clearTimeout(barTimer);
  barTimer = window.setTimeout(() => {
    const el = barEl();
    el.classList.remove('is-done');
    el.classList.add('is-on');
    el.setAttribute('aria-hidden', 'false');
  }, SHOW_BAR_AFTER_MS);
}
function finishBar() {
  window.clearTimeout(barTimer);
  const el = document.getElementById('a-navbar');
  if (!el || !el.classList.contains('is-on')) return;
  el.classList.add('is-done');
  barTimer = window.setTimeout(() => {
    el.classList.remove('is-on', 'is-done');
    el.setAttribute('aria-hidden', 'true');
  }, 260);
}
function clearPendingFeedback() {
  document.documentElement.removeAttribute('data-a-navigating');
  document.body.removeAttribute('aria-busy');
  document.querySelectorAll('[data-a-nav-pending]').forEach((el) => el.removeAttribute('data-a-nav-pending'));
}

/**
 * SPA-style navigation for server-rendered sites. Components render plain <a>
 * tags (renderer-core is framework-agnostic and also runs in the editor canvas),
 * so this island upgrades same-origin link clicks to Next.js client navigation.
 * Pages stay fully server-rendered HTML for SEO; only navigation is client-side.
 * Opt out per link with `data-reload` or for a subtree with `data-a-no-spa`.
 *
 * Feedback while the next page loads: the clicked link dims and the cursor shows progress at once;
 * a slim bar in the site's primary colour appears if loading takes a moment (`progressBar`).
 *
 * `cachePages` (website settings → Page loading): routes are preloaded on hover/focus/touch and for
 * header links when idle, and every visited or preloaded page stays in the browser's router cache
 * until the visitor reloads (next.config `staleTimes.static`). Off: nothing is preloaded, so each
 * click fetches the latest page from the server.
 */
export function ClientLinks({ cachePages = true, progressBar = true }: { cachePages?: boolean; progressBar?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pendingHref = useRef<string | null>(null);

  // The new page is in (this instance mounted with it) or the navigation settled: clear the feedback.
  useEffect(() => {
    if (isPending) return;
    clearPendingFeedback();
    finishBar();
    pendingHref.current = null;
  }, [isPending]);

  // A navigation that never settles (offline, server down) becomes a normal page load.
  useEffect(() => {
    if (!isPending) return;
    const t = window.setTimeout(() => {
      if (pendingHref.current) window.location.assign(pendingHref.current);
    }, HARD_NAVIGATION_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [isPending]);

  useEffect(() => {
    const prefetched = new Set<string>();

    const internalHref = (a: HTMLAnchorElement | null): string | null => {
      if (!a || !a.getAttribute('href')) return null;
      if (a.target && a.target !== '_self') return null;
      if (a.hasAttribute('download') || a.hasAttribute('data-reload') || a.closest('[data-a-no-spa]')) return null;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return null;
      }
      if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return null;
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/atrium-assets/') || FILE_EXT.test(url.pathname)) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    };

    const anchorOf = (t: EventTarget | null) => ((t as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null) ?? null;

    // `full`: the whole page payload, cached for `staleTimes.static` (dynamic routes otherwise
    // only prefetch their loading boundary and refetch on every visit).
    const prefetch = (href: string, includeCurrent = false) => {
      if (!cachePages) return;
      const key = href.split('#')[0]!;
      if (prefetched.has(key) || (!includeCurrent && key === `${window.location.pathname}${window.location.search}`)) return;
      prefetched.add(key);
      router.prefetch(key, { kind: 'full' as never });
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = anchorOf(e.target);
      const href = internalHref(a);
      if (!href) return;
      const url = new URL(href, window.location.href);
      // Same-page anchors: let the browser handle smooth scrolling.
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      e.preventDefault();
      // Immediate feedback, before the server has answered.
      clearPendingFeedback();
      pendingHref.current = href;
      a?.setAttribute('data-a-nav-pending', '');
      document.documentElement.setAttribute('data-a-navigating', '');
      document.body.setAttribute('aria-busy', 'true');
      if (progressBar) startBar();
      // With caching on, the visited page is fetched as a full prefetch so it stays cached too.
      prefetch(href);
      startTransition(() => router.push(href));
    };
    const onIntent = (e: Event) => {
      const href = internalHref(anchorOf(e.target));
      if (href) prefetch(href);
    };

    document.addEventListener('click', onClick);
    document.addEventListener('mouseover', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);
    document.addEventListener('touchstart', onIntent, { passive: true });

    // Warm the routes visitors are most likely to open next.
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const handle = cachePages
      ? ric(() => {
          // The page loaded first came as HTML, not from the router cache: keep it too.
          prefetch(`${window.location.pathname}${window.location.search}`, true);
          document.querySelectorAll<HTMLAnchorElement>('header a[href], nav a[href]').forEach((a) => {
            const href = internalHref(a);
            if (href) prefetch(href);
          });
        })
      : undefined;

    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('mouseover', onIntent);
      document.removeEventListener('focusin', onIntent);
      document.removeEventListener('touchstart', onIntent);
      if (handle !== undefined) (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle as number);
    };
  }, [router, cachePages, progressBar]);

  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
