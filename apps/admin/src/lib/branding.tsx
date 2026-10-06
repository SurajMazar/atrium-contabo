'use client';

import { DEFAULT_ADMIN_BRANDING, mergeBranding, type AdminBranding } from '@atrium/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApi } from './api';
import { BRANDING_CACHE_KEY, DEFAULT_PRODUCT_NAME, toCache, type BrandingCache } from './branding-core';
import { useSession } from './session';
import { useTheme, type ThemePreference } from './theme';

export const brandingQueryKey = (orgId: string | null | undefined, websiteId?: string | null) => ['branding', orgId ?? 'platform', websiteId ?? 'org'] as const;

/** `/w/<id>/…` (dashboard and editor) → the website whose branding applies. */
function websiteFromPath(pathname: string | null): string | null {
  const m = /^\/w\/([^/]+)/.exec(pathname ?? '');
  return m && m[1] !== 'new' ? decodeURIComponent(m[1]!) : null;
}

interface BrandingValue {
  /** Platform defaults ← organization overrides, with built-in defaults filled in. */
  branding: AdminBranding;
  productName: string;
  /** Logo URL for the current theme (dark variant falls back to the light one). */
  logoUrl: string | null;
  isLoading: boolean;
}

const BrandingContext = createContext<BrandingValue | null>(null);

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readCache(): AdminBranding | null {
  if (typeof window === 'undefined') return null;
  try {
    const c = JSON.parse(window.localStorage.getItem(BRANDING_CACHE_KEY) ?? 'null') as BrandingCache | null;
    return c?.b ?? null;
  } catch {
    return null;
  }
}

function writeCache(b: AdminBranding) {
  try {
    window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(toCache(b)));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Apply branding to <html>: accent CSS, radius + density attributes, favicon. */
function applyToDocument(b: AdminBranding) {
  const root = document.documentElement;
  const cache = toCache(b);
  let style = document.getElementById('atrium-branding') as HTMLStyleElement | null;
  if (cache.css) {
    if (!style) {
      style = document.createElement('style');
      style.id = 'atrium-branding';
      document.head.appendChild(style);
    }
    if (style.textContent !== cache.css) style.textContent = cache.css;
  } else style?.remove();
  if (cache.radius) root.dataset.radius = cache.radius;
  else delete root.dataset.radius;
  if (cache.density) root.dataset.density = cache.density;
  else delete root.dataset.density;

  const branded = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"][data-brand]');
  const defaults = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]:not([data-brand])');
  if (cache.icon) {
    let link = branded[0];
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.dataset.brand = '1';
      document.head.appendChild(link);
    }
    if (link.href !== cache.icon) link.href = cache.icon;
    branded.forEach((l, i) => i > 0 && l.remove());
    // Browsers pick the last matching icon; move the brand icon last and park the defaults.
    document.head.appendChild(link);
    defaults.forEach((l) => l.setAttribute('media', 'not all'));
  } else {
    branded.forEach((l) => l.remove());
    defaults.forEach((l) => l.getAttribute('media') === 'not all' && l.removeAttribute('media'));
  }
}

/** Keep `… · Atrium` page titles in step with the product name. */
function useDocumentTitle(productName: string) {
  const name = useRef(productName);
  name.current = productName;
  useEffect(() => {
    const fix = () => {
      const t = document.title;
      const n = name.current;
      if (n === DEFAULT_PRODUCT_NAME) return;
      const next = t === DEFAULT_PRODUCT_NAME ? n : t.endsWith(` · ${DEFAULT_PRODUCT_NAME}`) ? `${t.slice(0, -DEFAULT_PRODUCT_NAME.length)}${n}` : t;
      if (next !== t) document.title = next;
    };
    fix();
    const head = document.querySelector('head');
    if (!head) return;
    const mo = new MutationObserver(fix);
    mo.observe(head, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [productName]);
}

/**
 * Loads white-label branding (platform defaults before sign-in; platform ←
 * current organization after) and applies it live. The last resolved value is
 * cached so the inline head script can apply it before hydration.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { currentOrg, status, scopedWebsiteIds } = useSession();
  const pathname = usePathname();
  const { resolved: theme, setDefaultTheme } = useTheme();
  const orgId = status === 'authenticated' ? (currentOrg?.id ?? null) : null;
  // Inside a website its own dashboard branding applies; someone who only manages one website sees
  // that website's branding everywhere (account pages included).
  const websiteId = status === 'authenticated' ? (websiteFromPath(pathname) ?? (scopedWebsiteIds.length === 1 ? scopedWebsiteIds[0]! : null)) : null;
  // The cache is read after mount (before paint) so server and client markup match.
  const [cached, setCached] = useState<AdminBranding | null>(null);
  useIsoLayoutEffect(() => setCached(readCache()), []);

  const q = useQuery({
    queryKey: brandingQueryKey(orgId, websiteId),
    queryFn: () => api.branding.get(orgId ?? undefined, websiteId ?? undefined),
    // Don't fetch the platform-only branding while the session is still booting.
    enabled: status !== 'loading',
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const branding = useMemo<AdminBranding>(() => q.data?.resolved ?? cached ?? mergeBranding(), [q.data, cached]);

  const known = !!q.data || !!cached;
  useIsoLayoutEffect(() => {
    // Until something is known, keep whatever the pre-paint script applied.
    if (known) applyToDocument(branding);
  }, [branding, known]);

  useEffect(() => {
    if (q.data?.resolved) writeCache(q.data.resolved);
  }, [q.data]);

  useEffect(() => {
    setDefaultTheme((branding.defaultTheme ?? DEFAULT_ADMIN_BRANDING.defaultTheme) as ThemePreference);
  }, [branding.defaultTheme, setDefaultTheme]);

  const productName = branding.productName || DEFAULT_PRODUCT_NAME;
  useDocumentTitle(productName);

  const value = useMemo<BrandingValue>(
    () => ({
      branding,
      productName,
      logoUrl: (theme === 'dark' ? branding.logoDarkUrl || branding.logoUrl : branding.logoUrl) || null,
      isLoading: q.isPending && !cached,
    }),
    [branding, productName, theme, q.isPending, cached],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>');
  return ctx;
}
