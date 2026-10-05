'use client';

import type { ButtonSpec } from '@atrium/component-registry';
import { ExternalLink, ListTree } from 'lucide-react';
import Link from 'next/link';
import { useDocumentStore } from '../../store/document';
import { useEditorStore } from '../../store/editor';
import { openLeft } from '../../store/ui';
import { Btn, CommitInput, NativeSelect, Row } from '../../ui/primitives';
import { IconPicker } from './icon';
import { LinkField } from './link';
import type { ControlProps } from './types';

const EMPTY: never[] = [];

export function FormControl({ value, onChange, disabled }: ControlProps<string | undefined>) {
  const forms = useDocumentStore((s) => s.definition?.forms ?? EMPTY);
  const websiteId = useEditorStore((s) => s.websiteId);
  return (
    <div className="space-y-1">
      <NativeSelect value={value} disabled={disabled} placeholder={forms.length ? 'Choose a form' : 'No forms yet'} onChange={(v) => onChange(v || undefined)} options={forms.map((f) => ({ label: f.name, value: f.id }))} />
      <Link href={`/w/${websiteId}/forms`} target="_blank" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
        {forms.length ? 'Manage forms' : 'Create a form'} <ExternalLink className="size-3" />
      </Link>
    </div>
  );
}

export function CollectionControl({ value, onChange, disabled }: ControlProps<string | undefined>) {
  const collections = useDocumentStore((s) => s.definition?.collections ?? EMPTY);
  const websiteId = useEditorStore((s) => s.websiteId);
  return (
    <div className="space-y-1">
      <NativeSelect value={value} disabled={disabled} placeholder={collections.length ? 'Choose a collection' : 'No collections yet'} onChange={(v) => onChange(v || undefined)} options={collections.map((c) => ({ label: c.name, value: c.slug }))} />
      {!collections.length && (
        <Link href={`/w/${websiteId}/cms`} target="_blank" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
          Create a collection <ExternalLink className="size-3" />
        </Link>
      )}
    </div>
  );
}

export function MenuControl({ value, onChange, disabled }: ControlProps<string | undefined>) {
  const menus = useDocumentStore((s) => s.definition?.navigation.menus);
  const keys = Object.keys(menus ?? {});
  return (
    <div className="flex items-center gap-1">
      <NativeSelect className="flex-1" value={value} disabled={disabled} placeholder="No menu" onChange={(v) => onChange(v || undefined)} options={keys.map((k) => ({ label: `${k} (${menus![k]!.length})`, value: k }))} />
      <Btn size="sm" variant="ghost" className="w-7 px-0" title="Edit menus" onClick={() => openLeft('navigation')}>
        <ListTree />
      </Btn>
    </div>
  );
}

const STYLES = ['primary', 'secondary', 'outline', 'ghost', 'link'] as const;

/** Composite CTA editor (label + link + style + icon). */
export function ButtonControl({ value, onChange, disabled }: ControlProps<Partial<ButtonSpec> | undefined>) {
  const v = value ?? {};
  const set = (patch: Partial<ButtonSpec>) => onChange({ label: v.label ?? 'Button', style: v.style ?? 'primary', iconPosition: v.iconPosition ?? 'end', ...v, ...patch } as ButtonSpec);
  return (
    <div className="space-y-1.5 rounded-md border border-border p-2">
      <Row label="Label">
        <CommitInput value={v.label ?? ''} disabled={disabled} onCommit={(label) => set({ label })} />
      </Row>
      <Row label="Style">
        <NativeSelect value={v.style ?? 'primary'} disabled={disabled} onChange={(style) => set({ style: style as ButtonSpec['style'] })} options={STYLES.map((s) => ({ label: s[0]!.toUpperCase() + s.slice(1), value: s }))} />
      </Row>
      <Row label="Icon">
        <IconPicker value={v.icon} disabled={disabled} onChange={(icon) => set({ icon })} />
      </Row>
      <Row label="Link" stacked>
        <LinkField value={v.link} disabled={disabled} onChange={(link) => set({ link })} />
      </Row>
      {value && (
        <Btn size="xs" variant="danger" disabled={disabled} onClick={() => onChange(undefined)}>
          Remove button
        </Btn>
      )}
    </div>
  );
}
