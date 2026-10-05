'use client';

import { registry } from '@atrium/component-registry';
import type { CollectionBinding, Condition, Node } from '@atrium/schema';
import { Check, Copy, Database, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { editNode, renameNode, setBinding, setVisibility, updateNode } from '../actions';
import { cn } from '../lib/cn';
import { useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { Btn, CommitInput, Group, NativeSelect, NumberInput, Row } from '../ui/primitives';

const EMPTY: never[] = [];

export function AdvancedTab({ node, disabled }: { node: Node; disabled?: boolean }) {
  const perms = usePerms();
  const def = registry.get(node.type);
  const locales = useDocumentStore((s) => s.definition?.settings.localization.locales ?? EMPTY);
  const [anchorError, setAnchorError] = useState<string | null>(null);

  return (
    <>
      <Group id="adv-identity" title="Element">
        <Row label="Name">
          <CommitInput value={node.name ?? ''} placeholder={def?.name ?? node.type} disabled={disabled} onCommit={(v) => renameNode(node.id, v)} />
        </Row>
        <Row label="Anchor ID" help="Link to this element with #anchor (e.g. #rooms).">
          <div className="space-y-1">
            <CommitInput
              value={node.anchor ?? ''}
              placeholder="e.g. rooms"
              disabled={disabled}
              mono
              onCommit={(v) => {
                const clean = v.trim().replace(/^#/, '');
                if (clean && !/^[a-zA-Z][\w-]*$/.test(clean)) {
                  setAnchorError('Start with a letter; use letters, numbers, - and _ only');
                  return;
                }
                setAnchorError(null);
                updateNode(node.id, 'Set anchor', { anchor: clean || null });
              }}
            />
            {anchorError && <p className="text-[11px] text-danger">{anchorError}</p>}
          </div>
        </Row>
        <Row label="Type">
          <span className="font-mono text-xs text-fg-muted">
            {node.type}
            {node.variant ? ` · ${node.variant}` : ''}
          </span>
        </Row>
      </Group>

      {perms.code && (
      <Group id="adv-css" title="Custom CSS" defaultOpen={!!node.customCss}>
        <CommitInput
          multiline
          mono
          rows={6}
          value={node.customCss ?? ''}
          disabled={disabled}
          placeholder={'& { letter-spacing: .02em; }\n& img { filter: grayscale(1); }'}
          onCommit={(v) => updateNode(node.id, 'Edit custom CSS', { customCss: v.trim() ? v : null })}
        />
        <p className="text-[11px] leading-4 text-fg-subtle">
          <code className="font-mono">&amp;</code> refers to this element; rules are scoped automatically.
        </p>
      </Group>
      )}

      <Group id="adv-schedule" title="Visibility schedule" defaultOpen={!!(node.visibility?.from || node.visibility?.until || node.visibility?.locales?.length)}>
        <Row label="Show from">
          <DateTime value={node.visibility?.from} disabled={disabled} onChange={(from) => setVisibility(node.id, (v) => (v.from = from))} />
        </Row>
        <Row label="Hide after">
          <DateTime value={node.visibility?.until} disabled={disabled} onChange={(until) => setVisibility(node.id, (v) => (v.until = until))} />
        </Row>
        {locales.length > 1 && (
          <Row label="Languages" stacked help="Leave all unchecked to show in every language.">
            <div className="flex flex-wrap gap-1">
              {locales.map((l) => {
                const on = node.visibility?.locales?.includes(l) ?? false;
                return (
                  <button
                    key={l}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setVisibility(node.id, (v) => {
                        const set = new Set(v.locales ?? []);
                        if (on) set.delete(l);
                        else set.add(l);
                        v.locales = set.size ? [...set] : undefined;
                      })
                    }
                    className={cn('flex h-6 items-center gap-1 rounded-md border px-2 text-xs', on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-fg-muted hover:bg-surface-2')}
                  >
                    {on && <Check className="size-3" />}
                    {l.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </Row>
        )}
      </Group>

      {def?.bindable && <BindingEditor node={node} disabled={disabled} />}

      {node.translations && Object.keys(node.translations).length > 0 && (
        <Group id="adv-translations" title="Translations" defaultOpen={false}>
          {Object.entries(node.translations).map(([locale, props]) => (
            <div key={locale} className="flex items-center justify-between text-xs">
              <span>
                {locale.toUpperCase()} · {Object.keys(props).length} props
              </span>
              <Btn size="xs" variant="danger" disabled={disabled} onClick={() => editNode(node.id, 'Remove translation', (n) => void delete n.translations?.[locale])}>
                Remove
              </Btn>
            </div>
          ))}
        </Group>
      )}

      <Group id="adv-json" title="JSON" defaultOpen={false}>
        <JsonView value={node} />
      </Group>
    </>
  );
}

function DateTime({ value, onChange, disabled }: { value: string | undefined; onChange: (v: string | undefined) => void; disabled?: boolean }) {
  const local = value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return (
    <input
      type="datetime-local"
      value={local}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
      className="h-7 w-full rounded-md border border-border bg-surface px-2 text-xs text-fg outline-none focus:border-accent"
    />
  );
}

export function JsonView({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="relative">
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-surface-2 p-2 font-mono text-[11px] leading-4 text-fg-muted">{text}</pre>
      <Btn
        size="xs"
        variant="secondary"
        className="absolute right-1.5 top-1.5"
        icon={<Copy className="size-3" />}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => toast.success('JSON copied'));
        }}
      >
        Copy
      </Btn>
    </div>
  );
}

const OPS: Array<{ label: string; value: Condition['op'] }> = [
  { label: 'is', value: 'eq' }, { label: 'is not', value: 'neq' }, { label: 'contains', value: 'contains' }, { label: '>', value: 'gt' },
  { label: '<', value: 'lt' }, { label: 'is set', value: 'notEmpty' }, { label: 'is empty', value: 'empty' },
];

/** CMS binding: list prop ← collection items with field mapping `{{item.field}}`. */
export function BindingEditor({ node, disabled }: { node: Node; disabled?: boolean }) {
  const def = registry.get(node.type)!;
  const collections = useDocumentStore((s) => s.definition?.collections ?? EMPTY);
  const b = node.binding;
  const col = collections.find((c) => c.slug === b?.collection);
  const fields = col ? [{ key: 'slug', label: 'Slug' }, ...col.fields.map((f) => ({ key: f.key, label: f.label }))] : [];
  const itemFields = def.bindable!.itemFields;
  const set = (patch: Partial<CollectionBinding>) => b && setBinding(node.id, { ...b, ...patch });
  const cond = b?.filter?.conditions[0] as Condition | undefined;

  return (
    <Group id="adv-binding" title="CMS binding" defaultOpen={!!b} actions={b ? <Database className="size-3.5 text-accent" /> : undefined}>
      <p className="text-[11px] leading-4 text-fg-muted">
        Fill <b>{def.bindable!.listProp}</b> from a collection. Each item’s fields map to the list item props.
      </p>
      <Row label="Collection">
        <NativeSelect
          value={b?.collection}
          disabled={disabled}
          placeholder={collections.length ? 'Not bound' : 'No collections'}
          options={collections.map((c) => ({ label: c.name, value: c.slug }))}
          onChange={(slug) => {
            if (!slug) return setBinding(node.id, undefined);
            const c = collections.find((x) => x.slug === slug)!;
            // Auto-map item props to same-named fields.
            const map: Record<string, string> = {};
            for (const f of itemFields) {
              const hit = c.fields.find((x) => x.key === f) ?? (f === 'title' || f === 'name' ? c.fields.find((x) => x.key === c.titleField) : undefined);
              if (hit) map[f] = `{{item.${hit.key}}}`;
            }
            setBinding(node.id, { collection: slug, map, limit: b?.limit ?? 12 });
          }}
        />
      </Row>
      {b && col && (
        <>
          <Row label="Limit">
            <NumberInput value={b.limit} min={1} max={200} disabled={disabled} placeholder="All" onCommit={(limit) => set({ limit })} />
          </Row>
          <Row label="Sort by">
            <div className="flex gap-1">
              <NativeSelect className="flex-1" value={b.sort?.field} placeholder="Manual order" disabled={disabled} options={fields.map((f) => ({ label: f.label, value: f.key }))} onChange={(field) => set({ sort: field ? { field, direction: b.sort?.direction ?? 'asc' } : undefined })} />
              {b.sort && (
                <NativeSelect className="w-20" value={b.sort.direction} disabled={disabled} options={[{ label: 'Asc', value: 'asc' }, { label: 'Desc', value: 'desc' }]} onChange={(d) => set({ sort: { ...b.sort!, direction: d as 'asc' | 'desc' } })} />
              )}
            </div>
          </Row>
          <Row label="Filter" stacked>
            <div className="flex gap-1">
              <NativeSelect className="flex-1" value={cond?.field} placeholder="No filter" disabled={disabled} options={fields.map((f) => ({ label: f.label, value: f.key }))} onChange={(field) => set({ filter: field ? { match: 'all', conditions: [{ field, op: cond?.op ?? 'eq', value: cond?.value }] } : undefined })} />
              {cond && (
                <NativeSelect className="w-24" value={cond.op} disabled={disabled} options={OPS} onChange={(op) => set({ filter: { match: 'all', conditions: [{ ...cond, op: op as Condition['op'] }] } })} />
              )}
            </div>
            {cond && cond.op !== 'empty' && cond.op !== 'notEmpty' && (
              <CommitInput value={String(cond.value ?? '')} placeholder="Value" disabled={disabled} onCommit={(value) => set({ filter: { match: 'all', conditions: [{ ...cond, value }] } })} />
            )}
          </Row>
          <div className="space-y-1.5 rounded-md border border-border p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Field mapping</p>
            {itemFields.map((prop) => {
              const tpl = b.map[prop] ?? '';
              const m = /^\{\{\s*item\.([\w.]+)\s*\}\}$/.exec(tpl);
              return (
                <Row key={prop} label={prop}>
                  <NativeSelect
                    value={m ? m[1] : tpl ? '__custom' : ''}
                    placeholder="Not mapped"
                    disabled={disabled}
                    options={[...fields.map((f) => ({ label: f.label, value: f.key })), ...(tpl && !m ? [{ label: tpl, value: '__custom' }] : [])]}
                    onChange={(key) => {
                      const map = { ...b.map };
                      if (!key) delete map[prop];
                      else if (key !== '__custom') map[prop] = `{{item.${key}}}`;
                      set({ map });
                    }}
                  />
                </Row>
              );
            })}
          </div>
          <Btn size="xs" variant="danger" disabled={disabled} icon={<Trash2 className="size-3" />} onClick={() => setBinding(node.id, undefined)}>
            Remove binding
          </Btn>
        </>
      )}
    </Group>
  );
}
