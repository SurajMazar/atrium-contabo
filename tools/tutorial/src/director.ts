import type { Browser, BrowserContext, Frame, Locator, Page } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { say, type Clip } from './tts';

export const W = 1920;
export const H = 1080;
const ASSETS = path.resolve(import.meta.dirname, '../assets');
const OVERLAY = readFileSync(path.join(ASSETS, 'overlay.js'), 'utf8');

export const asset = (name: string, query: Record<string, string> = {}) => `file://${path.join(ASSETS, name)}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`;

export interface Step {
  /** Narration for this step (spoken + captioned). */
  say: string;
  /** Actions performed while the narration plays. */
  do?: (d: Director) => Promise<void>;
  /** Extra hold after both narration and action finish. */
  holdMs?: number;
}

export interface Scene {
  id: string;
  chapter: string;
  title: string;
  storage?: 'admin' | 'none';
  /** Un-narrated preparation (navigation, login) — trimmed from the video. */
  setup?: (d: Director) => Promise<void>;
  steps: Step[];
}

export interface TimelineEntry {
  startMs: number;
  clip: Clip;
  text: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Drives one recorded scene: cursor, captions, highlights, narration timing. */
export class Director {
  page!: Page;
  context!: BrowserContext;
  t0 = 0;
  timeline: TimelineEntry[] = [];
  firstStepMs = 0;

  private storagePath?: string;

  constructor(private readonly scene: Scene) {}

  async start(browser: Browser, opts: { storageState?: string; videoDir: string }) {
    this.storagePath = opts.storageState;
    this.context = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      recordVideo: { dir: opts.videoDir, size: { width: W, height: H } },
      storageState: opts.storageState,
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    // tsx/esbuild keepNames wraps functions passed to evaluate() in __name(); provide it in the page.
    await this.context.addInitScript('globalThis.__name = globalThis.__name || ((f) => f);');
    await this.context.addInitScript(OVERLAY);
    this.page = await this.context.newPage();
    this.t0 = Date.now();
  }

  now() {
    return Date.now() - this.t0;
  }

  async goto(url: string, waitFor?: string) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    if (waitFor) await this.page.locator(waitFor).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
    await this.page.evaluate(() => (window as unknown as { __tut: { boot(): void } }).__tut?.boot());
  }

  private async tut<T extends unknown[]>(fn: string, ...args: T) {
    await this.page.evaluate(([f, a]) => {
      const t = (window as unknown as { __tut?: Record<string, (...x: unknown[]) => void> }).__tut;
      t?.[f as string]?.(...(a as unknown[]));
    }, [fn, args] as const).catch(() => undefined);
  }

  caption(text: string) {
    return this.tut('caption', text);
  }

  tag() {
    return this.tut('tag', this.scene.chapter, this.scene.title);
  }

  /** Bounding box of a locator in top-level page coordinates (works for iframe content too). */
  async box(target: Locator) {
    await target.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => undefined);
    const b = await target.boundingBox({ timeout: 8000 });
    if (!b) throw new Error(`No box for ${target}`);
    return b;
  }

  async moveTo(target: Locator | { x: number; y: number }, ms = 650) {
    const p = 'x' in target && typeof target.x === 'number' ? (target as { x: number; y: number }) : await this.box(target as Locator).then((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));
    await this.tut('move', p.x, p.y, ms);
    await this.page.mouse.move(p.x, p.y, { steps: 6 });
    await sleep(ms + 60);
    return p;
  }

  async click(target: Locator, opts: { ms?: number; dbl?: boolean } = {}) {
    const p = await this.moveTo(target, opts.ms);
    await this.tut('ripple', p.x, p.y);
    if (opts.dbl) await target.dblclick({ timeout: 8000 });
    else await target.click({ timeout: 8000 });
    await sleep(350);
  }

  async type(target: Locator, text: string, opts: { clear?: boolean; delay?: number } = {}) {
    await this.click(target);
    if (opts.clear) {
      await target.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await target.press('Backspace');
    }
    await target.pressSequentially(text, { delay: opts.delay ?? 38 });
    await sleep(250);
  }

  async press(keys: string) {
    await this.page.keyboard.press(keys);
    await sleep(300);
  }

  async highlight(target: Locator | null, label?: string) {
    if (!target) return this.tut('highlight', null);
    const b = await this.box(target);
    await this.tut('highlight', { x: b.x, y: b.y, width: b.width, height: b.height }, label ?? '');
  }

  async scroll(dy: number, ms = 900) {
    await this.page.evaluate(([y, d]) => {
      const el = document.scrollingElement!;
      const start = el.scrollTop;
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / d);
        el.scrollTop = start + y * (1 - Math.pow(1 - k, 3));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, [dy, ms] as const);
    await sleep(ms + 100);
  }

  /** Smooth-scroll inside an element (e.g. a canvas iframe document). */
  async scrollFrame(frame: Frame, dy: number, ms = 1100) {
    await frame.evaluate(([y, d]) => {
      const el = document.scrollingElement!;
      const start = el.scrollTop;
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / d);
        el.scrollTop = start + y * (1 - Math.pow(1 - k, 3));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, [dy, ms] as const);
    await sleep(ms + 100);
  }

  wait(ms: number) {
    return sleep(ms);
  }

  /** Narrate a step while running its action; returns when both are done. */
  async step(s: Step) {
    const clip = await say(s.say);
    if (!this.timeline.length) {
      this.firstStepMs = this.now();
      await this.tag();
    }
    const startMs = this.now();
    this.timeline.push({ startMs, clip, text: s.say });
    await this.caption(s.say);
    const action = (async () => {
      try {
        await s.do?.(this);
      } catch (err) {
        console.warn(`    ⚠ [${this.scene.id}] action failed: ${(err as Error).message.split('\n')[0]}`);
      }
    })();
    await Promise.all([action, sleep(clip.durationMs + 280)]);
    await this.caption('');
    await sleep(s.holdMs ?? 220);
  }

  async finish(): Promise<string> {
    await sleep(500);
    const video = this.page.video();
    // Refresh tokens rotate on use: persist the rotated session for the next scene.
    if (this.storagePath) await this.context.storageState({ path: this.storagePath }).catch(() => undefined);
    await this.context.close();
    return (await video!.path()) as string;
  }
}
