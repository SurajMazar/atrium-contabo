'use client';

import { walkNodes, type LinkObject, type LinkValue } from '@atrium/schema';
import { useMemo } from 'react';
import { useDocumentStore } from '../../store/document';
import { CommitInput, NativeSelect, Switch } from '../../ui/primitives';
import type { ControlProps } from './types';

type Kind = 'page' | 'url' | 'anchor' | 'email' | 'tel' | 'whatsapp' | 'none';

/** Normalize legacy string links (`/rooms`, `#contact`, `https://…`) into a link object for editing. */
export function toLinkObject(v: LinkValue | undefined, pages: Array<{ id: string; slug: string }>): LinkObject | null {
  if (!v) return null;
  if (typeof v !== 'string') return v;
  if (v.startsWith('#')) return { type: 'anchor', anchor: v.slice(1) };
  if (v.startsWith('mailto:')) return { type: 'email', email: v.slice(7) };
  if (v.startsWith('tel:')) return { type: 'tel', phone: v.slice(4) };
  if (v.startsWith('/')) {
    const [path, anchor] = v.split('#');
    const slug = path!.replace(/^\/+|\/+$/g, '');
    const page = pages.find((p) => p.slug === slug);
    if (page) return { type: 'page', pageId: page.id, anchor: anchor || undefined };
  }
  return { type: 'url', href: v };
}

function useLinkTargets() {
  const definition = useDocumentStore((s) => s.definition);
  return useMemo(() => {
    const pages = (definition?.pages ?? []).map((p) => {
      const anchors: string[] = [];
      walkNodes(p.sections, (n) => {
        if (n.anchor) anchors.push(n.anchor);
      });
      return { id: p.id, title: p.title, slug: p.slug, anchors };
    });
    return { pages };
  }, [definition?.pages]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function LinkField({ value, onChange, disabled }: { value: LinkValue | undefined; onChange: (v: LinkValue | undefined) => void; disabled?: boolean }) {
  const { pages } = useLinkTargets();
  const currentPageId = useDocumentStore((s) => s.pageId);
  const link = toLinkObject(value, pages);
  const kind: Kind = (link?.type as Kind) ?? 'none';

  const setKind = (k: Kind) => {
    if (k === kind) return;
    switch (k) {
      case 'none': return onChange(undefined);
      case 'page': return onChange({ type: 'page', pageId: pages[0]?.id ?? '' });
      case 'url': return onChange({ type: 'url', href: 'https://' });
      case 'anchor': return onChange({ type: 'anchor', anchor: pages.find((p) => p.id === currentPageId)?.anchors[0] ?? '' });
      case 'email': return onChange({ type: 'email', email: '' });
      case 'tel': return onChange({ type: 'tel', phone: '' });
      case 'whatsapp': return onChange({ type: 'whatsapp', phone: '' });
    }
  };

  const anchorsFor = (pageId: string | undefined) => pages.find((p) => p.id === pageId)?.anchors ?? [];

  return (
    <div className="space-y-1.5">
      <NativeSelect
        value={kind}
        disabled={disabled}
        onChange={(v) => setKind(v as Kind)}
        options={[
          { label: 'No link', value: 'none' },
          { label: 'Page', value: 'page' },
          { label: 'Section on this page', value: 'anchor' },
          { label: 'Web address (URL)', value: 'url' },
          { label: 'Email', value: 'email' },
          { label: 'Phone', value: 'tel' },
          { label: 'WhatsApp', value: 'whatsapp' },
        ]}
      />
      {link?.type === 'page' && (
        <>
          <NativeSelect value={link.pageId} disabled={disabled} onChange={(pageId) => onChange({ ...link, pageId, anchor: undefined })} options={pages.map((p) => ({ label: `${p.title} (/${p.slug})`, value: p.id }))} />
          {anchorsFor(link.pageId).length > 0 && (
            <NativeSelect
              value={link.anchor ?? ''}
              placeholder="Top of page"
              disabled={disabled}
              onChange={(a) => onChange({ ...link, anchor: a || undefined })}
              options={anchorsFor(link.pageId).map((a) => ({ label: `#${a}`, value: a }))}
            />
          )}
          <NewTab checked={!!link.newTab} onChange={(newTab) => onChange({ ...link, newTab: newTab || undefined })} disabled={disabled} />
        </>
      )}
      {link?.type === 'anchor' && (
        anchorsFor(currentPageId ?? undefined).length ? (
          <NativeSelect value={link.anchor} disabled={disabled} onChange={(anchor) => onChange({ type: 'anchor', anchor })} options={anchorsFor(currentPageId ?? undefined).map((a) => ({ label: `#${a}`, value: a }))} />
        ) : (
          <CommitInput value={link.anchor} placeholder="anchor-id (set in Advanced › Anchor)" disabled={disabled} onCommit={(anchor) => onChange({ type: 'anchor', anchor: anchor.replace(/^#/, '') })} />
        )
      )}
      {link?.type === 'url' && (
        <>
          <CommitInput value={link.href} placeholder="https://example.com" disabled={disabled} onCommit={(href) => onChange({ ...link, href })} />
          <NewTab checked={!!link.newTab} onChange={(newTab) => onChange({ ...link, newTab: newTab || undefined })} disabled={disabled} />
        </>
      )}
      {link?.type === 'email' && (
        <>
          <CommitInput value={link.email} type="email" placeholder="hello@example.com" disabled={disabled} onCommit={(email) => onChange({ ...link, email })} />
          <CommitInput value={link.subject ?? ''} placeholder="Subject (optional)" disabled={disabled} onCommit={(subject) => onChange({ ...link, subject: subject || undefined })} />
        </>
      )}
      {link?.type === 'tel' && <CommitInput value={link.phone} type="tel" placeholder="+1 555 0100" disabled={disabled} onCommit={(phone) => onChange({ ...link, phone })} />}
      {link?.type === 'whatsapp' && (
        <>
          <CommitInput value={link.phone} type="tel" placeholder="WhatsApp number with country code" disabled={disabled} onCommit={(phone) => onChange({ ...link, phone })} />
          <CommitInput value={link.message ?? ''} placeholder="Prefilled message (optional)" disabled={disabled} onCommit={(message) => onChange({ ...link, message: message || undefined })} />
        </>
      )}
      {link?.type === 'collection-item' && <p className="text-xs text-fg-muted">Collection item: {link.collection}/{link.slug}</p>}
    </div>
  );
}

function NewTab({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex h-6 items-center justify-between text-xs text-fg-muted">
      Open in new tab
      <Switch checked={checked} onChange={onChange} disabled={disabled} label="Open in new tab" />
    </label>
  );
}

export function LinkControl({ value, onChange, disabled }: ControlProps<LinkValue | undefined>) {
  return <LinkField value={value} onChange={onChange} disabled={disabled} />;
}
