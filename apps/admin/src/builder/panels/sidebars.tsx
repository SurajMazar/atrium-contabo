'use client';

import { Database, FileStack, ImageIcon, Layers, LayoutTemplate, ListTree, Palette, Plus, Sparkles } from 'lucide-react';
import { useCallback, useRef, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Inspector } from '../inspector/inspector';
import { cn } from '../lib/cn';
import { usePerms } from '../store/editor';
import { toggleLeft, useUiStore, type LeftTab } from '../store/ui';
import { Tip } from '../ui/primitives';
import { AddPanel } from './add-panel';
import { AiPanel } from './ai-panel';
import { CmsPanel } from './cms-panel';
import { LayersPanel } from './layers-panel';
import { MediaPanel } from './media-panel';
import { NavigationPanel } from './navigation-panel';
import { PagesPanel } from './pages-panel';
import { SectionsPanel } from './sections-panel';
import { ThemePanel } from './theme-panel';

const TABS: Array<{ id: LeftTab; label: string; icon: ComponentType<{ className?: string }>; key?: string; perm?: 'ai' | 'theme' | 'navigation' }> = [
  { id: 'add', label: 'Add elements', icon: Plus, key: 'A' },
  { id: 'sections', label: 'Sections', icon: LayoutTemplate },
  { id: 'pages', label: 'Pages', icon: FileStack },
  { id: 'layers', label: 'Layers', icon: Layers, key: 'L' },
  { id: 'cms', label: 'CMS', icon: Database },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'theme', label: 'Theme', icon: Palette, perm: 'theme' },
  { id: 'navigation', label: 'Navigation', icon: ListTree, perm: 'navigation' },
  { id: 'ai', label: 'Ask AI', icon: Sparkles, key: '⌘J', perm: 'ai' },
];

const PANELS: Record<LeftTab, ComponentType> = {
  add: AddPanel,
  sections: SectionsPanel,
  pages: PagesPanel,
  layers: LayersPanel,
  cms: CmsPanel,
  media: MediaPanel,
  theme: ThemePanel,
  navigation: NavigationPanel,
  ai: AiPanel,
};

/** Drag handle that resizes a sidebar between min/max widths. */
function ResizeHandle({ side, onResize }: { side: 'left' | 'right'; onResize: (dx: number) => void }) {
  const start = useRef(0);
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      start.current = e.clientX;
      const move = (ev: PointerEvent) => {
        onResize(ev.clientX - start.current);
        start.current = ev.clientX;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize],
  );
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className={cn('absolute inset-y-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-accent/30', side === 'left' ? '-right-0.5' : '-left-0.5')}
    />
  );
}

export function LeftSidebar() {
  const tab = useUiStore((s) => s.leftTab);
  const open = useUiStore((s) => s.leftOpen);
  const width = useUiStore((s) => s.leftWidth);
  const perms = usePerms();
  const allowed = (t: LeftTab) => { const def = TABS.find((x) => x.id === t); return !def?.perm || perms[def.perm]; };
  const Panel = PANELS[allowed(tab) ? tab : 'add'];
  return (
    <div className="flex h-full shrink-0">
      <nav className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-surface py-1.5" aria-label="Editor panels">
        {TABS.filter((t) => !t.perm || perms[t.perm]).map((t) => (
          <Tip key={t.id} content={t.label} shortcut={t.key} side="right">
            <button
              type="button"
              aria-label={t.label}
              aria-pressed={open && tab === t.id}
              onClick={() => toggleLeft(t.id)}
              className={cn('flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg [&_svg]:size-4', open && tab === t.id && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent')}
            >
              <t.icon />
            </button>
          </Tip>
        ))}
      </nav>
      {open && (
        <aside className="relative flex h-full flex-col border-r border-border bg-surface" style={{ width }}>
          <Panel />
          <ResizeHandle side="left" onResize={(dx) => useUiStore.setState((s) => ({ leftWidth: Math.min(420, Math.max(220, s.leftWidth + dx)) }))} />
        </aside>
      )}
    </div>
  );
}

export function RightSidebar({ children }: { children?: ReactNode }) {
  const open = useUiStore((s) => s.rightOpen);
  const width = useUiStore((s) => s.rightWidth);
  if (!open) return null;
  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-border bg-surface" style={{ width }}>
      <ResizeHandle side="right" onResize={(dx) => useUiStore.setState((s) => ({ rightWidth: Math.min(440, Math.max(260, s.rightWidth - dx)) }))} />
      {children ?? <Inspector />}
    </aside>
  );
}
