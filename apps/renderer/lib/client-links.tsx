'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const FILE_EXT = /\.(xml|txt|pdf|zip|jpe?g|png|webp|avif|gif|svg|ico|mp4|webm|mp3|ics|json|csv|docx?|xlsx?)$/i;

/**
 * SPA-style navigation for server-rendered sites. Components render plain <a>
 * tags (renderer-core is framework-agnostic and also runs in the editor canvas),
 * so this island upgrades same-origin link clicks to Next.js client navigation
 * and prefetches routes on hover/focus/touch and for header links when idle.
 * Pages stay fully server-rendered HTML for SEO; only navigation is client-side.
 * Opt out per link with `data-reload` or for a subtree with `data-a-no-spa`.
 */
export function ClientLinks() {
  const router = useRouter();

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

    const prefetch = (href: string) => {
      const key = href.split('#')[0]!;
      if (prefetched.has(key) || key === `${window.location.pathname}${window.location.search}`) return;
      prefetched.add(key);
      router.prefetch(key);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = internalHref(anchorOf(e.target));
      if (!href) return;
      const url = new URL(href, window.location.href);
      // Same-page anchors: let the browser handle smooth scrolling.
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      e.preventDefault();
      router.push(href);
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
    const handle = ric(() => {
      document.querySelectorAll<HTMLAnchorElement>('header a[href], nav a[href]').forEach((a) => {
        const href = internalHref(a);
        if (href) prefetch(href);
      });
    });

    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('mouseover', onIntent);
      document.removeEventListener('focusin', onIntent);
      document.removeEventListener('touchstart', onIntent);
      (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle as number);
    };
  }, [router]);

  return null;
}
