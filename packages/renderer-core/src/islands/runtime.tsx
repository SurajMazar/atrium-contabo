'use client';

import { initAnimations } from '@atrium/animations';
import { safeHref, type ScriptDefinition, type SiteSettings, type ThemeTokens } from '@atrium/schema';
import { useCallback, useEffect, useRef, useState } from 'react';

type Category = 'necessary' | 'analytics' | 'marketing' | 'preferences';
type Consent = Record<Category, boolean> & { ts?: number };

const STORAGE_KEY = 'atrium-consent:v1';

export interface SiteRuntimeProps {
  motion: ThemeTokens['motion'];
  mode: 'live' | 'preview' | 'editor';
  websiteId?: string;
  apiBaseUrl?: string;
  analytics: boolean;
  consent: SiteSettings['cookieConsent'];
  scripts: ScriptDefinition[];
  playAnimations?: boolean;
  scroller?: Element | null;
  /** Change to re-run animations/analytics (client-side route changes, editor updates). */
  routeKey?: string;
}

function readConsent(win: Window): Consent | null {
  try {
    const raw = win.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

function writeConsent(win: Window, c: Consent) {
  try {
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...c, ts: Date.now() }));
  } catch {
    /* storage unavailable */
  }
  win.dispatchEvent(new CustomEvent('atrium:consent', { detail: c }));
}

function injectScript(doc: Document, s: ScriptDefinition) {
  if (doc.querySelector(`script[data-atrium-script="${s.id}"]`)) return;
  const el = doc.createElement('script');
  el.dataset.atriumScript = s.id;
  if (s.src) {
    el.src = s.src;
    el.async = s.async ?? true;
    if (s.defer) el.defer = true;
  } else el.text = s.code ?? '';
  const target = s.placement === 'head' ? doc.head : doc.body;
  if (s.placement === 'body-start') target.insertBefore(el, target.firstChild);
  else target.appendChild(el);
}

/**
 * Client runtime mounted once per page: GSAP animations (lazy-loaded only when the page has
 * `[data-a-anim]`), privacy-friendly analytics beacon, cookie consent banner and
 * consent-gated scripts.
 */
