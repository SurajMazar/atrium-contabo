'use client';

import type { CollectionField } from '@atrium/schema';
import type { Collection, CollectionItemDto } from '@atrium/sdk';
import { Banner, Combobox, type ComboboxOption } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useDebounced } from '@/lib/use-debounced';
import { asStatus, itemTitle, STATUS_META } from './values';

function readIds(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => (typeof x === 'string' ? [x] : x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' ? [(x as { id: string }).id] : []));
  if (typeof v === 'string' && v) return [v];
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return [(v as { id: string }).id];
  return [];
}

/** Single or multiple reference picker over a target collection (by slug). Stores item ids. */
export function RelationInput({ field, value, onChange, collections, invalid, id, disabled }: { field: CollectionField; value: unknown; onChange: (v: unknown) => void; collections: Collection[]; invalid?: boolean; id?: string; disabled?: boolean }) {
  const api = useApi();
  const multiple = field.type === 'multirelation';
  const target = collections.find((c) => c.slug === field.relation);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const labels = useRef(new Map<string, string>());
  const [, force] = useState(0);
  const selected = readIds(value);

  // First page without a search: resolves labels for most selected values.
  const base = useQuery({
    queryKey: qk.collectionItems(target?.id ?? '', { picker: true, search: '' }),
    queryFn: () => api.collections.items(target!.id, { limit: 100 }),
    enabled: !!target,
    staleTime: 30_000,
  });
  const results = useQuery({
    queryKey: qk.collectionItems(target?.id ?? '', { picker: true, search: debounced }),
    queryFn: () => api.collections.items(target!.id, { search: debounced, limit: 30 }),
    enabled: !!target && !!debounced,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!target) return;
    let added = false;
    for (const page of [base.data, results.data]) {
      for (const it of page?.items ?? []) {
        const label = itemTitle(it, target.fields, target.titleField);
        if (labels.current.get(it.id) !== label) {
          labels.current.set(it.id, label);
          added = true;
        }
      }
    }
    if (added) force((n) => n + 1);
  }, [base.data, results.data, target]);

  const options = useMemo<ComboboxOption[]>(() => {
    if (!target) return [];
    const source: CollectionItemDto[] = (debounced ? results.data?.items : base.data?.items) ?? [];
    const out = new Map<string, ComboboxOption>();
    for (const sid of selected) out.set(sid, { value: sid, label: labels.current.get(sid) ?? `Item ${sid.slice(-6)}` });
    for (const it of source) {
      const status = asStatus(it.status);
      out.set(it.id, { value: it.id, label: itemTitle(it, target.fields, target.titleField), description: status === 'published' ? undefined : STATUS_META[status].label });
    }
    return [...out.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, debounced, results.data, base.data, selected.join('|'), labels.current.size]);

  if (!field.relation) return <Banner tone="warning">This reference field has no target collection. Set one in the schema.</Banner>;
  if (!target) return <Banner tone="warning">The referenced collection “{field.relation}” no longer exists.</Banner>;

  const common = {
    id,
    options,
    invalid,
    disabled,
    loading: debounced ? results.isFetching && !results.data : base.isPending,
    onSearch: setSearch,
    placeholder: multiple ? `Choose ${target.name.toLowerCase()}` : `Choose ${(target.singularName || target.name).toLowerCase()}`,
    searchPlaceholder: `Search ${target.name.toLowerCase()}`,
    emptyText: debounced ? 'No matching items' : 'No items in this collection',
  };

  return multiple ? (
    <Combobox {...common} multiple value={selected} onChange={(v) => onChange(v.length ? v : null)} />
  ) : (
    <Combobox {...common} value={selected[0] ?? null} clearable onChange={(v) => onChange(v)} />
  );
}
