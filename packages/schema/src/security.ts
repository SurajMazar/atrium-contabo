/**
 * Data-safety primitives shared by every package that stores, renders or exports site data.
 *
 * Site definitions are written by humans, AI agents and imports, and rendered on public tenant
 * origins *and* inside the same-origin builder canvas. These helpers make the data itself safe
 * regardless of who wrote it:
 *   - URLs:   `sanitizeUrl` / `isSafeUrl` / `safeHref` with per-context policies,
 *   - CSS:    `isSafeCssValue` / `isSafeCssColor` (value grammars for style + theme tokens),
 *   - ids:    `isSafeNodeId` / `toSafeNodeId` (ids end up in CSS selectors and class names),
 *   - regex:  `isSafeRegexPattern` (admin patterns run against public submissions),
 *   - iframes: `EMBED_IFRAME_HOSTS` / `isAllowedIframeHost` (single allowlist for embeds).
 *
 * Schemas use these as *sanitizing* transforms (stored data never throws; unsafe values become
 * a safe fallback) and the `Strict*` variants reject instead (builder operations, API inputs).
 */

// ---------------------------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------------------------

/**
 * - `link`:     anchors/buttons — http(s), mailto, tel, sms, relative paths, `?query`, `#fragment`
 * - `navigation`: redirects, form redirect targets — http(s) or relative only
 * - `media`:    img/video/poster — http(s), relative, `data:image/(png|jpeg|webp|gif|avif)`
 * - `https`:    third-party code (script src, iframes) — absolute https only
 * - `font`:     @font-face sources — https or a same-origin absolute path (`/fonts/x.woff2`)
 * - `css`:      url() in custom CSS — https, relative, `data:image/(png|jpeg|webp|gif|svg+xml)`
 */
export type UrlPolicy = 'link' | 'navigation' | 'media' | 'https' | 'font' | 'css';

const POLICY_SCHEMES: Record<UrlPolicy, readonly string[]> = {
  link: ['http', 'https', 'mailto', 'tel', 'sms'],
  navigation: ['http', 'https'],
  media: ['http', 'https'],
  https: ['https'],
  font: ['https'],
  css: ['https'],
};
const POLICY_RELATIVE: Record<UrlPolicy, boolean> = { link: true, navigation: true, media: true, https: false, font: false, css: true };
const DATA_IMAGE_MEDIA = /^data:image\/(?:png|jpe?g|webp|gif|avif)[;,]/;
const DATA_IMAGE_CSS = /^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml)[;,]/;

const NAMED_ENTITIES: Record<string, string> = { colon: ':', tab: '\t', newline: '\n', nbsp: ' ', sol: '/', lpar: '(', rpar: ')', period: '.', amp: '&' };

/** Decode HTML character references that could hide a scheme (`java&#x09;script:`, `&colon;`). */
function decodeEntities(s: string): string {
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi, (m, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex || dec) {
      const cp = hex ? parseInt(hex, 16) : parseInt(dec!, 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    const named = NAMED_ENTITIES[name!.toLowerCase()];
    return named ?? m;
  });
}

/** Whitespace, C0/C1 controls and invisible formatting characters (removed before scheme checks). */
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0020\u007F-\u00A0\u00AD\u1680\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]/g;
// eslint-disable-next-line no-control-regex
const EDGE_TRIM = /^[\u0000-\u0020]+|[\u0000-\u0020]+$/g;
// eslint-disable-next-line no-control-regex
const TAB_NEWLINE = /[\t\n\r]/g;

/** Canonical form used only for safety checks: entities decoded, invisible chars removed, lowercased. */
function canonical(raw: string): string {
  return decodeEntities(raw).replace(INVISIBLE, '').toLowerCase();
}

/**
 * Return the URL (trimmed the way browsers trim it) when it is allowed by `policy`, else undefined.
 * Values without a scheme are relative references; template tokens (`{{item.url}}`) pass here and
 * must be re-checked after interpolation (renderers do).
 */