export function SiteRuntime({ motion, mode, websiteId, apiBaseUrl, analytics, consent, scripts, playAnimations, scroller, routeKey }: SiteRuntimeProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [granted, setGranted] = useState<Consent | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const categories = (consent?.categories ?? ['necessary', 'analytics', 'marketing']) as Category[];
  const consentOn = !!consent?.enabled && mode !== 'editor';

  // ---- animations
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!doc) return;
    const html = doc.documentElement;
    if (!doc.querySelector('[data-a-anim]')) {
      html.classList.add('a-anim-ready');
      return;
    }
    const disabled = mode === 'editor' && !playAnimations;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        html.classList.add('a-motion-ready');
        cleanup = initAnimations(doc, { gsap: gsap as never, ScrollTrigger: ScrollTrigger as never, motion, disabled, scroller: scroller ?? undefined });
      } catch (err) {
        console.warn('[atrium] animations unavailable', err);
      } finally {
        html.classList.add('a-anim-ready');
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [motion, mode, playAnimations, scroller, routeKey]);

  // ---- consent state
  useEffect(() => {
    const win = ref.current?.ownerDocument.defaultView;
    if (!win) return;
    if (!consentOn) {
      setGranted({ necessary: true, analytics: true, marketing: true, preferences: true });
      return;
    }
    const stored = readConsent(win);
    setGranted(stored);
    if (!stored) setBannerOpen(true);
    const open = (e: Event) => {
      const t = (e.target as Element | null)?.closest?.('[data-a-consent-open]');
      if (!t) return;
      e.preventDefault();
      setCustomize(true);
      setBannerOpen(true);
    };
    win.document.addEventListener('click', open);
    (win as unknown as { atriumConsent: unknown }).atriumConsent = { get: () => readConsent(win), open: () => { setCustomize(true); setBannerOpen(true); } };
    return () => win.document.removeEventListener('click', open);
  }, [consentOn]);

  // ---- gated scripts
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!doc || !granted || mode === 'editor') return;
    for (const s of scripts) if (s.enabled !== false && granted[s.consentCategory as Category]) injectScript(doc, s);
  }, [granted, scripts, mode]);

  // ---- analytics beacon
  useEffect(() => {
    const win = ref.current?.ownerDocument.defaultView;
    if (!win || !analytics || !websiteId || !apiBaseUrl || mode !== 'live' || !granted) return;
    const nav = win.navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return;
    if (consentOn && !granted.analytics) return;
    const send = () => {
      const body = JSON.stringify({
        websiteId,
        type: 'pageview',
        path: win.location.pathname.slice(0, 500),
        referrer: win.document.referrer ? win.document.referrer.slice(0, 500) : undefined,
        props: { title: win.document.title.slice(0, 200), locale: win.document.documentElement.lang || undefined, vw: win.innerWidth },
      });
      fetch(`${apiBaseUrl}/public/analytics/collect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => undefined);
    };
    send();
    win.addEventListener('popstate', send);
    return () => win.removeEventListener('popstate', send);
  }, [analytics, websiteId, apiBaseUrl, mode, granted, consentOn, routeKey]);

  const decide = useCallback((c: Partial<Consent>) => {
    const win = ref.current?.ownerDocument.defaultView;
    const full: Consent = { necessary: true, analytics: false, marketing: false, preferences: false, ...c };
    if (win) writeConsent(win, full);
    setGranted(full);
    setBannerOpen(false);
    setCustomize(false);
  }, []);

  return (
    <>
      <span ref={ref} hidden />
      {consentOn && bannerOpen ? (
        <ConsentBanner consent={consent} categories={categories} customize={customize} setCustomize={setCustomize} current={granted} onDecide={decide} />
      ) : null}
    </>
  );
}

const LABELS: Record<Category, [string, string]> = {
  necessary: ['Essential', 'Required for the site to work. Always on.'],
  analytics: ['Analytics', 'Helps us understand how the site is used.'],
  marketing: ['Marketing', 'Used to measure campaigns and personalise ads.'],
  preferences: ['Preferences', 'Remembers choices such as language.'],
};

function ConsentBanner({ consent, categories, customize, setCustomize, current, onDecide }: { consent: SiteSettings['cookieConsent']; categories: Category[]; customize: boolean; setCustomize: (v: boolean) => void; current: Consent | null; onDecide: (c: Partial<Consent>) => void }) {
  const [sel, setSel] = useState<Partial<Consent>>(() => current ?? {});
  const all = Object.fromEntries(categories.map((c) => [c, true])) as Partial<Consent>;
  return (
    <div className={`a-consent a-consent--${consent.position ?? 'bottom-left'}`} role="dialog" aria-modal="false" aria-labelledby="a-consent-title" aria-describedby="a-consent-msg">
      <p id="a-consent-title" className="a-consent__title">{consent.title}</p>
      <p id="a-consent-msg" className="a-consent__msg">
        {consent.message}{' '}
        {safeHref(consent.policyUrl) ? <a href={safeHref(consent.policyUrl)} className="a-link">Learn more</a> : null}
      </p>
      {customize ? (
        <ul className="a-consent__cats">
          {categories.map((c) => (
            <li key={c}>
              <label className="a-choice">
                <input type="checkbox" checked={c === 'necessary' ? true : !!sel[c]} disabled={c === 'necessary'} onChange={(e) => setSel((s) => ({ ...s, [c]: e.target.checked }))} />
                <span><strong>{LABELS[c][0]}</strong> — {LABELS[c][1]}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="a-consent__actions">
        {customize ? (
          <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={() => onDecide(sel)}>Save choices</button>
        ) : (
          <>
            <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={() => onDecide(all)}>Accept all</button>
            <button type="button" className="a-btn a-btn--outline a-btn--sm" onClick={() => onDecide({})}>Essential only</button>
            <button type="button" className="a-btn a-btn--link a-btn--sm" onClick={() => setCustomize(true)}>Customise</button>
          </>
        )}
      </div>
    </div>
  );
}

