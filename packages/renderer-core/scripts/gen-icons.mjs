// Generates src/ui/icons-data.ts from lucide-react's icon nodes (ISC license).
// Icons are rendered as plain server-side SVG so static sections ship zero JS.
// Run: node scripts/gen-icons.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(require.resolve('lucide-react/package.json')), 'dist/esm');
const pkg = JSON.parse(readFileSync(join(root, '../../package.json'), 'utf8'));

export const CURATED = [
  'arrow-right', 'arrow-left', 'arrow-up-right', 'arrow-down', 'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right',
  'plus', 'minus', 'x', 'menu', 'check', 'circle-check', 'star', 'quote', 'phone', 'mail', 'map-pin', 'map', 'compass', 'navigation',
  'clock', 'calendar', 'calendar-days', 'calendar-check', 'users', 'user', 'globe', 'wifi', 'car', 'plane', 'bus', 'bed-double', 'bath',
  'shower-head', 'coffee', 'utensils', 'utensils-crossed', 'wine', 'martini', 'beer', 'cake', 'salad', 'soup', 'fish', 'flower-2', 'leaf',
  'sprout', 'mountain', 'mountain-snow', 'sun', 'sunrise', 'sunset', 'moon', 'snowflake', 'waves', 'sailboat', 'ship', 'tree-pine', 'trees',
  'tree-palm', 'tent', 'bike', 'footprints', 'dumbbell', 'heart', 'heart-handshake', 'handshake', 'sparkles', 'sparkle', 'gem', 'gift',
  'party-popper', 'baby', 'dog', 'music', 'camera', 'image', 'play', 'pause', 'circle-play', 'shield-check', 'lock', 'key-round', 'award',
  'trophy', 'briefcase', 'building', 'building-2', 'landmark', 'house', 'hotel', 'concierge-bell', 'sofa', 'armchair', 'lamp', 'tv',
  'flame', 'thermometer', 'umbrella', 'cloud-sun', 'circle-parking', 'accessibility', 'cigarette-off', 'chart-line', 'chart-column',
  'chart-no-axes-column', 'chart-pie', 'trending-up', 'target', 'lightbulb', 'rocket', 'zap', 'layers', 'layout-grid', 'settings', 'wrench',
  'cpu', 'database', 'cloud', 'code', 'monitor', 'smartphone', 'banknote', 'credit-card', 'wallet', 'piggy-bank', 'percent', 'scale',
  'file-text', 'clipboard-check', 'graduation-cap', 'book-open', 'newspaper', 'message-circle', 'message-square', 'send', 'search',
  'external-link', 'download', 'info', 'circle-help', 'pen-tool', 'palette', 'glass-water', 'church', 'ticket', 'mic', 'presentation',
  'route', 'anchor', 'binoculars', 'hand-heart', 'medal', 'crown', 'feather', 'flower', 'wind', 'droplets', 'shield', 'badge-check',
  'clock-3', 'timer', 'list-checks', 'circle-dollar-sign', 'store', 'shopping-bag', 'package', 'truck', 'factory', 'zoom-in', 'maximize-2',
  'chevrons-down', 'move-right', 'ellipsis', 'loader-circle', 'circle-alert', 'triangle-alert',
];

// Map every exported component name → icon file (resolves renamed icons whose old files are re-export stubs).
const exportMap = new Map();
for (const line of readFileSync(join(root, 'lucide-react.mjs'), 'utf8').split('\n')) {
  const m = /^export \{ (.+) \} from '\.\/icons\/([\w-]+)\.mjs';$/.exec(line);
  if (!m) continue;
  for (const part of m[1].split(',')) {
    const name = part.trim().replace(/^default as /, '');
    exportMap.set(name, m[2]);
  }
}
const pascal = (k) => k.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

const icons = {};
const missing = [];
for (const name of CURATED) {
  const file = join(root, 'icons', `${exportMap.get(pascal(name)) ?? name}.mjs`);
  if (!existsSync(file)) { missing.push(name); continue; }
  const mod = await import(file);
  const node = mod.__iconData?.node;
  if (!node) { missing.push(name); continue; }
  icons[name] = node.map(([tag, attrs]) => { const { key, ...rest } = attrs; return [tag, rest]; });
}
if (missing.length) console.warn('missing icons:', missing.join(', '));

// Old/alternate names → curated names (incl. lucide v0 names commonly produced by AI agents).
const ALIASES = {
  home: 'house', 'check-circle': 'circle-check', 'check-circle-2': 'circle-check', 'help-circle': 'circle-help', 'bar-chart': 'chart-column',
  'bar-chart-3': 'chart-column', 'line-chart': 'chart-line', 'pie-chart': 'chart-pie', 'palm-tree': 'tree-palm', palmtree: 'tree-palm',
  parking: 'circle-parking', 'parking-circle': 'circle-parking', 'play-circle': 'circle-play', key: 'key-round', bed: 'bed-double', pool: 'waves',
  swimming: 'waves', spa: 'flower-2', restaurant: 'utensils', dining: 'utensils', food: 'utensils', drink: 'wine', bar: 'martini', gym: 'dumbbell',
  fitness: 'dumbbell', location: 'map-pin', pin: 'map-pin', email: 'mail', telephone: 'phone', time: 'clock', hours: 'clock', date: 'calendar',
  event: 'calendar-days', wedding: 'heart', ring: 'gem', yoga: 'flower', meditation: 'flower', hike: 'footprints', hiking: 'footprints',
  view: 'mountain', mountains: 'mountain', lake: 'waves', beach: 'umbrella', breakfast: 'coffee', transfer: 'car', airport: 'plane',
  family: 'baby', pets: 'dog', security: 'shield-check', support: 'message-circle', chat: 'message-circle', growth: 'trending-up',
  strategy: 'target', idea: 'lightbulb', launch: 'rocket', speed: 'zap', fast: 'zap', team: 'users', people: 'users', partner: 'handshake',
  finance: 'banknote', money: 'banknote', payments: 'credit-card', bank: 'landmark', data: 'database', ai: 'cpu', analytics: 'chart-line',
  close: 'x', hamburger: 'menu', 'arrow-up-right-from-square': 'external-link', 'alert-circle': 'circle-alert', 'alert-triangle': 'triangle-alert',
  'loader-2': 'loader-circle', 'more-horizontal': 'ellipsis', 'dollar-sign': 'circle-dollar-sign',
};
for (const [k, v] of Object.entries(ALIASES)) if (!icons[v]) delete ALIASES[k];

const out = `/* eslint-disable */
// GENERATED by scripts/gen-icons.mjs from lucide-react v${pkg.version} (ISC License, https://lucide.dev). Do not edit.
export type IconNode = Array<[string, Record<string, string | number>]>;

export const ICON_DATA: Record<string, IconNode> = ${JSON.stringify(icons)};

export const ICON_ALIASES: Record<string, string> = ${JSON.stringify(ALIASES)};
`;
writeFileSync(new URL('../src/ui/icons-data.ts', import.meta.url), out);
console.log(`wrote ${Object.keys(icons).length} icons, ${Object.keys(ALIASES).length} aliases`);
