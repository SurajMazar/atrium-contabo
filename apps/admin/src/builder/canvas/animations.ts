'use client';

import type { Animation, ThemeTokens } from '@atrium/schema';
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

/** "Play animations" toggle: run every animation on the page inside the canvas. */
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

  // Turning playback off restores the untouched DOM.
  useEffect(() => {
    if (!play) return;
    return () => bumpCanvasEpoch();
  }, [play]);
}