export function sanitizeUrl(value: unknown, policy: UrlPolicy = 'link'): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length > 8192) return undefined;
  // Browsers strip leading/trailing C0 controls + spaces and remove tab/newline anywhere.
  const cleaned = value.replace(EDGE_TRIM, '').replace(TAB_NEWLINE, '');
  if (cleaned === '') return policy === 'https' || policy === 'font' ? undefined : '';
  const c = canonical(cleaned);
  if (c === '') return undefined;
  // Characters that never belong in a URL we emit (would only matter for attribute/CSS breakouts).
  if (/[<>"`\\]/.test(cleaned) && policy !== 'link' && policy !== 'navigation' && policy !== 'media') return undefined;

  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(c)?.[1];
  if (scheme) {
    if (scheme === 'data') {
      if (policy === 'media' && DATA_IMAGE_MEDIA.test(c)) return cleaned;
      if (policy === 'css' && DATA_IMAGE_CSS.test(c)) return cleaned;
      return undefined;
    }
    if (!POLICY_SCHEMES[policy].includes(scheme)) return undefined;
    if ((scheme === 'http' || scheme === 'https') && !/^https?:\/\/[^/?#\\]/.test(c)) return undefined;
    return cleaned;
  }
  // No scheme: a relative reference. Reject anything that still smells like a hidden scheme.
  if (/(?:java|vb|live)script|data:|file:/.test(c) && /:/.test(c.split(/[/?#]/)[0] ?? '')) return undefined;
  if (policy === 'font') {
    if (!c.startsWith('/') || c.startsWith('//') || c.startsWith('/\\')) return undefined;
    return cleaned;
  }
  return POLICY_RELATIVE[policy] ? cleaned : undefined;
}

export function isSafeUrl(value: unknown, policy: UrlPolicy = 'link'): boolean {
  return sanitizeUrl(value, policy) !== undefined;
}

/** Link-policy helper for renderers: the href when safe, otherwise undefined. */
export function safeHref(value: unknown): string | undefined {
  return sanitizeUrl(value, 'link');
}

// ---------------------------------------------------------------------------------------------
// CSS values
// ---------------------------------------------------------------------------------------------

/** `@group.key` design-token references allowed inside style values. */
export const CSS_TOKEN_REF = /@(color|space|radius|shadow|font|text|container|weight|leading|tracking)\.[a-zA-Z0-9_.-]+/g;
/** Allowed characters in a CSS declaration value (no `< > { } ; \ @ : [ ] & ` or newlines). */
const CSS_VALUE_CHARS = /^[\p{L}\p{N} #%().,\-+*/!'"_]*$/u;
/** Functions/keywords that load resources or run code. `url(` is only emitted by vetted fields. */
const CSS_FORBIDDEN = /(?:^|[^a-z0-9-])(?:url|src|image-set|-webkit-image-set|expression|element|-moz-element|paint)\s*\(|-moz-binding|behaviou?r|javascript|vbscript|\/\*|\*\//i;

function balanced(v: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (const ch of v) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0 && quote === null;
}

/**
 * A single CSS declaration value that cannot terminate the declaration/rule/stylesheet, load
 * resources or execute script: restricted charset, balanced quotes/parens, no url()/expression().
 */
export function isSafeCssValue(value: unknown, maxLength = 500): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  if (value.length > maxLength) return false;
  const v = value.replace(CSS_TOKEN_REF, 'token');
  return CSS_VALUE_CHARS.test(v) && !CSS_FORBIDDEN.test(v) && balanced(v);
}

const COLOR_FN = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|var|light-dark|device-cmyk)\(.*\)$/i;

/** Hex, named keyword, `@color.x` token, or a color function (rgb/hsl/oklch/color-mix/var…). */
export function isSafeCssColor(value: unknown): boolean {
  if (typeof value !== 'string' || !value || value.length > 120) return false;
  const v = value.trim();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
  if (/^[a-z]{3,30}$/i.test(v)) return true;
  if (/^@color\.[a-zA-Z0-9_-]+$/.test(v)) return true;
  return COLOR_FN.test(v) && isSafeCssValue(v, 120);
}

/** CSS custom-property / token key (`brand`, `surface-2`, `heroOverlay`). */
export const SAFE_TOKEN_KEY = /^[a-zA-Z][\w-]{0,63}$/;

/** Font family name (wrapped in quotes when emitted). */
export const SAFE_FONT_FAMILY = /^[\p{L}\p{N} _\-.']{1,100}$/u;
/** Font fallback stack, e.g. `"Helvetica Neue", Arial, sans-serif`. */
export const SAFE_FONT_FALLBACK = /^[\p{L}\p{N} _\-,'".]{0,300}$/u;

export function isSafeFontFallback(value: unknown): boolean {
  return typeof value === 'string' && SAFE_FONT_FALLBACK.test(value) && balanced(value);
}

/**
 * Escape CSS for embedding in an HTML `<style>` element (or any HTML raw-text context). `<` that
 * could start a tag/end tag/comment becomes the CSS escape `\3c ` (identical meaning in strings,
 * identifiers and url()), so `</style>` can never appear. `<` followed by whitespace, a digit or
 * `=` is kept so media-query range syntax (`width < 600px`) keeps working.
 */
export function escapeCssForHtml(css: string): string {
  return css.replace(/<(?=[^\s\d=]|$)/g, '\\3c ');
}

// ---------------------------------------------------------------------------------------------
// Node ids
// ---------------------------------------------------------------------------------------------

export const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeNodeId(id: unknown): boolean {
  return typeof id === 'string' && NODE_ID_PATTERN.test(id);
}

/** Deterministic safe id for legacy/unsafe ids (stable across parses so references keep working). */
export function toSafeNodeId(id: string): string {
  if (isSafeNodeId(id)) return id;
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48);
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return `${cleaned || 'n'}_${(h >>> 0).toString(36)}`.slice(0, 64);
}

// ---------------------------------------------------------------------------------------------
// Regex patterns (ReDoS)
// ---------------------------------------------------------------------------------------------

export const MAX_REGEX_PATTERN_LENGTH = 200;
/** Values longer than this are never run through admin-authored patterns. */
export const MAX_REGEX_INPUT_LENGTH = 1000;

/**
 * Conservative safe-regex check for admin-authored patterns that run against public input:
 * bounded length, compiles, no backreferences, no quantified group that itself contains a
 * quantifier or alternation (`(a+)+`, `(a|aa)*`, `(\w+\s?)*`), and at most a few unbounded
 * quantifiers overall.
 */
export function isSafeRegexPattern(pattern: unknown): boolean {
  if (typeof pattern !== 'string' || pattern.length > MAX_REGEX_PATTERN_LENGTH) return false;
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  if (/\\[1-9]|\\k</.test(pattern)) return false;
  // Per open group: does it contain a quantifier (any / unbounded) or an alternation?
  type Group = { quant: boolean; unbounded: boolean; alt: boolean };
  const stack: Group[] = [];
  let unbounded = 0;
  let inClass = false;
  /** Quantifier at `i`: max repetitions (Infinity for * + {n,}) or null. */
  const quantAt = (i: number): number | null => {
    const ch = pattern[i];
    if (ch === '*' || ch === '+') return Infinity;
    if (ch === '?') return 1;
    if (ch === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
      if (!m) return null;
      if (m[2] === undefined) return Number(m[1]);
      return m[3] === '' ? Infinity : Number(m[3]);
    }
    return null;
  };
  const mark = (max: number) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    top.quant = true;
    if (max > 100) top.unbounded = true;
  };
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch === '(') {
      stack.push({ quant: false, unbounded: false, alt: false });
      // Group modifiers (?: (?= (?! (?<= (?<! (?<name> are not quantifiers.
      if (pattern[i + 1] === '?') {
        const mod = /^\?(?::|=|!|<=|<!|<[A-Za-z_][\w]*>)/.exec(pattern.slice(i + 1));
        if (mod) i += mod[0].length;
      }
      continue;
    }
    if (ch === '|') {
      if (stack.length) stack[stack.length - 1]!.alt = true;
      continue;
    }
    if (ch === ')') {
      const group = stack.pop() ?? { quant: false, unbounded: false, alt: false };
      const max = quantAt(i + 1);
      if (max !== null) {
        // (a+)+  (a|ab)*  (a?b)*  → catastrophic;  (a+){3} → polynomial blow-up;  (\d{4})? is fine.
        if (max > 100 && (group.quant || group.alt)) return false;
        if (max > 1 && group.unbounded) return false;
        if (max > 100) unbounded++;
        mark(max);
      }
      if (group.quant && stack.length) mark(group.unbounded ? Infinity : 1);
      continue;
    }
    const max = quantAt(i);
    if (max !== null) {
      if (max > 100) unbounded++;
      mark(max);
    }
  }
  return unbounded <= 4;
}

/** Run an admin pattern against untrusted input with ReDoS guards. Unsafe patterns never match. */
export function safeRegexTest(pattern: string, input: string): boolean {
  if (!isSafeRegexPattern(pattern) || input.length > MAX_REGEX_INPUT_LENGTH) return false;
  try {
    return new RegExp(pattern).test(input);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------------------------

/**
 * Hosts whose players/widgets may be iframed with `allow-same-origin` (they need their own
 * origin for cookies/storage). Single source of truth for the renderer, the renderer HTML
 * sanitizer and the API sanitizer (`apps/api/src/common/sanitize.ts`).
 */
export const EMBED_IFRAME_HOSTS: readonly string[] = [
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'www.google.com',
  'maps.google.com',
  'open.spotify.com',
  'w.soundcloud.com',
  'calendly.com',
  'www.openstreetmap.org',
  'docs.google.com',
  'airtable.com',
  'forms.office.com',
];

interface ParsedUrl {
  href: string;
  protocol: string;
  hostname: string;
  username: string;
  password: string;
}
const URLCtor = (globalThis as unknown as { URL: new (input: string) => ParsedUrl }).URL;

/** Parse an absolute https URL (no credentials); undefined when unsafe/invalid. */
export function parseHttpsUrl(value: unknown): ParsedUrl | undefined {
  const safe = sanitizeUrl(value, 'https');
  if (!safe) return undefined;
  try {
    const u = new URLCtor(safe);
    return u.protocol === 'https:' && !u.username && !u.password ? u : undefined;
  } catch {
    return undefined;
  }
}

export function isAllowedIframeHost(value: unknown): boolean {
  const u = parseHttpsUrl(value);
  return !!u && EMBED_IFRAME_HOSTS.includes(u.hostname.toLowerCase());
}

/** Sandbox for allowlisted embeds vs. any other https page (opaque origin, no same-origin). */
export const IFRAME_SANDBOX_TRUSTED = 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation';
export const IFRAME_SANDBOX_UNTRUSTED = 'allow-scripts allow-popups allow-forms';
