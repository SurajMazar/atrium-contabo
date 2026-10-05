'use client';

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createId, SOCIAL_NETWORKS, type SocialLink, type WebsiteDefinition } from '@atrium/schema';
import { Button, cn, EmptyState, FieldGroup, IconButton, Input, Select, Switch, Tooltip } from '@atrium/ui';
import { GripVertical, Plus, Share2, Trash2 } from 'lucide-react';
import { useSession } from '@/lib/session';
import { SaveBar, useReportDirty } from './save-bar';
import { BindingHint, ReadOnlyBanner, SectionHeading, SectionState } from './section-kit';
import { useSettingsForm, type FormErrors, type SettingsForm } from './use-settings-form';

type Network = (typeof SOCIAL_NETWORKS)[number];
const NETWORK_LABEL: Record<Network, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  x: 'X (Twitter)',
  pinterest: 'Pinterest',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  telegram: 'Telegram',
  tripadvisor: 'Tripadvisor',
  github: 'GitHub',
  threads: 'Threads',
  custom: 'Custom',
};
const PLACEHOLDER: Partial<Record<Network, string>> = {
  facebook: 'https://facebook.com/yourpage',
  instagram: 'https://instagram.com/yourhandle',
  whatsapp: 'https://wa.me/15550100199',
  x: 'https://x.com/yourhandle',
  linkedin: 'https://linkedin.com/company/…',
  youtube: 'https://youtube.com/@channel',
};
const NETWORK_OPTIONS = SOCIAL_NETWORKS.map((n) => ({ value: n, label: NETWORK_LABEL[n] ?? n }));

interface SocialForm {
  links: SocialLink[];
}

function read(def: WebsiteDefinition): SocialForm {
  return { links: (def.settings?.social ?? []).map((s) => ({ ...s, label: s.label ?? '', visible: s.visible ?? true, newTab: s.newTab ?? true })) };
}
function write(def: WebsiteDefinition, f: SocialForm) {
  return { settings: { ...def.settings, social: f.links.map((l) => ({ ...l, url: l.url.trim(), label: l.label?.trim() || undefined })) } };
}
function validate(f: SocialForm): FormErrors {
  const e: FormErrors = {};
  for (const l of f.links) {
    const u = l.url.trim();
    if (!u) e[l.id] = 'Add a URL';
    else if (!/^(https?:\/\/|mailto:|tel:)/i.test(u)) e[l.id] = 'Start with https://';
  }
  return e;
}

export function SocialSection({ websiteId }: { websiteId: string }) {
  const f = useSettingsForm({ websiteId, read, write, validate, successMessage: 'Social links saved' });
  return (
    <SectionState isPending={f.isPending} isError={f.isError} error={f.error} onRetry={f.refetch} groups={1}>
      {() => <SocialFields websiteId={websiteId} f={f} />}
    </SectionState>
  );
}

function SocialFields({ websiteId, f }: { websiteId: string; f: SettingsForm<SocialForm> }) {
  const { can } = useSession();
  const canEdit = can('website.update', websiteId);
  useReportDirty(f.dirty);
  const links = f.form!.links;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const setLinks = (next: SocialLink[]) => f.patch({ links: next });
  const update = (id: string, patch: Partial<SocialLink>) => setLinks(links.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = () => {
    const used = new Set(links.map((l) => l.network));
    const network = (SOCIAL_NETWORKS.find((n) => !used.has(n) && n !== 'custom') ?? 'custom') as Network;
    setLinks([...links, { id: createId('soc'), network, url: '', label: '', visible: true, newTab: true }]);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = links.findIndex((l) => l.id === e.active.id);
    const to = links.findIndex((l) => l.id === e.over!.id);
    if (from >= 0 && to >= 0) setLinks(arrayMove(links, from, to));
  };
  const dis = !canEdit;

  return (
    <div>
      <SectionHeading title="Social links" description={<>Profiles shown in social icon blocks, the footer and Organization structured data. Available as <BindingHint path="social" className="text-xs" />.</>} />
      {!canEdit && <ReadOnlyBanner permission="website.update" />}
      <FieldGroup
        title="Profiles"
        description="Drag to change the display order."
        actions={
          links.length > 0 && (
            <Button size="sm" leadingIcon={<Plus />} onClick={add} disabled={dis}>
              Add link
            </Button>
          )
        }
      >
        {links.length === 0 ? (
          <EmptyState compact icon={<Share2 />} title="No social links" description="Add the profiles you want visitors to find." action={<Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={add} disabled={dis}>Add link</Button>} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={links.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ul className="-mx-4 -my-4 divide-y divide-border">
                {links.map((l) => (
                  <SortableRow key={l.id} link={l} error={f.errors[l.id]} disabled={dis} onChange={(p) => update(l.id, p)} onRemove={() => setLinks(links.filter((x) => x.id !== l.id))} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </FieldGroup>
      <SaveBar dirty={f.dirty} saving={f.saving} disabled={dis} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}

function SortableRow({ link, error, disabled, onChange, onRemove }: { link: SocialLink; error?: string; disabled?: boolean; onChange: (p: Partial<SocialLink>) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: link.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('relative bg-surface px-4 py-3', isDragging && 'z-10 shadow-popover')}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${NETWORK_LABEL[link.network]} link`}
          className="mt-1 inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-fg-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <GripVertical className="size-4" strokeWidth={1.5} />
        </button>
        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[160px_minmax(0,1fr)_160px]">
          <Select size="md" value={link.network} onValueChange={(n) => onChange({ network: n as Network })} options={NETWORK_OPTIONS} disabled={disabled} aria-label="Network" />
          <div className="min-w-0">
            <Input value={link.url} onChange={(e) => onChange({ url: e.target.value })} placeholder={PLACEHOLDER[link.network] ?? 'https://'} invalid={!!error && link.url.length > 0} disabled={disabled} aria-label="URL" className="font-mono text-xs" />
            {error && <p className={cn('mt-1 text-xs', link.url ? 'text-danger' : 'text-fg-muted')}>{error}</p>}
          </div>
          <Input value={link.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} placeholder="Label (optional)" disabled={disabled} aria-label="Label" />
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1.5">
          <Tooltip content={link.visible ? 'Shown on the site' : 'Hidden from the site'}>
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <Switch size="sm" checked={link.visible} onCheckedChange={(visible) => onChange({ visible })} disabled={disabled} aria-label="Visible" />
              <span className="hidden lg:inline">Visible</span>
            </span>
          </Tooltip>
          <Tooltip content="Open in a new tab">
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <Switch size="sm" checked={link.newTab} onCheckedChange={(newTab) => onChange({ newTab })} disabled={disabled} aria-label="Open in new tab" />
              <span className="hidden lg:inline">New tab</span>
            </span>
          </Tooltip>
          <IconButton label="Remove link" size="sm" variant="ghost" onClick={onRemove} disabled={disabled} className="-mt-1">
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </li>
  );
}
