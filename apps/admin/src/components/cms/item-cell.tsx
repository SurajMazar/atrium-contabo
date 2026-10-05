import type { CollectionField } from '@atrium/schema';
import { Badge } from '@atrium/ui';
import { Check, Minus } from 'lucide-react';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { readMediaRef, textOf } from './values';

const dash = <span className="text-fg-subtle">—</span>;

/** Compact, read-only rendering of a field value inside a table cell. */
export function ItemCell({ field, value }: { field: CollectionField; value: unknown }) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return dash;
  switch (field.type) {
    case 'number':
      return <span className="tabular-nums">{typeof value === 'number' ? formatNumber(value) : String(value)}</span>;
    case 'boolean':
      return value === true ? <Check className="size-4 text-fg" strokeWidth={1.75} aria-label="Yes" /> : <Minus className="size-4 text-fg-subtle" strokeWidth={1.5} aria-label="No" />;
    case 'date':
      return <span title={String(value)}>{typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(`${value}T00:00:00`) : formatDate(String(value))}</span>;
    case 'datetime':
      return <span>{formatDateTime(String(value))}</span>;
    case 'select':
      return <Badge size="xs">{textOf(field, value)}</Badge>;
    case 'multiselect': {
      const vals = Array.isArray(value) ? value.map(String) : [String(value)];
      const label = (v: string) => field.options?.find((o) => o.value === v)?.label ?? v;
      return (
        <span className="flex items-center gap-1">
          {vals.slice(0, 2).map((v) => (
            <Badge key={v} size="xs">
              {label(v)}
            </Badge>
          ))}
          {vals.length > 2 && <span className="text-2xs text-fg-subtle">+{vals.length - 2}</span>}
        </span>
      );
    }
    case 'color':
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3.5 rounded-xs border border-border" style={{ background: String(value) }} />
          <span className="font-mono text-2xs uppercase text-fg-muted">{String(value)}</span>
        </span>
      );
    case 'image': {
      const ref = readMediaRef(value);
      // eslint-disable-next-line @next/next/no-img-element
      return ref ? <img src={ref.src} alt={ref.alt ?? ''} className="size-7 rounded-sm border border-border object-cover" loading="lazy" /> : dash;
    }
    case 'email':
    case 'url':
    case 'slug':
      return <span className="block max-w-[200px] truncate font-mono text-xs text-fg-muted">{String(value)}</span>;
    default:
      return <span className="block max-w-[240px] truncate">{textOf(field, value) || dash}</span>;
  }
}
