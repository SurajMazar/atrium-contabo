import type { Animation, MotionIntensity } from '@atrium/schema';

export type AnimationCategory = 'entrance' | 'text' | 'media' | 'scroll' | 'layout';

/** Minimal structural types so this package does not import gsap at runtime. */
export interface GsapLike {
  from(targets: unknown, vars: Record<string, unknown>): { kill(): void; scrollTrigger?: { kill(): void } };
  fromTo(targets: unknown, from: Record<string, unknown>, to: Record<string, unknown>): { kill(): void };
  to(targets: unknown, vars: Record<string, unknown>): { kill(): void };
  set(targets: unknown, vars: Record<string, unknown>): void;
  timeline(vars?: Record<string, unknown>): {
    from(t: unknown, v: Record<string, unknown>, pos?: number | string): unknown;
    to(t: unknown, v: Record<string, unknown>, pos?: number | string): unknown;
    fromTo(t: unknown, f: Record<string, unknown>, v: Record<string, unknown>, pos?: number | string): unknown;
    kill(): void;
  };
}

export interface ResolvedAnimationParams {
  duration: number;
  delay: number;
  ease: string;
  distance: number;
  stagger: number;
  start: string;
  end: string;
  scrub: boolean | number;
  trigger: 'load' | 'scroll' | 'hover';
  once: boolean;
  target: NonNullable<Animation['target']>;
}

export interface BuildContext {
  gsap: GsapLike;
  el: HTMLElement;
  targets: Element[];
  params: ResolvedAnimationParams;
  /** ScrollTrigger config to merge into tweens when trigger === 'scroll'. */
  scrollTrigger?: Record<string, unknown>;
}

export interface AnimationPreset {
  id: string;
  name: string;
  description: string;
  category: AnimationCategory;
  /** Guidance for AI agents choosing animations. */
  bestFor: string[];
  defaults: Partial<ResolvedAnimationParams>;
  build(ctx: BuildContext): { kill(): void } | void;
}

const entrance = (vars: (p: ResolvedAnimationParams) => Record<string, unknown>) =>
  ({ gsap, targets, params, scrollTrigger }: BuildContext) =>
    gsap.from(targets, {
      ...vars(params),
      duration: params.duration,
      delay: params.delay,
      ease: params.ease,
      stagger: targets.length > 1 ? params.stagger : 0,
      ...(scrollTrigger ? { scrollTrigger } : {}),
      clearProps: 'transform,filter,clipPath',
    });

