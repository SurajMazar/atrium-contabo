/** Lazy captcha providers. Scripts load only when a form that uses them approaches the viewport. */

export type CaptchaProvider = 'recaptcha-v2' | 'recaptcha-v3' | 'turnstile' | 'hcaptcha';

export interface CaptchaConfig {
  provider: CaptchaProvider;
  siteKey: string;
  action?: string;
}

export interface CaptchaHandle {
  /** Resolve a token for submission (executes invisible v3, reads widget responses otherwise). */
  getToken(): Promise<string | null>;
  reset(): void;
}

type AnyWin = Window & Record<string, any>;

const loaders = new WeakMap<Document, Map<string, Promise<void>>>();

export function loadScript(doc: Document, src: string): Promise<void> {
  let map = loaders.get(doc);
  if (!map) loaders.set(doc, (map = new Map()));
  const cached = map.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    doc.head.appendChild(s);
  });
  map.set(src, p);
  return p;
}

async function waitFor<T>(win: AnyWin, pick: () => T | undefined, timeout = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = pick();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('Captcha did not initialize');
    await new Promise((r) => win.setTimeout(r, 60));
  }
}

/** Render/initialize a captcha widget into `container`. */
export async function mountCaptcha(container: HTMLElement, cfg: CaptchaConfig): Promise<CaptchaHandle> {
  const doc = container.ownerDocument;
  const win = (doc.defaultView ?? window) as AnyWin;
  switch (cfg.provider) {
    case 'recaptcha-v3': {
      await loadScript(doc, `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(cfg.siteKey)}`);
      const g = await waitFor(win, () => win.grecaptcha?.execute && win.grecaptcha);
      return {
        getToken: () => new Promise((resolve) => g.ready(() => g.execute(cfg.siteKey, { action: cfg.action ?? 'submit' }).then(resolve, () => resolve(null)))),
        reset: () => {},
      };
    }
    case 'recaptcha-v2': {
      await loadScript(doc, 'https://www.google.com/recaptcha/api.js?render=explicit');
      const g = await waitFor(win, () => win.grecaptcha?.render && win.grecaptcha);
      const id = await new Promise<number>((resolve) => g.ready(() => resolve(g.render(container, { sitekey: cfg.siteKey }))));
      return { getToken: async () => g.getResponse(id) || null, reset: () => g.reset(id) };
    }
    case 'hcaptcha': {
      await loadScript(doc, 'https://js.hcaptcha.com/1/api.js?render=explicit');
      const h = await waitFor(win, () => win.hcaptcha?.render && win.hcaptcha);
      const id = h.render(container, { sitekey: cfg.siteKey });
      return { getToken: async () => h.getResponse(id) || null, reset: () => h.reset(id) };
    }
    case 'turnstile': {
      await loadScript(doc, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
      const t = await waitFor(win, () => win.turnstile?.render && win.turnstile);
      let token: string | null = null;
      const id = t.render(container, { sitekey: cfg.siteKey, action: cfg.action, callback: (v: string) => { token = v; }, 'expired-callback': () => { token = null; } });
      return { getToken: async () => token ?? t.getResponse?.(id) ?? null, reset: () => { token = null; t.reset(id); } };
    }
  }
}
