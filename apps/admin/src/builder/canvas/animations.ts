'use client';

import { pagePath, type Animation, type ThemeTokens } from '@atrium/schema';
import { useEffect } from 'react';
import { getNode } from '../actions';
import { bumpCanvasEpoch, useDocumentStore } from '../store/document';
import { useViewportStore } from '../store/ui';
import { nodeElement, useCanvasDom } from './dom';

type Gsap = typeof import('gsap').gsap;
let loaded: Promise<{ gsap: Gsap; ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger; initAnimations: typeof import('@atrium/animations').initAnimations }> | null = null;

/** gsap + ScrollTrigger are loaded on demand — never in the initial editor bundle. */
function loadRuntime() {
  loaded ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('@atrium/animations')]).then(([g, st, a]) => {
    g.gsap.registerPlugin(st.ScrollTrigger);
    return { gsap: g.gsap, ScrollTrigger: st.ScrollTrigger, initAnimations: a.initAnimations };
  });
  return loaded;
}

function motionFor(theme: ThemeTokens) {
  const m = theme.motion;
  return { ...m, intensity: m.intensity === 'none' ? ('moderate' as const) : m.intensity };
}

/** Run one node's animation in the canvas (Motion tab "Play preview"). */
export async function playNodeAnimation(nodeId: string, override?: Animation) {
  const node = getNode(nodeId);
  const anim = override ?? node?.animation;
  const el = nodeElement(nodeId);
  const theme = useDocumentStore.getState().definition?.theme;
  if (!anim || !el || !theme) return;
  const { gsap, initAnimations } = await loadRuntime();
  const previous = el.getAttribute('data-a-anim');
  // Preview always plays immediately, regardless of the configured trigger.
  el.setAttribute('data-a-anim', JSON.stringify({ ...anim, trigger: 'load', scrub: false, start: undefined, end: undefined }));
  el.removeAttribute('data-a-anim-done');
  const root = { querySelectorAll: () => [el] } as unknown as ParentNode;
  const cleanup = initAnimations(root, { gsap: gsap as never, motion: motionFor(theme) });
  const total = ((anim.duration ?? 1.2) + (anim.delay ?? 0)) * 1000 + (anim.stagger ?? 0.1) * 2000 + 600;
  window.setTimeout(() => {
    cleanup();
    if (previous === null) el.removeAttribute('data-a-anim');
    else el.setAttribute('data-a-anim', previous);
    el.removeAttribute('data-a-anim-done');
    // Text presets split DOM that React owns — remount to restore it.
    if (anim.target === 'words' || anim.target === 'chars' || anim.target === 'lines' || ['text-reveal', 'word-reveal', 'character-reveal'].includes(anim.preset)) bumpCanvasEpoch();
  }, Math.min(8000, total));
}

/**
 * Site scripts for the live preview: only `necessary` ones (site UI), never analytics or marketing.
 * Scripts see the page path on `<html data-atrium-path>`: the canvas document itself is about:srcdoc.
 */
function injectSiteScripts(doc: Document) {
  const def = useDocumentStore.getState().definition;
  const page = def?.pages.find((p) => p.id === useDocumentStore.getState().pageId) ?? def?.pages[0];
  if (!def || !page) return;
  doc.documentElement.setAttribute('data-atrium-path', page.isHomepage ? '/' : pagePath(page.slug));
  for (const s of def.settings.scripts) {
    if (s.enabled === false || s.consentCategory !== 'necessary' || !(s.code || s.src)) continue;
    if (doc.querySelector(`script[data-atrium-script="${s.id}"]`)) continue;
    const el = doc.createElement('script');
    el.dataset.atriumScript = s.id;
    if (s.src) {
      el.src = s.src;
      el.async = s.async ?? true;
    } else el.text = s.code ?? '';
    (s.placement === 'head' ? doc.head : doc.body).appendChild(el);
  }
}

/**
 * "Live preview" toggle: show the page as it is published. Runs the page's animations and the site's
 * necessary scripts in the canvas; turning it off replaces the canvas document so editing starts clean.
 */
export function usePlayAnimations() {
  const play = useViewportStore((s) => s.playAnimations);
  const pageId = useDocumentStore((s) => s.pageId);
  const epoch = useDocumentStore((s) => s.canvasEpoch);
  const doc = useCanvasDom((s) => s.doc);
  const win = useCanvasDom((s) => s.win);

  useEffect(() => {
    if (!play || !doc || !win) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const theme = useDocumentStore.getState().definition?.theme;
      if (!theme) return;
      injectSiteScripts(doc);
      // Motion "Off" means the published site runs no presets; the preview matches it.
      if (theme.motion.intensity === 'none') return;
      const { gsap, ScrollTrigger, initAnimations } = await loadRuntime();
      if (cancelled) return;
      doc.querySelectorAll('[data-a-anim-done]').forEach((e) => e.removeAttribute('data-a-anim-done'));
      try {
        cleanup = initAnimations(doc, { gsap: gsap as never, ScrollTrigger, motion: motionFor(theme), scroller: doc.scrollingElement ?? undefined });
      } catch (err) {
        console.warn('[builder] animation playback failed', err);
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      cleanup?.();
    };
  }, [play, doc, win, pageId, epoch]);

  // Turning the preview off restores the untouched DOM in a fresh document.
  useEffect(() => {
    if (!play) return;
    return () => {
      useViewportStore.setState((s) => ({ frameKey: s.frameKey + 1 }));
      bumpCanvasEpoch();
    };
  }, [play]);
}
