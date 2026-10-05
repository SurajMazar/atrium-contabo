/** Collect every media URL referenced anywhere in a site definition (for export manifests and asset copying). */
export interface MediaReference {
  url: string;
  mediaId?: string;
  /** JSON paths where the URL appears, e.g. `pages[2].sections[0].props.image.src`. */
  paths: string[];
  kind: 'image' | 'video' | 'audio' | 'document' | 'font' | 'other';
}

const EXT_KIND: Array<[RegExp, MediaReference['kind']]> = [
  [/\.(avif|webp|png|jpe?g|gif|svg|ico|bmp|tiff?)$/i, 'image'],
  [/\.(mp4|webm|mov|m4v|ogv)$/i, 'video'],
  [/\.(mp3|wav|ogg|m4a|aac|flac)$/i, 'audio'],
  [/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)$/i, 'document'],
  [/\.(woff2?|ttf|otf|eot)$/i, 'font'],
];

const MEDIA_KEYS = new Set(['src', 'poster', 'logo', 'logoInverse', 'favicon', 'image', 'images', 'ogImage', 'backgroundImage', 'backgroundVideo', 'video', 'thumbnail', 'avatar', 'icon', 'file', 'url', 'href']);

function kindOf(url: string): MediaReference['kind'] | undefined {
  const path = url.split(/[?#]/)[0] ?? url;
  for (const [re, kind] of EXT_KIND) if (re.test(path)) return kind;
  if (url.startsWith('data:image/')) return 'image';
  return undefined;
}

function looksLikeUrl(v: string): boolean {
  return /^(https?:)?\/\//i.test(v) || v.startsWith('/') || v.startsWith('data:');
}

/** Pull `url(...)` references out of CSS strings. */
function cssUrls(css: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  for (let m = re.exec(css); m; m = re.exec(css)) if (m[2] && !m[2].startsWith('#')) out.push(m[2].trim());
  return out;
}

export function collectMediaReferences(value: unknown, opts: { includeDataUrls?: boolean } = {}): MediaReference[] {
  const found = new Map<string, MediaReference>();
  const add = (url: string, path: string, mediaId?: string, forced?: MediaReference['kind']) => {
    if (!url || (url.startsWith('data:') && !opts.includeDataUrls)) return;
    const kind = forced ?? kindOf(url) ?? 'other';
    const ref = found.get(url) ?? { url, paths: [], kind };
    if (mediaId) ref.mediaId ??= mediaId;
    if (!ref.paths.includes(path)) ref.paths.push(path);
    found.set(url, ref);
  };

  const walk = (node: unknown, path: string, key: string | undefined, depth: number): void => {
    if (depth > 64 || node === null || node === undefined) return;
    if (typeof node === 'string') {
      if (key && /css$/i.test(key)) for (const u of cssUrls(node)) add(u, path);
      else if (looksLikeUrl(node) && (kindOf(node) || (key !== undefined && MEDIA_KEYS.has(key) && key !== 'href' && key !== 'url'))) add(node, path);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, key, depth + 1));
      return;
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      // MediaRef: { src, mediaId?, mimeType? }
      if (typeof obj.src === 'string' && (typeof obj.mediaId === 'string' || typeof obj.mimeType === 'string' || 'alt' in obj)) {
        const mime = typeof obj.mimeType === 'string' ? obj.mimeType : '';
        const forced = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : undefined;
        add(obj.src, `${path}.src`, typeof obj.mediaId === 'string' ? obj.mediaId : undefined, forced ?? kindOf(obj.src) ?? 'image');
      }
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'src' && typeof v === 'string' && typeof obj.mediaId === 'string') continue;
        walk(v, path ? `${path}.${k}` : k, k, depth + 1);
      }
    }
  };
  walk(value, '', undefined, 0);
  return [...found.values()].sort((a, b) => a.url.localeCompare(b.url));
}
