import { createElement, type ReactNode } from 'react';
import { ICON_ALIASES, ICON_DATA, type IconNode } from './icons-data';

/** Brand glyphs (lucide v1 ships no brand icons). Simple, original line drawings on a 24px grid. */
const SOCIAL: Record<string, IconNode> = {
  instagram: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 5 }], ['circle', { cx: 12, cy: 12, r: 4 }], ['circle', { cx: 17.4, cy: 6.6, r: 0.6, fill: 'currentColor' }]],
  facebook: [['path', { d: 'M15.5 3H14a4 4 0 0 0-4 4v3H7.5v3.5H10V21h3.5v-7.5h2.7l.5-3.5h-3.2V7.6c0-.5.4-1 1-1h2V3z' }]],
  linkedin: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2.5 }], ['path', { d: 'M8 10.5V16.5M8 7.6v.1M11.5 16.5v-3.4c0-1.6 1-2.6 2.3-2.6s2.2.9 2.2 2.6v3.4M11.5 10.5v6' }]],
  youtube: [['path', { d: 'M21.3 7.4a2.6 2.6 0 0 0-1.8-1.8C17.9 5.2 12 5.2 12 5.2s-5.9 0-7.5.4a2.6 2.6 0 0 0-1.8 1.8C2.3 9 2.3 12 2.3 12s0 3 .4 4.6a2.6 2.6 0 0 0 1.8 1.8c1.6.4 7.5.4 7.5.4s5.9 0 7.5-.4a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-4.6.4-4.6s0-3-.4-4.6z' }], ['path', { d: 'M10 9.2v5.6l4.8-2.8z' }]],
  x: [['path', { d: 'M4 4l6.4 8.6L4.3 20h1.6l5.3-6.2L15.8 20H20l-6.7-9 5.8-7h-1.6l-5 6-4.4-6z' }]],
  tiktok: [['path', { d: 'M14.5 3v11.2a3.8 3.8 0 1 1-3.8-3.8' }], ['path', { d: 'M14.5 3c.4 2.6 2.1 4.3 4.8 4.6' }]],
  pinterest: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M10.6 20.6l1.6-7.2M9.2 12.6c-.5-2.6 1.2-4.6 3.4-4.6 2.1 0 3.4 1.4 3.4 3.3 0 2.4-1.3 4.1-3 4.1-1 0-1.6-.6-1.6-1.4' }]],
  whatsapp: [['path', { d: 'M3.5 20.5l1.3-4a8.5 8.5 0 1 1 3.3 3z' }], ['path', { d: 'M9 8.6c0 3.4 2.9 6.4 6.4 6.4l1-1.4-1.9-.9-.8.8a4.4 4.4 0 0 1-3.2-3.2l.8-.8-.9-1.9z' }]],
  messenger: [['path', { d: 'M12 3C7 3 3 6.7 3 11.4c0 2.6 1.2 4.9 3.2 6.4V21l2.9-1.6c.9.3 1.9.4 2.9.4 5 0 9-3.7 9-8.4S17 3 12 3z' }], ['path', { d: 'M7.5 13.6l3-3.2 2.3 1.8 3.2-3.2' }]],
  telegram: [['path', { d: 'M21 4.5L3.5 11.3l5.3 1.9 2 6.3 3-3.6 4.6 3.4z' }], ['path', { d: 'M8.8 13.2L21 4.5' }]],
  tripadvisor: [['circle', { cx: 7, cy: 13.5, r: 3.5 }], ['circle', { cx: 17, cy: 13.5, r: 3.5 }], ['circle', { cx: 7, cy: 13.5, r: 0.8, fill: 'currentColor' }], ['circle', { cx: 17, cy: 13.5, r: 0.8, fill: 'currentColor' }], ['path', { d: 'M2.5 9.5h3M18.5 9.5h3M5.5 9.5C7.4 7.9 9.6 7 12 7s4.6.9 6.5 2.5M10.5 15.5L12 18l1.5-2.5' }]],
  github: [['path', { d: 'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21' }]],
  threads: [['path', { d: 'M16.6 11.2c-.4-2.3-2-3.4-4.2-3.4-2.4 0-4 1.7-4 4s1.6 3.5 3.6 3.5c2.4 0 4.3-1.5 4.3-4.3 0-4.3-2.9-6.7-6.4-6.7C6 4.3 3.5 7.4 3.5 12s2.6 7.7 7.6 7.7c3 0 5.2-1.3 6.3-3.3' }]],
  custom: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18' }]],
};

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/^lucide[-:]?/i, '')
    .replace(/Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

export function resolveIcon(name: string | undefined | null): IconNode | undefined {
  if (!name) return undefined;
  const key = normalizeName(name);
  return ICON_DATA[key] ?? ICON_DATA[ICON_ALIASES[key] ?? ''] ?? SOCIAL[key];
}

export function hasIcon(name: string | undefined | null): boolean {
  return !!resolveIcon(name);
}

export interface IconProps {
  name?: string | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Accessible label; decorative (aria-hidden) when omitted. */
  label?: string;
  fallback?: string | false;
}

/** Server-safe SVG icon from the curated lucide set (+ brand glyphs). Zero client JS. */
export function Icon({ name, size = 20, strokeWidth = 1.5, className, label, fallback = 'sparkle' }: IconProps): ReactNode {
  const node = resolveIcon(name) ?? (fallback ? resolveIcon(fallback) : undefined);
  if (!node) return null;
  return createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: ['a-icon', className].filter(Boolean).join(' '),
      ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true', focusable: 'false' }),
    },
    label ? createElement('title', null, label) : null,
    ...node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs })),
  );
}

export const SOCIAL_LABELS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', x: 'X', pinterest: 'Pinterest',
  whatsapp: 'WhatsApp', messenger: 'Messenger', telegram: 'Telegram', tripadvisor: 'Tripadvisor', github: 'GitHub', threads: 'Threads', custom: 'Website',
};
