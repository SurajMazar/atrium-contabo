/**
 * The sites' own thin-stroke icon set (src/components/ui/Icon.tsx), reproduced exactly.
 *
 * Atrium's icon element draws from its lucide set, which does not contain these marks. Each icon
 * node therefore keeps a close lucide name (so it degrades to something sensible if its custom CSS
 * is removed) and carries a CSS mask with the original path data: the `<svg>` is painted in
 * `currentColor` through the mask, so colour, size and hover states still come from CSS.
 */
import { readFileSync } from 'node:fs';

export type IconName = string;

/** Parse the PATHS record out of Icon.tsx: `name: ( <>…</> )` → inner SVG markup. */
export function loadIcons(iconFile: string): Record<IconName, string> {
  const src = readFileSync(iconFile, 'utf8');
  const start = src.indexOf('const PATHS');
  const body = src.slice(start, src.indexOf('\n};', start));
  const out: Record<string, string> = {};
  const re = /\n\s{2}(?:'([a-z0-9-]+)'|([a-z0-9]+)):\s*\(([\s\S]*?)\n\s{2}\),/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const name = (m[1] ?? m[2])!;
    const inner = m[3]!
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/<\/?>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    out[name] = inner;
  }
  if (Object.keys(out).length < 30) throw new Error(`Only parsed ${Object.keys(out).length} icons from ${iconFile}`);
  return out;
}

/** Lucide stand-ins used as the icon element's `name` (what shows if the mask CSS is removed). */
export const LUCIDE: Record<string, string> = {
  'arrow-right': 'arrow-right', 'arrow-left': 'arrow-left', 'arrow-down': 'arrow-down', menu: 'menu', close: 'x', plus: 'plus', expand: 'maximize-2',
  rings: 'gem', glasses: 'wine', building: 'building-2', candle: 'flame', diamond: 'gem', guests: 'users', hall: 'landmark', terrace: 'tree-palm',
  calendar: 'calendar', dining: 'utensils', 'menu-card': 'file-text', screen: 'monitor', lights: 'sun', effects: 'sparkles', parking: 'circle-parking',
  'two-wheeler': 'bike', team: 'users', lounge: 'sofa', quote: 'quote', mail: 'mail', phone: 'phone', pin: 'map-pin', clock: 'clock',
  whatsapp: 'whatsapp', facebook: 'facebook', instagram: 'instagram', tiktok: 'tiktok',
};

/** `data:image/svg+xml` URI of one icon, stroked exactly as Icon.tsx draws it. */
export function iconDataUri(inner: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='square' stroke-linejoin='miter'>${inner.replace(/"/g, "'")}</svg>`;
  return `data:image/svg+xml,${svg.replace(/[<>#%{}"\n]/g, (c) => encodeURIComponent(c)).replace(/\s+/g, ' ')}`;
}

/** Site-level custom properties: one `--lgi-<name>` mask per icon. */
export function iconVariablesCss(icons: Record<string, string>): string {
  return `.atrium-site{${Object.entries(icons).map(([k, v]) => `--lgi-${k}:url("${iconDataUri(v)}");`).join('')}}`;
}

/** Node CSS that paints the original mark through the `<svg>` the icon element renders. */
export function maskCss(name: string, sel = '& svg'): string {
  return `${sel}{-webkit-mask:var(--lgi-${name}) center/100% 100% no-repeat;mask:var(--lgi-${name}) center/100% 100% no-repeat;background-color:currentColor}${sel}>*{visibility:hidden}`;
}
