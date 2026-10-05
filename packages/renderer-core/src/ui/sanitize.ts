import { IFRAME_SANDBOX_TRUSTED, isAllowedIframeHost, sanitizeUrl } from '@atrium/schema';

/**
 * Dependency-free allowlist HTML sanitizer for rich text and embeds. Runs identically on the
 * server and in the browser (no DOM). Unknown tags are unwrapped (text kept); dangerous
 * containers (script/style/iframe/object…) are removed with their content; event handlers,
 * `style` and non-http(s)/mailto/tel URLs are dropped. Iframes (embeds only) are kept only for
 * hosts on the shared `EMBED_IFRAME_HOSTS` allowlist; everything else is removed.
 */
const GLOBAL_ATTRS = new Set(['class', 'id', 'title', 'lang', 'dir', 'aria-label', 'aria-hidden', 'role']);
const TAGS: Record<string, Set<string>> = {
  p: new Set(), br: new Set(), hr: new Set(), strong: new Set(), b: new Set(), em: new Set(), i: new Set(), u: new Set(), s: new Set(),
  small: new Set(), sup: new Set(), sub: new Set(), mark: new Set(), span: new Set(), div: new Set(), code: new Set(), pre: new Set(),
  blockquote: new Set(['cite']), cite: new Set(), q: new Set(), abbr: new Set(), h2: new Set(), h3: new Set(), h4: new Set(), h5: new Set(), h6: new Set(),
  ul: new Set(), ol: new Set(['start', 'type']), li: new Set(), dl: new Set(), dt: new Set(), dd: new Set(),
  a: new Set(['href', 'target', 'rel', 'name']), img: new Set(['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes']),
  figure: new Set(), figcaption: new Set(), table: new Set(), thead: new Set(), tbody: new Set(), tfoot: new Set(), tr: new Set(),
  th: new Set(['scope', 'colspan', 'rowspan']), td: new Set(['colspan', 'rowspan']), caption: new Set(), details: new Set(['open']), summary: new Set(),
};
const IFRAME_ATTRS = new Set(['src', 'width', 'height', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy', 'title', 'frameborder']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'textarea', 'select', 'button', 'head', 'title', 'link', 'meta', 'base']);
const VOID = new Set(['br', 'hr', 'img']);
const URL_ATTRS = new Set(['href', 'src', 'cite', 'srcset']);

function safeUrl(value: string, policy: 'link' | 'media' = 'link'): boolean {
  if (!value.trim()) return false;
  return sanitizeUrl(value, policy) !== undefined;
}

/** Permissions-policy features an allowlisted embed may request. */
const IFRAME_ALLOW = new Set(['autoplay', 'fullscreen', 'encrypted-media', 'picture-in-picture', 'clipboard-write', 'web-share', 'accelerometer', 'gyroscope']);

/** Iframe src as the browser will see it; values with character references other than &amp; are rejected. */
function allowedIframe(src: string | undefined): boolean {
  if (!src || /&#|&(?!amp;)[a-z][a-z0-9]*;/i.test(src)) return false;
  return isAllowedIframeHost(src.replace(/&amp;/gi, '&'));
}

function iframeSrc(raw: string): string | undefined {
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) if (m[1]!.toLowerCase() === 'src') return m[2] ?? m[3] ?? m[4] ?? '';
  return undefined;
}

function escapeAttr(v: string): string {
  return v.replace(/&(?!(?:[a-z]+|#\d+|#x[\da-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function cleanAttrs(tag: string, raw: string, allowIframes: boolean): string {
  const allowed = tag === 'iframe' && allowIframes ? IFRAME_ATTRS : TAGS[tag];
  if (!allowed) return '';
  const out: string[] = [];
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  let hasTargetBlank = false;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1]!.toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (name.startsWith('on') || name === 'style') continue;
    if (!allowed.has(name) && !GLOBAL_ATTRS.has(name) && !name.startsWith('data-')) continue;
    if (URL_ATTRS.has(name)) {
      const policy = tag === 'img' ? 'media' : 'link';
      if (name === 'srcset') {
        if (value.split(',').some((part) => !safeUrl(part.trim().split(/\s+/)[0] ?? '', 'media'))) continue;
      } else if (!safeUrl(value, policy)) continue;
      if (tag === 'iframe' && name === 'src' && !allowedIframe(value)) continue;
    }
    if (tag === 'iframe' && name === 'allow') {
      const features = value.split(';').map((f) => f.trim().split(/\s+/)[0]!.toLowerCase()).filter((f) => IFRAME_ALLOW.has(f));
      if (features.length) out.push(`allow="${features.join('; ')}"`);
      continue;
    }
    if (name === 'target' && value === '_blank') hasTargetBlank = true;
    out.push(m[2] === undefined && m[3] === undefined && m[4] === undefined ? name : `${name}="${escapeAttr(value)}"`);
  }
  if (tag === 'a' && hasTargetBlank && !out.some((a) => a.startsWith('rel='))) out.push('rel="noopener noreferrer"');
  // Only allowlisted hosts reach this point (see sanitizeHtml); they get their own origin.
  if (tag === 'iframe') out.push(`sandbox="${IFRAME_SANDBOX_TRUSTED}"`);
  return out.length ? ` ${out.join(' ')}` : '';
}

export function sanitizeHtml(html: string, opts: { allowIframes?: boolean } = {}): string {
  if (!html) return '';
  const allowIframes = !!opts.allowIframes;
  let out = '';
  let i = 0;
  const stack: string[] = [];
  let dropDepth = 0;
  let dropTag = '';
  const src = html.replace(/<!--[\s\S]*?-->/g, '');
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const text = src.slice(i, m.index);
    if (!dropDepth) out += text.replace(/</g, '&lt;');
    i = m.index + m[0].length;
    const closing = m[0][1] === '/';
    const tag = m[1]!.toLowerCase();
    if (dropDepth) {
      if (tag === dropTag) dropDepth += closing ? -1 : m[0].endsWith('/>') ? 0 : 1;
      continue;
    }
    // Iframes survive only with an allowlisted https src; anything else is dropped with its content.
    const isIframe = tag === 'iframe' && allowIframes && (closing || allowedIframe(iframeSrc(m[2] ?? '')));
    if (DROP_WITH_CONTENT.has(tag) && !isIframe) {
      if (!closing && !m[0].endsWith('/>')) {
        dropDepth = 1;
        dropTag = tag;
      }
      continue;
    }
    if (!TAGS[tag] && !isIframe) continue;
    if (closing) {
      const idx = stack.lastIndexOf(tag);
      if (idx === -1) continue;
      while (stack.length > idx) out += `</${stack.pop()}>`;
      continue;
    }
    out += `<${tag}${cleanAttrs(tag, m[2] ?? '', allowIframes)}>`;
    if (!VOID.has(tag) && !m[0].endsWith('/>')) stack.push(tag);
    else if (!VOID.has(tag)) out += `</${tag}>`;
  }
  if (!dropDepth) out += src.slice(i).replace(/</g, '&lt;');
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}
