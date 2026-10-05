import { COLLECTION_FIELD_TYPES, type CollectionField, type CollectionFieldType } from '@atrium/schema';
import {
  AlignLeft,
  Braces,
  Calendar,
  CalendarClock,
  Slash,
  SquareCheck,
  Clapperboard,
  FileImage,
  Hash,
  Images,
  Image as ImageIcon,
  Link2,
  ListChecks,
  Mail,
  MapPin,
  Network,
  Palette,
  Pilcrow,
  Share2,
  ToggleRight,
  Type,
  type LucideIcon,
} from 'lucide-react';

export interface FieldTypeMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  group: 'Text' | 'Number & date' | 'Media' | 'Choice & relation' | 'Other';
}

export const FIELD_TYPE_META: Record<CollectionFieldType, FieldTypeMeta> = {
  text: { label: 'Text', description: 'Single line, like a name or title', icon: Type, group: 'Text' },
  textarea: { label: 'Long text', description: 'Plain multi-line text', icon: AlignLeft, group: 'Text' },
  richtext: { label: 'Rich text', description: 'Formatted text with headings, links and lists', icon: Pilcrow, group: 'Text' },
  slug: { label: 'Slug', description: 'URL-safe identifier generated from the title', icon: Slash, group: 'Text' },
  email: { label: 'Email', description: 'Validated email address', icon: Mail, group: 'Text' },
  url: { label: 'URL', description: 'Link to a page or external site', icon: Link2, group: 'Text' },
  number: { label: 'Number', description: 'Integer or decimal, like a price or capacity', icon: Hash, group: 'Number & date' },
  boolean: { label: 'Toggle', description: 'On or off, like “featured”', icon: ToggleRight, group: 'Number & date' },
  date: { label: 'Date', description: 'Calendar date without time', icon: Calendar, group: 'Number & date' },
  datetime: { label: 'Date & time', description: 'Date with a time of day', icon: CalendarClock, group: 'Number & date' },
  image: { label: 'Image', description: 'One image from the media library', icon: ImageIcon, group: 'Media' },
  video: { label: 'Video', description: 'One video from the media library', icon: Clapperboard, group: 'Media' },
  media: { label: 'File', description: 'Any file from the media library', icon: FileImage, group: 'Media' },
  gallery: { label: 'Gallery', description: 'Ordered list of images', icon: Images, group: 'Media' },
  select: { label: 'Select', description: 'Pick one option from a list', icon: SquareCheck, group: 'Choice & relation' },
  multiselect: { label: 'Multi-select', description: 'Pick several options from a list', icon: ListChecks, group: 'Choice & relation' },
  relation: { label: 'Reference', description: 'Link to one item in another collection', icon: Share2, group: 'Choice & relation' },
  multirelation: { label: 'Multi-reference', description: 'Link to several items in another collection', icon: Network, group: 'Choice & relation' },
  color: { label: 'Color', description: 'Hex color value', icon: Palette, group: 'Other' },
  location: { label: 'Location', description: 'Address with latitude and longitude', icon: MapPin, group: 'Other' },
  json: { label: 'JSON', description: 'Structured data for advanced use', icon: Braces, group: 'Other' },
};

export const FIELD_TYPE_GROUPS: Array<{ label: FieldTypeMeta['group']; types: CollectionFieldType[] }> = (['Text', 'Number & date', 'Media', 'Choice & relation', 'Other'] as const).map((g) => ({
  label: g,
  types: COLLECTION_FIELD_TYPES.filter((t) => FIELD_TYPE_META[t].group === g),
}));

export const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Types usable as an item title. */
export const TITLE_TYPES: CollectionFieldType[] = ['text', 'textarea', 'slug', 'email', 'url', 'select'];

/** Types that render well in a narrow table cell. */
export const CELL_TYPES: CollectionFieldType[] = ['text', 'number', 'boolean', 'date', 'datetime', 'select', 'email', 'url', 'color', 'image', 'slug', 'multiselect'];

export const hasOptions = (t: CollectionFieldType) => t === 'select' || t === 'multiselect';
export const isRelation = (t: CollectionFieldType) => t === 'relation' || t === 'multirelation';

/** "Max guests" → "maxGuests". Falls back to "field". */
export function camelKey(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join('');
  if (!key) return 'field';
  if (!/^[a-zA-Z]/.test(key)) key = `f${key}`;
  return key;
}

export function uniqueKey(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) if (!set.has(`${base}${i}`)) return `${base}${i}`;
}

export function fieldTypeLabel(f: Pick<CollectionField, 'type'>): string {
  return FIELD_TYPE_META[f.type]?.label ?? f.type;
}
