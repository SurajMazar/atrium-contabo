'use client';

import { getPath } from '@atrium/builder-core';
import { registry, type Control } from '@atrium/component-registry';
import { BREAKPOINTS, resolveResponsive, type Node } from '@atrium/schema';
import { Check, ChevronDown, Eye, EyeOff, Globe, Lock, Monitor, Laptop, Smartphone, Tablet } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { setProp, setResponsiveHidden, switchVariant, toggleLocked } from '../actions';
import { controlsByGroup, visibleControls } from '../lib/controls';
import { cn } from '../lib/cn';
import { BREAKPOINT_LABEL } from '../lib/devices';
import { findInDef } from '../lib/tree';
import { useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { useSelectionStore, useUiStore, type InspectorTab } from '../store/ui';
import { Badge, Btn, Group, Icon, Popover, PopoverClose, PopoverContent, PopoverTrigger, Tip } from '../ui/primitives';
import { AdvancedTab } from './advanced-tab';
import { ControlField } from './control-field';
import { MotionTab } from './motion-tab';
import { PagePanel } from './page-panel';
import { StyleEditor } from './style-editor';

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'content', label: 'Content' },
  { id: 'style', label: 'Style' },
  { id: 'layout', label: 'Layout' },
  { id: 'motion', label: 'Motion' },
  { id: 'advanced', label: 'Advanced' },
];

export function Inspector() {
  const selectedId = useSelectionStore((s) => s.selectedId);
  const node = useDocumentStore((s) => findInDef(s.definition, s.pageId, selectedId));
  if (!selectedId || !node) return <PagePanel />;
  return <NodeInspector node={node} />;
}