export const ANIMATION_PRESETS: AnimationPreset[] = [
  { id: 'fade', name: 'Fade', description: 'Simple opacity fade', category: 'entrance', bestFor: ['any content', 'minimal sites'], defaults: { duration: 0.8 }, build: entrance(() => ({ opacity: 0 })) },
  { id: 'fade-up', name: 'Fade up', description: 'Fade in while rising slightly', category: 'entrance', bestFor: ['headings', 'cards', 'paragraphs'], defaults: { distance: 32 }, build: entrance((p) => ({ opacity: 0, y: p.distance })) },
  { id: 'fade-down', name: 'Fade down', description: 'Fade in while dropping slightly', category: 'entrance', bestFor: ['navigation', 'badges'], defaults: { distance: 24 }, build: entrance((p) => ({ opacity: 0, y: -p.distance })) },
  { id: 'slide-left', name: 'Slide from right', description: 'Slide in toward the left', category: 'entrance', bestFor: ['split layouts', 'images'], defaults: { distance: 60 }, build: entrance((p) => ({ opacity: 0, x: p.distance })) },
  { id: 'slide-right', name: 'Slide from left', description: 'Slide in toward the right', category: 'entrance', bestFor: ['split layouts', 'text columns'], defaults: { distance: 60 }, build: entrance((p) => ({ opacity: 0, x: -p.distance })) },
  { id: 'scale-in', name: 'Scale in', description: 'Grow subtly from 94%', category: 'entrance', bestFor: ['cards', 'images', 'CTAs'], defaults: { duration: 0.9 }, build: entrance(() => ({ opacity: 0, scale: 0.94 })) },
  { id: 'blur-reveal', name: 'Blur reveal', description: 'Sharpen from a soft blur', category: 'entrance', bestFor: ['hero text', 'luxury brands'], defaults: { duration: 1.2 }, build: entrance(() => ({ opacity: 0, filter: 'blur(12px)' })) },
  {
    id: 'reveal', name: 'Reveal', description: 'Rise from behind a mask line', category: 'entrance', bestFor: ['headings', 'eyebrows'], defaults: { distance: 100, duration: 1 },
    build: ({ gsap, targets, params, scrollTrigger }) =>
      gsap.fromTo(targets, { yPercent: params.distance, clipPath: 'inset(0 0 100% 0)' }, { yPercent: 0, clipPath: 'inset(0 0 0% 0)', duration: params.duration, delay: params.delay, ease: params.ease, stagger: params.stagger, ...(scrollTrigger ? { scrollTrigger } : {}) }),
  },
  {
    id: 'clip-reveal', name: 'Clip reveal', description: 'Wipe in from bottom using clip-path', category: 'media', bestFor: ['images', 'galleries', 'feature blocks'], defaults: { duration: 1.3, ease: 'power4.inOut' },
    build: ({ gsap, targets, params, scrollTrigger }) =>
      gsap.fromTo(targets, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: params.duration, delay: params.delay, ease: params.ease, stagger: params.stagger, ...(scrollTrigger ? { scrollTrigger } : {}) }),
  },
  {
    id: 'image-mask', name: 'Image mask', description: 'Clip reveal while the image settles from a zoom', category: 'media', bestFor: ['hero images', 'room photography', 'editorial imagery'], defaults: { duration: 1.6, ease: 'expo.out' },
    build: ({ gsap, el, targets, params, scrollTrigger }) => {
      const tl = gsap.timeline({ delay: params.delay, ...(scrollTrigger ? { scrollTrigger } : {}) });
      tl.fromTo(targets, { clipPath: 'inset(12% 12% 12% 12%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: params.duration, ease: params.ease });
      const imgs = el.querySelectorAll('img, video');
      if (imgs.length) tl.fromTo(imgs, { scale: 1.18 }, { scale: 1, duration: params.duration * 1.2, ease: params.ease }, 0);
      return tl;
    },
  },
  {
    id: 'parallax', name: 'Parallax', description: 'Scroll-linked vertical drift', category: 'scroll', bestFor: ['background images', 'decorative media'], defaults: { distance: 12, scrub: true, trigger: 'scroll', start: 'top bottom', end: 'bottom top' },
    build: ({ gsap, el, params, scrollTrigger }) => {
      const media = el.querySelector('[data-a-parallax]') ?? el.querySelector('img, video') ?? el;
      return gsap.fromTo(media, { yPercent: -params.distance }, { yPercent: params.distance, ease: 'none', scrollTrigger: { ...scrollTrigger, scrub: params.scrub === false ? true : params.scrub } });
    },
  },
  { id: 'stagger', name: 'Stagger children', description: 'Children fade up one after another', category: 'layout', bestFor: ['card grids', 'feature lists', 'stats'], defaults: { target: 'children', stagger: 0.12, distance: 28 }, build: entrance((p) => ({ opacity: 0, y: p.distance })) },
  { id: 'text-reveal', name: 'Line reveal', description: 'Lines rise from masks', category: 'text', bestFor: ['large headings', 'quotes'], defaults: { target: 'lines', stagger: 0.12, duration: 1.1, distance: 110 }, build: entrance((p) => ({ yPercent: p.distance, opacity: 0 })) },
  { id: 'word-reveal', name: 'Word reveal', description: 'Words fade and rise in sequence', category: 'text', bestFor: ['hero headings', 'statements'], defaults: { target: 'words', stagger: 0.06, duration: 0.9, distance: 40 }, build: entrance((p) => ({ yPercent: p.distance, opacity: 0 })) },
  { id: 'character-reveal', name: 'Character reveal', description: 'Characters cascade in — use sparingly', category: 'text', bestFor: ['short display words', 'logotypes'], defaults: { target: 'chars', stagger: 0.025, duration: 0.7, distance: 60 }, build: entrance((p) => ({ yPercent: p.distance, opacity: 0 })) },
  {
    id: 'editorial-reveal', name: 'Editorial reveal', description: 'Hero choreography: eyebrow, heading lines, body, actions in sequence', category: 'layout', bestFor: ['editorial heroes', 'hospitality', 'luxury'], defaults: { duration: 1.1, stagger: 0.14, distance: 36 },
    build: ({ gsap, el, params, scrollTrigger }) => {
      const parts = el.querySelectorAll('[data-a-part]');
      const targets = parts.length ? parts : el.children;
      return gsap.from(targets, { opacity: 0, y: params.distance, duration: params.duration, ease: params.ease, delay: params.delay, stagger: params.stagger, ...(scrollTrigger ? { scrollTrigger } : {}), clearProps: 'transform' });
    },
  },
  {
    id: 'cinematic-reveal', name: 'Cinematic reveal', description: 'Background settles from a slow zoom while content fades in', category: 'media', bestFor: ['fullscreen heroes', 'video heroes', 'resorts'], defaults: { duration: 2.2, ease: 'expo.out', stagger: 0.16 },
    build: ({ gsap, el, params }) => {
      const tl = gsap.timeline({ delay: params.delay });
      const bg = el.querySelectorAll('[data-a-bg] img, [data-a-bg] video, [data-a-bg]');
      if (bg.length) tl.fromTo(bg[0], { scale: 1.14, opacity: 0.4 }, { scale: 1, opacity: 1, duration: params.duration, ease: params.ease });
      const parts = el.querySelectorAll('[data-a-part]');
      if (parts.length) tl.from(parts, { opacity: 0, y: 30, duration: 1, ease: 'power3.out', stagger: params.stagger }, 0.4);
      return tl;
    },
  },
  {
    id: 'pin-section', name: 'Pin section', description: 'Pin while scrolling through content (sticky storytelling)', category: 'scroll', bestFor: ['sticky storytelling', 'process steps'], defaults: { trigger: 'scroll', start: 'top top', end: '+=100%', scrub: true },
    build: ({ gsap, el, params, scrollTrigger }) => {
      const steps = el.querySelectorAll('[data-a-step]');
      const tl = gsap.timeline({ scrollTrigger: { ...scrollTrigger, pin: true, scrub: params.scrub, end: `+=${Math.max(1, steps.length) * 80}%` } });
      steps.forEach((s, i) => {
        if (i > 0) tl.fromTo(s, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1 });
      });
      return tl;
    },
  },
  {
    id: 'horizontal-scroll', name: 'Horizontal scroll', description: 'Vertical scroll drives a horizontal track', category: 'scroll', bestFor: ['galleries', 'experiences', 'timelines'], defaults: { trigger: 'scroll', start: 'top top', scrub: 1 },
    build: ({ gsap, el, params, scrollTrigger }) => {
      const track = el.querySelector<HTMLElement>('[data-a-track]');
      if (!track) return;
      const distance = () => Math.max(0, track.scrollWidth - el.clientWidth);
      return gsap.to(track, { x: () => -distance(), ease: 'none', scrollTrigger: { ...scrollTrigger, pin: true, scrub: params.scrub, end: () => `+=${distance()}`, invalidateOnRefresh: true } });
    },
  },
];

