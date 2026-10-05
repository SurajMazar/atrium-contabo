'use client';

import { registry } from '@atrium/component-registry';
import type { Template } from '@atrium/sdk';
import type { NodeInput } from '@atrium/schema';
import { useQuery } from '@tanstack/react-query';
import { LayoutTemplate, Loader2, Plus } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { insertTemplate } from '../actions';
import { localSectionPresets, type SectionPreset } from '../lib/section-presets';
import { useEditorStore, usePerms } from '../store/editor';
import { Badge, Empty, Icon, PanelHeader, SearchInput, Segmented } from '../ui/primitives';
import { dragSourceProps } from './drag';

/** Extract a section node from template data (accepts `{ node }`, `{ section }`, `{ sections: [...] }` or a bare node). */
export function templateNode(data: unknown): NodeInput | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const candidate = (d.node ?? d.section ?? (Array.isArray(d.sections) ? d.sections[0] : undefined) ?? d) as Record<string, unknown>;
  return candidate && typeof candidate.type === 'string' ? (candidate as unknown as NodeInput) : null;
}

function toPreset(t: Template): SectionPreset {
  const node = templateNode(t.data);
  return {
    id: `tpl:${t.id}`,
    name: t.name,
    description: t.description ?? '',
    category: t.category ?? (t.organizationId ? 'Saved' : 'Library'),
    icon: (node && registry.get(node.type)?.icon) ?? 'layout-template',
    node: node ?? { type: 'section', props: {} },
    source: 'server',
    thumbnailUrl: t.thumbnailUrl,
    ...(node ? {} : { pending: t.id }),
  } as SectionPreset & { pending?: string };
}

export function SectionsPanel() {
  const [q, setQ] = useState('');
  const [source, setSource] = useState<'all' | 'saved'>('all');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const orgId = useEditorStore((s) => s.organizationId);
  const perms = usePerms();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const templates = useQuery({
    queryKey: qk.templates('SECTION', orgId ?? undefined),
    queryFn: () => api.templates.list({ kind: 'SECTION', organizationId: orgId ?? undefined }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });

  const presets = useMemo(() => {
    const server = (templates.data ?? []).map(toPreset);
    const local = localSectionPresets(registry);
    const all = source === 'saved' ? server.filter((p) => p.category === 'Saved' || p.source === 'server') : [...server, ...local];
    const filtered = all.filter((p) => !dq || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(dq));
    const byCat = new Map<string, SectionPreset[]>();
    for (const p of filtered) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
    return [...byCat.entries()];
  }, [templates.data, dq, source]);

  const insert = async (p: SectionPreset & { pending?: string }) => {
    if (!p.pending) return insertTemplate(p.node, p.name);
    try {
      setLoadingId(p.id);
      const full = await api.templates.get(p.pending);
      const node = templateNode(full.data);
      if (!node) throw new Error('Template has no section content');
      insertTemplate(node, p.name);
    } catch (err) {
      toast.error('Could not insert template', { description: errorMessage(err) });
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Sections">
        <div className="space-y-2 px-3 pb-2.5">
          <SearchInput value={q} onChange={setQ} placeholder="Search sections" />
          <Segmented value={source} onChange={setSource} options={[{ label: 'All', value: 'all' }, { label: 'Saved templates', value: 'saved' }]} />
        </div>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {templates.isLoading && <p className="flex items-center gap-2 px-3 py-2 text-xs text-fg-muted"><Loader2 className="size-3.5 animate-spin" /> Loading templates…</p>}
        {presets.map(([cat, list]) => (
          <div key={cat} className="px-2 pt-3">
            <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{cat}</p>
            <div className="grid grid-cols-1 gap-1.5">
              {list.map((p) => {
                const pending = (p as SectionPreset & { pending?: string }).pending;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!perms.edit || loadingId === p.id}
                    onClick={() => insert(p)}
                    {...dragSourceProps(() => ({ kind: 'template', name: p.name, node: p.node }), perms.edit && !pending)}
                    className="group flex w-full gap-2.5 rounded-md border border-border bg-surface p-1.5 text-left hover:border-border-strong hover:bg-surface-2 disabled:opacity-50"
                  >
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-surface-2 text-fg-subtle">
                        <Icon name={p.icon} size={18} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-[13px] font-medium text-fg">
                        <span className="truncate">{p.name}</span>
                        {p.source === 'server' && <Badge className="shrink-0">Template</Badge>}
                      </span>
                      <span className="line-clamp-2 text-[11px] leading-4 text-fg-muted">{p.description}</span>
                    </span>
                    {loadingId === p.id ? <Loader2 className="size-3.5 shrink-0 animate-spin text-fg-subtle" /> : <Plus className="size-3.5 shrink-0 self-center text-fg-subtle opacity-0 group-hover:opacity-100" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!presets.length && !templates.isLoading && (
          <Empty icon={<LayoutTemplate className="size-6" />} title={source === 'saved' ? 'No saved section templates' : 'No sections found'}>
            {source === 'saved' ? 'Right-click a section on the canvas › Save as section template.' : 'Try a different search term.'}
          </Empty>
        )}
      </div>
    </div>
  );
}
