'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Braces, Check, ChevronDown, Command, Eye, FileText, Home, Laptop, Monitor, PanelLeft, PanelRight, Play, Redo2, Rocket, Search, Smartphone, Tablet, Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { cn, MOD, SHIFT } from '../lib/cn';
import { DEVICES } from '../lib/devices';
import { goToPage } from '../panels/pages-panel';
import { openPreview } from '../persistence/server';
import { redo, undo, useDocumentStore } from '../store/document';
import { useEditorStore, usePerms } from '../store/editor';
import { selectFrameWidth, selectZoom, setCustomWidth, setDevice, setZoom, useUiStore, useViewportStore } from '../store/ui';
import { Btn, IconBtn, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, NumberInput, Popover, PopoverClose, PopoverContent, PopoverTrigger, SearchInput, Tip } from '../ui/primitives';
import { canvasScripts } from '../canvas/site-scripts/use-site-scripts';
import { SaveIndicator } from './save-indicator';

const DEVICE_ICON = { monitor: Monitor, laptop: Laptop, tablet: Tablet, smartphone: Smartphone } as const;

function SiteSwitcher() {
  const website = useEditorStore((s) => s.website);
  const orgId = useEditorStore((s) => s.organizationId);
  const router = useRouter();
  const sites = useQuery({ queryKey: qk.websites(orgId ?? ''), queryFn: () => api.websites.list(orgId!), enabled: !!orgId, staleTime: 60_000 });
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="flex h-7 max-w-44 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-2">
          <span className="truncate">{website?.name ?? 'Website'}</span>
          <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
        </button>
      </MenuTrigger>
      <MenuContent className="w-60">
        <MenuItem icon={<ArrowLeft />} onSelect={() => router.push(`/w/${website?.id}`)}>
          Back to dashboard
        </MenuItem>
        <MenuItem onSelect={() => router.push(`/w/${website?.id}/settings`)}>Site settings</MenuItem>
        {(sites.data?.length ?? 0) > 1 && (
          <>
            <MenuSeparator />
            <MenuLabel>Switch website</MenuLabel>
            {sites.data!.map((s) => (
              <MenuItem key={s.id} icon={s.id === website?.id ? <Check /> : <span className="size-4" />} onSelect={() => s.id !== website?.id && router.push(`/w/${s.id}/editor`)}>
                {s.name}
              </MenuItem>
            ))}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

function PageSwitcher() {
  const pages = useDocumentStore((s) => s.definition?.pages);
  const current = useDocumentStore((s) => s.definition?.pages.find((p) => p.id === s.pageId));
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.toLowerCase());
  const list = (pages ?? []).filter((p) => !dq || `${p.title} ${p.slug}`.toLowerCase().includes(dq));
  return (
    <Popover onOpenChange={(o) => !o && setQ('')}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-7 max-w-52 items-center gap-1.5 rounded-md px-2 text-[13px] outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-2">
          {current?.isHomepage ? <Home className="size-3.5 text-fg-muted" /> : <FileText className="size-3.5 text-fg-muted" />}
          <span className="truncate">{current?.title ?? 'Page'}</span>
          <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5">
        <SearchInput value={q} onChange={setQ} placeholder="Go to page…" autoFocus />
        <div className="mt-1 max-h-72 overflow-y-auto">
          {list.map((p) => (
            <PopoverClose asChild key={p.id}>
              <button type="button" onClick={() => goToPage(p.id)} className={cn('flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-surface-2 focus-visible:bg-surface-2', p.id === current?.id && 'bg-accent-soft hover:bg-accent-soft')}>
                {p.isHomepage ? <Home className="size-3.5 text-fg-muted" /> : <FileText className="size-3.5 text-fg-muted" />}
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="truncate font-mono text-[10px] text-fg-subtle">/{p.slug}</span>
              </button>
            </PopoverClose>
          ))}
          {!list.length && <p className="px-2 py-3 text-xs text-fg-muted">No pages match.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DeviceSwitcher() {
  const device = useViewportStore((s) => s.device);
  const width = useViewportStore(selectFrameWidth);
  return (
    <div className="flex items-center gap-0.5">
      <div className="flex gap-px rounded-md bg-seg p-0.5">
        {DEVICES.map((d) => {
          const Icon = DEVICE_ICON[d.icon];
          return (
            <Tip key={d.id} content={`${d.label} · ${d.width}px`} shortcut={d.shortcut}>
              <button
                type="button"
                aria-label={d.label}
                aria-pressed={device === d.id}
                onClick={() => setDevice(d.id)}
                className={cn('flex h-6 w-7 items-center justify-center rounded-[calc(var(--radius-md)-2px)] text-fg-muted outline-none transition-colors duration-75 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[15px]', device === d.id && 'bg-seg-on text-fg shadow-sm')}
              >
                <Icon className="size-4" />
              </button>
            </Tip>
          );
        })}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Canvas width" className={cn('flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs tabular-nums text-fg-muted outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-2', device === 'custom' && 'text-accent')}>
            {width}
            <ChevronDown className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 space-y-2">
          <p className="text-xs font-medium">Custom width</p>
          <NumberInput value={width} min={320} max={2560} unit="px" onCommit={(v) => v && setCustomWidth(v)} />
          <div className="flex flex-wrap gap-1">
            {[360, 414, 768, 1024, 1366, 1920].map((w) => (
              <Btn key={w} size="xs" variant="subtle" onClick={() => setCustomWidth(w)}>
                {w}
              </Btn>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ZoomMenu() {
  const zoom = useViewportStore(selectZoom);
  const mode = useViewportStore((s) => s.zoom);
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label="Zoom" className="flex h-7 w-14 items-center justify-center gap-0.5 rounded-md text-xs tabular-nums text-fg-muted outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-2">
          {Math.round(zoom * 100)}%
          <ChevronDown className="size-3" />
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={mode === 'fit' ? <Check /> : <span className="size-4" />} onSelect={() => setZoom('fit')}>
          Zoom to fit
        </MenuItem>
        {[0.5, 0.75, 1, 1.25].map((z) => (
          <MenuItem key={z} icon={mode === z ? <Check /> : <span className="size-4" />} onSelect={() => setZoom(z)}>
            {z * 100}%
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function HistoryButtons() {
  const canUndo = useDocumentStore((s) => s.canUndo);
  const canRedo = useDocumentStore((s) => s.canRedo);
  const undoLabel = useDocumentStore((s) => s.undoLabel);
  const redoLabel = useDocumentStore((s) => s.redoLabel);
  return (
    <div className="flex items-center">
      <IconBtn label={canUndo ? `Undo ${undoLabel ?? ''}`.trim() : 'Nothing to undo'} shortcut={`${MOD}Z`} disabled={!canUndo} onClick={() => undo()}>
        <Undo2 />
      </IconBtn>
      <IconBtn label={canRedo ? `Redo ${redoLabel ?? ''}`.trim() : 'Nothing to redo'} shortcut={`${MOD}${SHIFT}Z`} disabled={!canRedo} onClick={() => redo()}>
        <Redo2 />
      </IconBtn>
    </div>
  );
}

/** Shown when the site has scripts the canvas mirrors: switch between the published look and the bare Atrium page. */
function SiteScriptsToggle() {
  const has = useDocumentStore((s) => canvasScripts(s.definition).length > 0);
  const on = useViewportStore((s) => s.siteScripts);
  if (!has) return null;
  return (
    <Tip content={on ? 'Site scripts shown: the canvas includes what the site’s scripts build on the published page. Click to see the page without them.' : 'Site scripts hidden: click to show what they build on the published page.'}>
      <Btn size="sm" variant="ghost" active={on} className="w-7 px-0" aria-label="Show site scripts" aria-pressed={on} onClick={() => useViewportStore.setState({ siteScripts: !on })}>
        <Braces />
      </Btn>
    </Tip>
  );
}

export function Toolbar() {
  const perms = usePerms();
  const websiteId = useEditorStore((s) => s.websiteId);
  const play = useViewportStore((s) => s.playAnimations);
  const leftOpen = useUiStore((s) => s.leftOpen);
  const rightOpen = useUiStore((s) => s.rightOpen);
  const [previewing, setPreviewing] = useState(false);

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-surface px-1.5">
      <Tip content="Back to dashboard">
        <Link href={`/w/${websiteId}`} className="flex size-7 items-center justify-center rounded-md text-fg-muted outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring" aria-label="Back to dashboard">
          <ArrowLeft className="size-4" />
        </Link>
      </Tip>
      <SiteSwitcher />
      <span className="h-4 w-px bg-border" />
      <PageSwitcher />
      <span className="h-4 w-px bg-border" />
      <HistoryButtons />
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
        <DeviceSwitcher />
        <ZoomMenu />
        <Tip content={play ? 'Back to editing' : 'Live preview: play the page’s animations as published'}>
          <Btn size="sm" variant="ghost" active={play} className="w-7 px-0" aria-label="Live preview" onClick={() => useViewportStore.setState({ playAnimations: !play })}>
            <Play />
          </Btn>
        </Tip>
        <SiteScriptsToggle />
      </div>
      <Tip content="Command palette" shortcut={`${MOD}K`}>
        <Btn size="sm" variant="ghost" className="w-7 px-0 lg:w-auto lg:px-2" onClick={() => useUiStore.setState({ paletteOpen: true })}>
          <Search />
          <span className="hidden text-xs text-fg-subtle lg:inline">
            <Command className="inline size-3" />K
          </span>
        </Btn>
      </Tip>
      <IconBtn label={leftOpen ? 'Hide left panel' : 'Show left panel'} shortcut={`${MOD}\\`} onClick={() => useUiStore.setState({ leftOpen: !leftOpen })} aria-pressed={leftOpen} className="aria-pressed:text-fg">
        <PanelLeft />
      </IconBtn>
      <IconBtn label={rightOpen ? 'Hide inspector' : 'Show inspector'} onClick={() => useUiStore.setState({ rightOpen: !rightOpen })} aria-pressed={rightOpen} className="aria-pressed:text-fg">
        <PanelRight />
      </IconBtn>
      <span className="h-4 w-px bg-border" />
      <SaveIndicator />
      <Btn
        size="sm"
        variant="secondary"
        icon={<Eye />}
        disabled={previewing || !perms.preview}
        onClick={async () => {
          setPreviewing(true);
          await openPreview();
          setPreviewing(false);
        }}
      >
        Preview
      </Btn>
      {perms.publish && (
        <Btn
          size="sm"
          variant="primary"
          icon={<Rocket />}
          onClick={() => {
            if (!perms.edit) toast.message('Publishing the current saved draft');
            useUiStore.setState({ publishOpen: true });
          }}
        >
          Publish
        </Btn>
      )}
    </header>
  );
}
