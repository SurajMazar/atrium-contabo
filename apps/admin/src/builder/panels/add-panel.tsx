'use client';

import { COMPONENT_CATEGORIES, registry } from '@atrium/component-registry';
import { Plus } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { insertComponent } from '../actions';
import { cn } from '../lib/cn';
import { usePerms } from '../store/editor';
import { useSelectionStore } from '../store/ui';
import { Empty, Icon, PanelHeader, SearchInput } from '../ui/primitives';
import { dragSourceProps } from './drag';

const CATEGORY_LABEL: Record<string, string> = {
  structure: 'Layout', content: 'Basic', media: 'Media', marketing: 'Marketing', hospitality: 'Hospitality', contact: 'Contact', forms: 'Forms',
  advanced: 'Advanced', collection: 'CMS', site: 'Site',
};

/** Element picker: every registered component by category; drag onto the canvas or click to insert after the selection. */
export function AddPanel() {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const perms = usePerms();
  const hasSelection = useSelectionStore((s) => !!s.selectedId);
  const groups = useMemo(() => {
    const list = registry.catalog().filter((c) => c.level !== 'site');
    const match = (c: (typeof list)[number]) => !dq || `${c.name} ${c.type} ${c.description} ${c.category}`.toLowerCase().includes(dq);
    return COMPONENT_CATEGORIES.map((cat) => ({ cat, items: list.filter((c) => c.category === cat && match(c)) })).filter((g) => g.items.length);
  }, [dq]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Add elements">
        <div className="px-3 pb-2.5">
          <SearchInput value={q} onChange={setQ} placeholder="Search elements" />
        </div>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <p className="px-3 pt-2.5 text-[11px] leading-4 text-fg-subtle">Drag onto the canvas, or click to insert {hasSelection ? 'after the selection' : 'at the end of the page'}.</p>
        {groups.map((g) => (
          <div key={g.cat} className="px-2 pt-3">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{CATEGORY_LABEL[g.cat] ?? g.cat}</p>
            <div className="space-y-px">
              {g.items.map((c) => {
                const def = registry.get(c.type)!;
                return (
                  <button
                    key={c.type}
                    type="button"
                    disabled={!perms.edit}
                    title={c.description}
                    onClick={() => insertComponent(c.type)}
                    {...dragSourceProps(() => ({ kind: 'component', type: c.type }), perms.edit)}
                    className={cn('group flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-surface-2 disabled:opacity-50', perms.edit && 'cursor-grab active:cursor-grabbing')}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-fg-muted group-hover:text-fg">
                      <Icon name={def.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                        {c.name}
                        {c.level === 'section' && <span className="rounded bg-surface-2 px-1 text-[10px] font-normal text-fg-subtle">Section</span>}
                      </span>
                      <span className="line-clamp-1 text-[11px] text-fg-muted">{c.description}</span>
                    </span>
                    <Plus className="size-3.5 shrink-0 text-fg-subtle opacity-0 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!groups.length && <Empty title="No elements found">Try a different search term.</Empty>}
      </div>
    </div>
  );
}
