'use client';

import { slugify, type PageDocument } from '@atrium/schema';
import { Copy, FileText, Home, MoreHorizontal, Plus, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { updatePage } from '../actions';
import { sendAiPrompt } from '../ai/actions';
import { cn } from '../lib/cn';
import { createPage, deletePage, duplicatePage, setHomepage } from '../persistence/server';
import { setPageId, useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { openLeft, select, useUiStore } from '../store/ui';
import { Badge, Btn, CommitInput, IconBtn, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Modal, PanelHeader, Row, SearchInput, TextInput } from '../ui/primitives';

export function goToPage(pageId: string) {
  setPageId(pageId);
  select(null);
}

export function PagesPanel() {
  const pages = useDocumentStore((s) => s.definition?.pages);
  const currentId = useDocumentStore((s) => s.pageId);
  const perms = usePerms();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PageDocument | null>(null);
  const list = useMemo(() => (pages ?? []).filter((p) => !q || `${p.title} ${p.slug}`.toLowerCase().includes(q.toLowerCase())), [pages, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Pages" actions={perms.createPage && <IconBtn label="Add page" onClick={() => setAdding(true)}><Plus /></IconBtn>}>
        {(pages?.length ?? 0) > 6 && (
          <div className="px-3 pb-2.5">
            <SearchInput value={q} onChange={setQ} placeholder="Search pages" />
          </div>
        )}
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {list.map((p) => (
          <div
            key={p.id}
            className={cn('group flex h-9 items-center gap-2 rounded-md px-2 text-[13px]', p.id === currentId ? 'bg-accent-soft text-fg' : 'hover:bg-surface-2')}
          >
            {p.isHomepage ? <Home className="size-4 shrink-0 text-fg-muted" /> : <FileText className="size-4 shrink-0 text-fg-muted" />}
            {renaming === p.id ? (
              <CommitInput
                autoFocus
                value={p.title}
                onCommit={(title) => {
                  if (title.trim() && title !== p.title) updatePage(p.id, { title: title.trim() }, { label: 'Rename page' });
                  setRenaming(null);
                }}
                onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
              />
            ) : (
              <button type="button" className="flex min-w-0 flex-1 flex-col items-start" onClick={() => goToPage(p.id)} onDoubleClick={() => perms.edit && setRenaming(p.id)}>
                <span className="w-full truncate text-left font-medium">{p.title}</span>
                <span className="w-full truncate text-left font-mono text-[10px] leading-3 text-fg-subtle">/{p.slug}</span>
              </button>
            )}
            {p.status !== 'published' && <Badge className="shrink-0">{p.status}</Badge>}
            <Menu>
              <MenuTrigger asChild>
                <button type="button" aria-label="Page actions" className="rounded p-1 text-fg-subtle opacity-0 hover:bg-surface-3 hover:text-fg group-hover:opacity-100 data-[state=open]:opacity-100">
                  <MoreHorizontal className="size-3.5" />
                </button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem icon={<Settings2 />} onSelect={() => { goToPage(p.id); useUiStore.setState({ rightOpen: true }); }}>Page settings & SEO</MenuItem>
                <MenuItem disabled={!perms.edit} onSelect={() => setRenaming(p.id)}>Rename</MenuItem>
                <MenuItem icon={<Copy />} disabled={!perms.createPage} onSelect={() => duplicatePage(p.id)}>Duplicate</MenuItem>
                <MenuItem icon={<Home />} disabled={p.isHomepage || !perms.edit} onSelect={() => setHomepage(p.id)}>Set as homepage</MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} danger disabled={p.isHomepage || !perms.deletePage} onSelect={() => setConfirmDelete(p)}>Delete page</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        ))}
      </div>
      <AddPageDialog open={adding} onOpenChange={setAdding} />
      <Modal
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete “${confirmDelete?.title}”?`}
        description="The page and its versions are removed from the draft. Published versions stay live until you publish again."
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
            <Btn
              variant="primary"
              className="bg-danger hover:bg-danger/90"
              onClick={async () => {
                const p = confirmDelete!;
                setConfirmDelete(null);
                await deletePage(p.id);
              }}
            >
              Delete page
            </Btn>
          </>
        }
      >
        <p className="text-xs text-fg-muted">Undo history is reset after deleting a page.</p>
      </Modal>
    </div>
  );
}

export function AddPageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const perms = usePerms();
  const pages = useDocumentStore((s) => s.definition?.pages);
  const finalSlug = (touched ? slug : slugify(title)).replace(/^\/+/, '');
  const taken = !!pages?.some((p) => p.slug === finalSlug);
  const reset = () => {
    setTitle('');
    setSlug('');
    setTouched(false);
  };
  const submit = async () => {
    if (!title.trim() || !finalSlug || taken) return;
    setBusy(true);
    const id = await createPage({ title: title.trim(), slug: finalSlug });
    setBusy(false);
    if (id) {
      reset();
      onOpenChange(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="New page"
      size="sm"
      footer={
        <>
          {perms.ai && (
            <Btn
              variant="ghost"
              icon={<Sparkles className="size-3.5" />}
              disabled={!title.trim()}
              onClick={() => {
                onOpenChange(false);
                openLeft('ai');
                void sendAiPrompt(`Create a "${title.trim()}" page${finalSlug ? ` at /${finalSlug}` : ''}`, 'page');
                reset();
              }}
            >
              Generate with AI
            </Btn>
          )}
          <span className="flex-1" />
          <Btn variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn variant="primary" disabled={!title.trim() || !finalSlug || taken || busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create page'}
          </Btn>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Row label="Title" stacked>
          <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rooms & Suites" />
        </Row>
        <Row label="URL" stacked>
          <div className="flex items-center gap-1">
            <span className="text-xs text-fg-subtle">/</span>
            <TextInput
              mono
              value={finalSlug}
              onChange={(e) => {
                setTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, '-'));
              }}
            />
          </div>
          {taken && <p className="text-[11px] text-danger">Another page already uses /{finalSlug}</p>}
        </Row>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