export const PRESET_MAP = new Map(ANIMATION_PRESETS.map((p) => [p.id, p]));

/** Presets usable by AI and the builder, grouped for pickers. */
export function listAnimationPresets() {
  return ANIMATION_PRESETS.map(({ id, name, description, category, bestFor }) => ({ id, name, description, category, bestFor }));
}

const INTENSITY: Record<MotionIntensity, { distance: number; duration: number }> = {
  none: { distance: 0, duration: 0 },
  subtle: { distance: 0.6, duration: 0.9 },
  moderate: { distance: 1, duration: 1 },
  expressive: { distance: 1.35, duration: 1.15 },
};

export function resolveParams(
  anim: Animation,
  theme: { intensity: MotionIntensity; ease: string; duration: number },
): ResolvedAnimationParams | null {
  const preset = PRESET_MAP.get(anim.preset);
  if (!preset || theme.intensity === 'none') return null;
  const k = INTENSITY[theme.intensity];
  const d = preset.defaults;
  return {
    duration: (anim.duration ?? d.duration ?? theme.duration) * k.duration,
    delay: anim.delay ?? d.delay ?? 0,
    ease: anim.ease ?? d.ease ?? theme.ease,
    distance: (anim.distance ?? d.distance ?? 30) * k.distance,
    stagger: anim.stagger ?? d.stagger ?? 0.1,
    start: anim.start ?? d.start ?? 'top 85%',
    end: anim.end ?? d.end ?? 'bottom 20%',
    scrub: anim.scrub ?? d.scrub ?? false,
    trigger: anim.trigger ?? d.trigger ?? 'scroll',
    once: anim.once ?? true,
    target: anim.target ?? d.target ?? 'self',
  };
}
