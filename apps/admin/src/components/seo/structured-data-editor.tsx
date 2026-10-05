'use client';

import { StructuredDataTypeSchema } from '@atrium/schema';
import { Button, CodeEditor, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, IconButton, Switch } from '@atrium/ui';
import { Braces, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

export type StructuredDataType = (typeof StructuredDataTypeSchema.options)[number];

export interface StructuredDataRow {
  key: string;
  type: StructuredDataType;
  auto: boolean;
  /** Raw JSON text for optional overrides ('' = none). */
  json: string;
}

const TYPE_HELP: Record<StructuredDataType, string> = {
  Organization: 'Name, logo and social profiles',
  LocalBusiness: 'Address, phone, opening hours and map location',
  Hotel: 'Lodging details for hotels and guest houses',
  Resort: 'Lodging with amenities and activities',
  Restaurant: 'Cuisine, menu, price range and reservations',
  EventVenue: 'A place that hosts events',
  Event: 'Dates, location and tickets for an event',
  Article: 'Headline, author and publish date for posts',
  FAQPage: 'Questions and answers from FAQ sections',
  BreadcrumbList: 'Page hierarchy shown in search results',
  Product: 'Price, availability and reviews',
  WebSite: 'Site name and sitelinks search box',
  Service: 'A service your business offers',
  Custom: 'Any schema.org type, defined in JSON',
};

const TYPES = StructuredDataTypeSchema.options;

/** Returns an error message when `json` is non-empty and not a JSON object. */
export function jsonError(json: string): string | null {
  if (!json.trim()) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? null : 'Must be a JSON object';
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid JSON';
  }
}

export function StructuredDataEditor({ value, onChange, disabled }: { value: StructuredDataRow[]; onChange: (rows: StructuredDataRow[]) => void; disabled?: boolean }) {
  const [openJson, setOpenJson] = useState<Set<string>>(() => new Set(value.filter((r) => r.json.trim()).map((r) => r.key)));
  const used = new Set(value.map((r) => r.type));
  const available = TYPES.filter((t) => t === 'Custom' || !used.has(t));
  const update = (key: string, patch: Partial<StructuredDataRow>) => onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (type: StructuredDataType) => {
    const key = `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...value, { key, type, auto: type !== 'Custom', json: type === 'Custom' ? '{\n  "@type": ""\n}' : '' }]);
    if (type === 'Custom') setOpenJson((s) => new Set(s).add(key));
  };
  const toggleJson = (key: string) =>
    setOpenJson((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" leadingIcon={<Plus />} trailingIcon={<ChevronDown />} disabled={disabled}>
          Add type
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
        {available.map((t) => (
          <DropdownMenuItem key={t} onSelect={() => add(t)} className="h-auto py-1.5">
            <span className="flex flex-col">
              <span className="text-sm text-fg">{t}</span>
              <span className="text-xs text-fg-muted">{TYPE_HELP[t]}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong">
          <EmptyState compact icon={<Braces />} title="No structured data" description="Add schema.org types so search engines can show rich results for your business." action={addMenu} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-md border border-border">
            {value.map((r) => {
              const err = jsonError(r.json);
              const showJson = openJson.has(r.key) || !!err;
              return (
                <li key={r.key} className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fg">{r.type}</div>
                      <div className="truncate text-xs text-fg-muted">{TYPE_HELP[r.type]}</div>
                    </div>
                    {r.type !== 'Custom' && <Switch size="sm" checked={r.auto} onCheckedChange={(v) => update(r.key, { auto: v })} disabled={disabled} label={<span className="text-xs text-fg-muted">Auto from site data</span>} className="items-center gap-2" />}
                    <Button size="xs" variant="ghost" leadingIcon={<Braces />} onClick={() => toggleJson(r.key)} aria-expanded={showJson}>
                      {r.json.trim() ? 'Edit JSON' : 'Add JSON'}
                    </Button>
                    <IconButton label={`Remove ${r.type}`} size="xs" variant="ghost" onClick={() => onChange(value.filter((x) => x.key !== r.key))} disabled={disabled}>
                      <Trash2 />
                    </IconButton>
                  </div>
                  {showJson && (
                    <div className="mt-2.5 space-y-1.5">
                      <CodeEditor value={r.json} onChange={(json) => update(r.key, { json })} language="json" minRows={5} maxHeight={320} invalid={!!err} readOnly={disabled} aria-label={`${r.type} JSON-LD data`} placeholder='{ "priceRange": "$$" }' />
                      <p className={err ? 'text-xs text-danger' : 'text-xs text-fg-muted'}>
                        {err ?? (r.auto ? 'Optional. Properties here override the values generated from your site data.' : 'Properties for this type, merged into the JSON-LD block.')}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end">{addMenu}</div>
        </>
      )}
    </div>
  );
}
