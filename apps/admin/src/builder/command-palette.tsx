'use client';

import { registry } from '@atrium/component-registry';
import { Command } from 'cmdk';
import {
  Eye, FilePlus, FileText, ImageIcon, Keyboard, Layers, Laptop, Monitor, Palette, Plus, Redo2, Rocket, Search, Settings, Smartphone, Sparkles, Tablet, Undo2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog as D } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { insertComponent } from './actions';
import { askAi } from './ai/store';
import { MOD } from './lib/cn';
import { AddPageDialog, goToPage } from './panels/pages-panel';
import { openPreview } from './persistence/server';
import { SHORTCUTS } from './shortcuts';
import { redo, undo, useDocumentStore } from './store/document';
import { useEditorStore, usePerms } from './store/editor';
import { openLeft, select, setDevice, useUiStore } from './store/ui';
import { Icon, Kbd, Modal } from './ui/primitives';

function Item({ onSelect, icon, children, shortcut, value }: { onSelect: () => void; icon?: ReactNode; children: ReactNode; shortcut?: string; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] text-fg data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-fg-muted"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="font-mono text-[11px] text-fg-subtle">{shortcut}</span>}
    </Command.Item>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group heading={heading} className="px-1.5 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle">
      {children}
    </Command.Group>
  );
}

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const pages = useDocumentStore((s) => s.definition?.pages);
  const websiteId = useEditorStore((s) => s.websiteId);
  const perms = usePerms();
  const router = useRouter();
  const [addingPage, setAddingPage] = useState(false);
  const close = () => useUiStore.setState({ paletteOpen: false });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const catalog = registry.catalog().filter((c) => c.level !== 'site');
  const sections = catalog.filter((c) => c.level === 'section');
  const elements = catalog.filter((c) => c.level !== 'section');

  return (
    <>
      <D.Root open={open} onOpenChange={(o) => useUiStore.setState({ paletteOpen: o })}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-[80] bg-black/25 animate-fade-in" />
          <D.Content className="fixed left-1/2 top-[14vh] z-[81] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-dialog outline-none animate-slide-up">
            <D.Title className="sr-only">Command palette</D.Title>
            <D.Description className="sr-only">Search commands, pages and components</D.Description>
            <Command loop className="flex max-h-[60vh] flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-fg-subtle" />
                <Command.Input autoFocus placeholder="Search commands, pages, components…" className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-subtle" />
                <Kbd>Esc</Kbd>
              </div>
              <Command.List className="min-h-0 flex-1 overflow-y-auto py-1">
                <Command.Empty className="px-4 py-6 text-center text-xs text-fg-muted">No results.</Command.Empty>
                <Group heading="Actions">
                  {perms.createPage && <Item icon={<FilePlus />} onSelect={run(() => setAddingPage(true))}>Add page</Item>}
                  {perms.ai && <Item icon={<Sparkles />} shortcut={`${MOD}J`} onSelect={run(() => { openLeft('ai'); askAi(); })}>Ask AI</Item>}
                  <Item icon={<Eye />} onSelect={run(() => void openPreview())}>Preview draft</Item>
                  {perms.publish && <Item icon={<Rocket />} onSelect={run(() => useUiStore.setState({ publishOpen: true }))}>Publish…</Item>}
                  <Item icon={<Search />} onSelect={run(() => { select(null); useUiStore.setState({ rightOpen: true }); })}>Open page SEO</Item>
                  <Item icon={<Undo2 />} shortcut={`${MOD}Z`} onSelect={run(() => undo())}>Undo</Item>
                  <Item icon={<Redo2 />} shortcut={`${MOD}⇧Z`} onSelect={run(() => redo())}>Redo</Item>
                </Group>
                <Group heading="Panels">
                  <Item icon={<Layers />} onSelect={run(() => openLeft('layers'))}>Toggle layers</Item>
                  <Item icon={<ImageIcon />} onSelect={run(() => openLeft('media'))}>Open media</Item>
                  <Item icon={<Palette />} onSelect={run(() => openLeft('theme'))}>Theme</Item>
                  <Item icon={<Settings />} onSelect={run(() => router.push(`/w/${websiteId}/settings`))}>Site settings</Item>
                  <Item icon={<Keyboard />} shortcut="?" onSelect={run(() => useUiStore.setState({ shortcutsOpen: true }))}>Keyboard shortcuts</Item>
                </Group>
                <Group heading="View">
                  <Item icon={<Monitor />} shortcut="1" onSelect={run(() => setDevice('desktop'))}>Desktop view</Item>
                  <Item icon={<Laptop />} shortcut="2" onSelect={run(() => setDevice('laptop'))}>Laptop view</Item>
                  <Item icon={<Tablet />} shortcut="3" onSelect={run(() => setDevice('tablet'))}>Tablet view</Item>
                  <Item icon={<Smartphone />} shortcut="4" onSelect={run(() => setDevice('mobile'))}>Mobile view</Item>
                </Group>
                <Group heading="Go to page">
                  {(pages ?? []).map((p) => (
                    <Item key={p.id} value={`page ${p.title} /${p.slug}`} icon={<FileText />} onSelect={run(() => goToPage(p.id))}>
                      {p.title} <span className="font-mono text-[11px] text-fg-subtle">/{p.slug}</span>
                    </Item>
                  ))}
                </Group>
                {perms.edit && (
                  <>
                    <Group heading="Add section">
                      {sections.map((c) => (
                        <Item key={c.type} value={`section ${c.name} ${c.description}`} icon={<Icon name={registry.get(c.type)?.icon} />} onSelect={run(() => insertComponent(c.type))}>
                          {c.name}
                        </Item>
                      ))}
                    </Group>
                    <Group heading="Insert element">
                      {elements.map((c) => (
                        <Item key={c.type} value={`element ${c.name} ${c.description}`} icon={<Icon name={registry.get(c.type)?.icon} />} onSelect={run(() => insertComponent(c.type))}>
                          {c.name}
                          <Plus className="ml-1 inline size-3 opacity-0" />
                        </Item>
                      ))}
                    </Group>
                  </>
                )}
              </Command.List>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
      <AddPageDialog open={addingPage} onOpenChange={setAddingPage} />
    </>
  );
}

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const groups = ['General', 'Selection', 'Editing', 'View'] as const;
  return (
    <Modal open={open} onOpenChange={(o) => useUiStore.setState({ shortcutsOpen: o })} title="Keyboard shortcuts" size="md">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{g}</p>
            <ul className="space-y-1">
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-fg-muted">{s.label}</span>
                  <Kbd>{s.keys.replace(/⌘/g, MOD === '⌘' ? '⌘' : 'Ctrl+')}</Kbd>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
