import type { Animation, MotionIntensity } from '@atrium/schema';
import { PRESET_MAP, resolveParams, type GsapLike } from './presets';

export const ANIM_ATTR = 'data-a-anim';

/** Serialize an animation config onto an element attribute (used by renderers). */
export function animationAttrs(anim: Animation | undefined): Record<string, string> {
  if (!anim || !anim.preset || anim.preset === 'none') return {};
  return { [ANIM_ATTR]: JSON.stringify(anim) };
}

/**
 * Inline <head> script: marks the document as animation-capable so pending
 * elements start hidden (no flash), unless the user prefers reduced motion. Once GSAP is running
 * (`a-motion-ready`), elements that arrive later — the next page after a client-side navigation —
 * stay hidden until the runtime picks them up, instead of painting once and then animating in.
 * A failsafe reveals everything if the runtime never loads.
 */
export const ANIMATION_BOOT_SCRIPT = `(function(){try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){var d=document.documentElement;d.classList.add('a-anim');setTimeout(function(){d.classList.add('a-anim-ready')},3500)}}catch(e){}})();`;

export const ANIMATION_BASE_CSS = `html.a-anim:not(.a-anim-ready) [${ANIM_ATTR}]:not([data-a-anim-done]),html.a-anim.a-motion-ready [${ANIM_ATTR}]:not([data-a-anim-done]){visibility:hidden}.a-split-line{display:block;overflow:hidden}.a-split-word,.a-split-char{display:inline-block;will-change:transform}@media (prefers-reduced-motion: reduce){[${ANIM_ATTR}]{visibility:visible!important}}`;

function splitText(el: HTMLElement, mode: 'words' | 'chars' | 'lines'): Element[] {
  if (el.dataset.aSplit === mode) return Array.from(el.querySelectorAll(mode === 'chars' ? '.a-split-char' : mode === 'words' ? '.a-split-word' : '.a-split-line > span'));
  const text = el.textContent ?? '';
  el.setAttribute('aria-label', text);
  const words = text.split(/(\s+)/);
  el.textContent = '';
  const out: Element[] = [];
  const wordEls: HTMLElement[] = [];
  for (const w of words) {
    if (/^\s+$/.test(w)) {
      el.appendChild(document.createTextNode(' '));
      continue;
    }
    if (!w) continue;
    const span = document.createElement('span');
    span.className = 'a-split-word';
    span.setAttribute('aria-hidden', 'true');
    if (mode === 'chars') {
      for (const ch of w) {
        const c = document.createElement('span');
        c.className = 'a-split-char';
        c.textContent = ch;
        span.appendChild(c);
        out.push(c);
      }
    } else span.textContent = w;
    el.appendChild(span);
    wordEls.push(span);
    if (mode === 'words') out.push(span);
  }
  if (mode === 'lines') {
    // group words by their rendered offsetTop into masked lines
    const lines: HTMLElement[][] = [];
    let top: number | null = null;
    for (const w of wordEls) {
      if (top === null || Math.abs(w.offsetTop - top) > 2) {
        lines.push([]);
        top = w.offsetTop;
      }
      lines[lines.length - 1]!.push(w);
    }
    el.textContent = '';
    for (const line of lines) {
      const mask = document.createElement('span');
      mask.className = 'a-split-line';
      const inner = document.createElement('span');
      inner.style.display = 'inline-block';
      inner.textContent = line.map((w) => w.textContent).join(' ');
      mask.appendChild(inner);
      el.appendChild(mask);
      out.push(inner);
    }
  }
  el.dataset.aSplit = mode;
  return out;
}

export interface AnimationRuntimeOptions {
  gsap: GsapLike & { registerPlugin?(...p: unknown[]): void };
  ScrollTrigger?: { refresh(): void; getAll?(): Array<{ kill(): void }> };
  motion: { intensity: MotionIntensity; ease: string; duration: number };
  /** Force-disable (editor edit mode, reduced motion). */
  disabled?: boolean;
  /** Scroll container (editor canvas iframe uses its own window). */
  scroller?: Element | Window;
}

/** Initialize every `[data-a-anim]` element under root. Returns a cleanup function. */
export function initAnimations(root: ParentNode, opts: AnimationRuntimeOptions): () => void {
  const els = Array.from(root.querySelectorAll<HTMLElement>(`[${ANIM_ATTR}]`));
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const kills: Array<{ kill(): void }> = [];
  const markDone = (el: HTMLElement) => el.setAttribute('data-a-anim-done', '');
  if (opts.disabled || reduced || opts.motion.intensity === 'none') {
    els.forEach(markDone);
    return () => {};
  }
  for (const el of els) {
    let anim: Animation;
    try {
      anim = JSON.parse(el.getAttribute(ANIM_ATTR) ?? '');
    } catch {
      markDone(el);
      continue;
    }
    const preset = PRESET_MAP.get(anim.preset);
    const params = preset && resolveParams(anim, opts.motion);
    if (!preset || !params) {
      markDone(el);
      continue;
    }
    let targets: Element[] = [el];
    if (params.target === 'children') targets = Array.from(el.children);
    else if (params.target === 'words' || params.target === 'chars' || params.target === 'lines') {
      const textEl = el.querySelector<HTMLElement>('[data-a-text]') ?? el;
      targets = splitText(textEl, params.target);
    }
    const scrollTrigger =
      params.trigger === 'scroll'
        ? { trigger: el, start: params.start, end: params.end, scrub: params.scrub || undefined, toggleActions: params.once ? 'play none none none' : 'play none none reverse', scroller: opts.scroller }
        : undefined;
    markDone(el);
    try {
      const res = preset.build({ gsap: opts.gsap, el, targets, params, scrollTrigger });
      if (res) kills.push(res);
    } catch (err) {
      console.warn('[atrium] animation failed', anim.preset, err);
    }
  }
  opts.ScrollTrigger?.refresh();
  return () => kills.forEach((k) => k.kill());
}
