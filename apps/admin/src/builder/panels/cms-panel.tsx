'use client';

import { registry } from '@atrium/component-registry';
import type { CollectionDefinition } from '@atrium/schema';
import { useQuery } from '@tanstack/react-query';
import { Database, ExternalLink, Link2, Plus } from 'lucide-react';
import Link from 'next/link';
import { insertComponent, setBinding } from '../actions';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { findInDef } from '../lib/tree';
import { useDocumentStore } from '../store/document';
import { useEditorStore, usePerms } from '../store/editor';
import { useSelectionStore, useUiStore } from '../store/ui';
import { Badge, Btn, Empty, Icon, PanelHeader } from '../ui/primitives';

const EMPTY: CollectionDefinition[] = [];

export function autoBinding(type: string, c: CollectionDefinition) {
  const def = registry.get(type);
  const map: Record<string, string> = {};
  for (const f of def?.bindable?.itemFields ?? []) {
    const hit = c.fields.find((x) => x.key === f) ?? (f === 'title' || f === 'name' || f === 'heading' ? c.fields.find((x) => x.key === c.titleField) : undefined) ?? (f === 'image' ? c.fields.find((x) => x.type === 'image') : undefined);
    if (hit) map[f] = `{{item.${hit.key}}}`;
  }
  return { collection: c.slug, map, limit: 12 };
}

export function CmsPanel() {
  const collections = useDocumentStore((s) => s.definition?.collections ?? EMPTY);
  const websiteId = useEditorStore((s) => s.websiteId);
  const perms = usePerms();
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selected = useDocumentStore((s) => findInDef(s.definition, s.pageId, selectedId));
  const counts = useQuery({ queryKey: qk.collections(websiteId ?? ''), queryFn: () => api.collections.list(websiteId!), enabled: !!websiteId, staleTime: 60_000 });
  const selDef = selected ? registry.get(selected.type) : undefined;
  const bindableTypes = registry.list().filter((d) => d.bindable && !d.hidden);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="CMS"
        actions={
          <Link href={`/w/${websiteId}/cms`} target="_blank" title="Manage collections" className="flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2">
            <ExternalLink className="size-4" />
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {selected && (
          <div className="mb-3 rounded-md border border-border p-2">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
              <Icon name={selDef?.icon} size={14} /> {selected.name ?? selDef?.name}
            </p>
            {selDef?.bindable ? (
              selected.binding ? (
                <p className="text-[11px] text-fg-muted">
                  Bound to <Badge tone="accent">{selected.binding.collection}</Badge> ·{' '}
                  <button type="button" className="text-accent hover:underline" onClick={() => useUiStore.setState({ inspectorTab: 'advanced', rightOpen: true })}>
                    edit mapping
                  </button>
                </p>
              ) : (
                <p className="text-[11px] text-fg-muted">Choose a collection below to fill its {selDef.bindable.listProp} automatically.</p>
              )
            ) : (
              <p className="text-[11px] text-fg-muted">This element cannot show collection items.</p>
            )}
          </div>
        )}
        {collections.map((c) => {
          const count = counts.data?.find((x) => x.slug === c.slug)?.itemCount ?? c.items.length;
          return (
            <div key={c.id} className="group mb-1 rounded-md border border-border p-2">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.name}</span>
                <span className="text-[11px] text-fg-subtle">{count} items</span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[10px] text-fg-subtle">
                {c.fields.map((f) => f.key).join(' · ')}
              </p>
              {selDef?.bindable && (
                <Btn size="xs" variant="secondary" className="mt-1.5 w-full" disabled={!perms.edit} icon={<Link2 className="size-3" />} onClick={() => setBinding(selected!.id, autoBinding(selected!.type, c))}>
                  Bind selected to {c.name}
                </Btn>
              )}
            </div>
          );
        })}
        {!collections.length && (
          <Empty icon={<Database className="size-6" />} title="No collections yet">
            Collections hold repeatable content like rooms, menus, events or team members.{' '}
            <Link href={`/w/${websiteId}/cms`} target="_blank" className="text-accent hover:underline">
              Create one
            </Link>
          </Empty>
        )}
        {bindableTypes.length > 0 && (
          <div className="mt-3">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Components that show collections</p>
            {bindableTypes.map((d) => (
              <button key={d.type} type="button" disabled={!perms.edit} onClick={() => insertComponent(d.type)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] hover:bg-surface-2 disabled:opacity-50">
                <Icon name={d.icon} size={14} /> <span className="flex-1">{d.name}</span> <Plus className="size-3.5 text-fg-subtle" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