function NodeInspector({ node }: { node: Node }) {
  const perms = usePerms();
  const tab = useUiStore((s) => s.inspectorTab);
  const def = registry.get(node.type);
  const target = useDocumentStore((s) => (s.definition?.header.id === node.id || containsId(s.definition?.header, node.id) ? 'header' : containsId(s.definition?.footer, node.id) ? 'footer' : null));
  const disabled = !perms.edit || !!node.locked;

  const onChangeFor = useCallback(
    (control: Control) => (value: unknown, opts?: { mergeKey?: string }) => setProp(node.id, control.name, value, { mergeKey: opts?.mergeKey ?? `prop:${node.id}:${control.name}` }),
    [node.id],
  );

  const groups = useMemo(() => controlsByGroup(visibleControls(def?.controls ?? [], node.props, node.variant)), [def, node.props, node.variant]);

  const renderControls = (list: Control[]) =>
    list.map((c) => <ControlField key={c.name} control={c} value={getPath(node.props, c.name)} onChange={onChangeFor(c)} node={node} disabled={disabled} />);

  if (!def) {
    return (
      <div className="p-4 text-xs text-fg-muted">
        {node.type === 'global-section' ? <GlobalRefInfo node={node} /> : <>Unknown component “{node.type}”. It may come from a plugin that is not installed.</>}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-muted">
            <Icon name={def.icon} size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-4">{node.name ?? def.name}</p>
            <p className="truncate text-[11px] text-fg-subtle">{node.name ? def.name : def.description}</p>
          </div>
          {node.locked && (
            <Tip content="Locked — click to unlock">
              <Btn size="xs" variant="ghost" className="w-6 px-0" disabled={!perms.edit} onClick={() => toggleLocked(node.id)}>
                <Lock className="size-3.5" />
              </Btn>
            </Tip>
          )}
        </div>
        {target && <p className="mt-2 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-fg-muted">Site-wide {target}: changes apply to every page.</p>}
        {def.variants && def.variants.length > 1 && <VariantPicker node={node} disabled={disabled} />}
      </div>
      <div className="flex shrink-0 border-b border-border px-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => useUiStore.setState({ inspectorTab: t.id })}
            className={cn(
              'relative inline-flex h-9 flex-auto items-center justify-center gap-1 whitespace-nowrap px-1 text-xs font-medium text-fg-muted outline-none transition-colors duration-75 hover:text-fg focus-visible:text-fg',
              tab === t.id && 'text-fg after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-fg',
            )}
          >
            {t.label}
            {t.id === 'motion' && node.animation && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="Has animation" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" key={node.id}>
        {tab === 'content' && (
          <>
            {groups.content.length ? (
              <div className="space-y-3 border-b border-border px-3 py-3">{renderControls(groups.content)}</div>
            ) : (
              <p className="px-3 py-4 text-xs text-fg-muted">{def.name} has no content settings. See Style and Layout.</p>
            )}
            {node.binding && <p className="mx-3 my-3 rounded-md bg-accent-soft px-2 py-1.5 text-[11px] text-accent">Content of “{def.bindable?.listProp}” comes from the “{node.binding.collection}” collection (Advanced › CMS binding).</p>}
          </>
        )}
        {tab === 'style' && (
          <>
            {groups.style.length > 0 && (
              <Group id="ctrl-style" title={`${def.name} style`}>
                {renderControls(groups.style)}
              </Group>
            )}
            <StyleEditor nodeId={node.id} tab="style" disabled={disabled} />
          </>
        )}
        {tab === 'layout' && (
          <>
            {groups.layout.length > 0 && (
              <Group id="ctrl-layout" title={`${def.name} layout`}>
                {renderControls(groups.layout)}
              </Group>
            )}
            <StyleEditor nodeId={node.id} tab="layout" disabled={disabled} />
            <ResponsiveVisibility node={node} disabled={disabled} />
          </>
        )}
        {tab === 'motion' && <MotionTab node={node} disabled={disabled} />}
        {tab === 'advanced' && (
          <>
            {groups.advanced.length > 0 && (
              <Group id="ctrl-advanced" title="Settings">
                {renderControls(groups.advanced)}
              </Group>
            )}
            <AdvancedTab node={node} disabled={disabled} />
          </>
        )}
      </div>
    </div>
  );
}

function containsId(root: Node | undefined, id: string): boolean {
  if (!root) return false;
  if (root.id === id) return true;
  return !!root.children?.some((c) => containsId(c, id));
}

function VariantPicker({ node, disabled }: { node: Node; disabled?: boolean }) {
  const def = registry.get(node.type)!;
  const current = def.variants!.find((v) => v.id === node.variant) ?? def.variants![0]!;
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" disabled={disabled} className="mt-2.5 flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-left outline-none transition-colors duration-75 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=open]:border-accent">
          <span className="text-[11px] text-fg-subtle">Variant</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{current.name}</span>
          <ChevronDown className="size-3.5 text-fg-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[272px] p-1.5" align="start">
        <p className="px-1.5 pb-1.5 pt-0.5 text-[11px] text-fg-subtle">Switching keeps your content.</p>
        <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
          {def.variants!.map((v, i) => (
            <PopoverClose asChild key={v.id}>
              <button
                type="button"
                onClick={() => switchVariant(node.id, v.id)}
                className={cn('flex w-full gap-2 rounded-md p-1.5 text-left hover:bg-surface-2', v.id === current.id && 'bg-accent-soft')}
              >
                <VariantThumb index={i} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[13px] font-medium">
                    {v.name}
                    {v.id === current.id && <Check className="size-3.5 text-accent" />}
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-4 text-fg-muted">{v.description}</span>
                </span>
              </button>
            </PopoverClose>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Abstract layout glyph — distinct per variant so the list scans quickly. */
function VariantThumb({ index }: { index: number }) {
  const layouts = [
    <><rect x="2" y="3" width="20" height="3" rx="1" /><rect x="2" y="8" width="12" height="2" rx="1" /><rect x="15" y="8" width="7" height="8" rx="1" /></>,
    <><rect x="1" y="1" width="22" height="16" rx="1.5" opacity=".35" /><rect x="3" y="11" width="10" height="2" rx="1" /><rect x="3" y="14" width="6" height="1.5" rx=".75" /></>,
    <><rect x="1" y="1" width="22" height="16" rx="1.5" opacity=".2" /><path d="M10 6l5 3-5 3z" /></>,
    <><rect x="2" y="4" width="9" height="2" rx="1" /><rect x="2" y="8" width="7" height="1.5" rx=".75" /><rect x="13" y="2" width="9" height="14" rx="1" opacity=".5" /></>,
    <><rect x="5" y="6" width="14" height="2.5" rx="1" /><rect x="8" y="10" width="8" height="1.5" rx=".75" /></>,
    <><rect x="5" y="2" width="14" height="2.5" rx="1" /><rect x="3" y="7" width="18" height="9" rx="1" opacity=".5" /></>,
  ];
  return (
    <svg viewBox="0 0 24 18" className="mt-0.5 h-9 w-12 shrink-0 rounded border border-border bg-surface-2 p-1 text-fg-muted" fill="currentColor">
      {layouts[index % layouts.length]}
    </svg>
  );
}

const BP_ICON = { base: Monitor, laptop: Laptop, tablet: Tablet, mobile: Smartphone } as const;

function ResponsiveVisibility({ node, disabled }: { node: Node; disabled?: boolean }) {
  const hidden = node.visibility?.hidden;
  return (
    <Group id="layout-visibility" title="Visibility">
      <div className="grid grid-cols-4 gap-1">
        {BREAKPOINTS.map((bp) => {
          const isHidden = !!resolveResponsive(hidden, bp);
          const BpIcon = BP_ICON[bp];
          return (
            <Tip key={bp} content={`${isHidden ? 'Hidden' : 'Visible'} on ${BREAKPOINT_LABEL[bp]} — click to toggle`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setResponsiveHidden(node.id, bp, !isHidden)}
                className={cn('flex h-12 flex-col items-center justify-center gap-1 rounded-md border text-[11px]', isHidden ? 'border-dashed border-border-strong text-fg-subtle' : 'border-border text-fg')}
              >
                <BpIcon className="size-4" />
                {isHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              </button>
            </Tip>
          );
        })}
      </div>
      <p className="text-[11px] leading-4 text-fg-subtle">Hidden elements stay editable in the canvas (dimmed) but are not shown on the site at that size.</p>
    </Group>
  );
}

function GlobalRefInfo({ node }: { node: Node }) {
  const g = useDocumentStore((s) => s.definition?.globalSections.find((x) => x.id === node.ref));
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">
        <Globe className="size-4" /> Global section
      </p>
      <p>
        Uses <Badge tone="accent">{g?.name ?? node.ref}</Badge>. Click inside it on the canvas to edit its content — changes apply to every page that uses it.
      </p>
    </div>
  );
}
