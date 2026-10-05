'use client';

import { registry } from '@atrium/component-registry';
import {
  ArrowDown, ArrowUp, Bookmark, ClipboardPaste, Copy, CopyPlus, CornerLeftUp, Eye, EyeOff, Globe, Group, Layers2, Lock, LockOpen,
  Pencil, Shapes, Sparkles, Trash2, Ungroup,
} from 'lucide-react';
import {
  copyNode, duplicateNode, getNode, groupNode, moveBy, pasteNodes, removeNode, replaceWithGlobalRef, selectParent, switchVariant,
  toggleHidden, toggleLocked, ungroupNode,
} from '../actions';
import { askAi } from '../ai/store';
import { MOD } from '../lib/cn';
import { convertToGlobalSection, saveSectionTemplate } from '../persistence/server';
import { useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { openLeft, openPrompt, select, useUiStore } from '../store/ui';
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from '../ui/primitives';
import { currentIndex } from './interactions';

/** Menu items for one node — used by the selection toolbar, canvas context menu and layers rows. */
export function NodeMenuItems({ nodeId }: { nodeId: string }) {
  const perms = usePerms();
  // re-render when the node changes (hidden/locked labels)
  useDocumentStore((s) => s.version);
  const node = getNode(nodeId);
  if (!node) return null;
  const meta = currentIndex().get(nodeId);
  const def = registry.get(node.type);
  const site = meta?.target === 'header' || meta?.target === 'footer';
  const isSection = !meta?.parentId && !site;
  const ro = !perms.edit;
  const name = node.name ?? def?.name ?? node.type;

  return (
    <>
      {perms.ai && (
        <MenuItem
          icon={<Sparkles />}
          onSelect={() => {
            select(nodeId);
            openLeft('ai');
            askAi(`About the “${name}” ${isSection ? 'section' : 'element'}: `);
          }}
        >
          Ask AI about this {isSection ? 'section' : 'element'}
        </MenuItem>
      )}
      {def?.variants && def.variants.length > 1 && !ro && (
        <MenuSub>
          <MenuSubTrigger icon={<Shapes />}>Switch variant</MenuSubTrigger>
          <MenuSubContent>
            {def.variants.map((v) => (
              <MenuItem key={v.id} onSelect={() => switchVariant(nodeId, v.id)} className={v.id === node.variant ? 'text-accent' : undefined}>
                {v.name}
              </MenuItem>
            ))}
          </MenuSubContent>
        </MenuSub>
      )}
      <MenuSeparator />
      <MenuItem icon={<Pencil />} disabled={ro} onSelect={() => { openLeft('layers'); useUiStore.setState({ renamingId: nodeId }); }}>
        Rename
      </MenuItem>
      <MenuItem icon={<CopyPlus />} shortcut={`${MOD}D`} disabled={ro || site} onSelect={() => duplicateNode(nodeId)}>
        Duplicate
      </MenuItem>
      <MenuItem icon={<Copy />} shortcut={`${MOD}C`} onSelect={() => copyNode(nodeId)}>
        Copy
      </MenuItem>
      <MenuItem icon={<ClipboardPaste />} shortcut={`${MOD}V`} disabled={ro} onSelect={() => { select(nodeId); pasteNodes(); }}>
        Paste after
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<ArrowUp />} shortcut="⌥↑" disabled={ro || site || meta?.index === 0} onSelect={() => moveBy(nodeId, -1)}>
        Move up
      </MenuItem>
      <MenuItem icon={<ArrowDown />} shortcut="⌥↓" disabled={ro || site} onSelect={() => moveBy(nodeId, 1)}>
        Move down
      </MenuItem>
      <MenuItem icon={<CornerLeftUp />} shortcut="Esc" disabled={!meta?.parentId} onSelect={() => { select(nodeId); selectParent(); }}>
        Select parent
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={node.hidden ? <Eye /> : <EyeOff />} disabled={ro} onSelect={() => toggleHidden(nodeId)}>
        {node.hidden ? 'Show' : 'Hide'}
      </MenuItem>
      <MenuItem icon={node.locked ? <LockOpen /> : <Lock />} disabled={ro} onSelect={() => toggleLocked(nodeId)}>
        {node.locked ? 'Unlock' : 'Lock'}
      </MenuItem>
      {!isSection && !site && (
        <MenuItem icon={<Group />} shortcut={`${MOD}G`} disabled={ro} onSelect={() => groupNode(nodeId)}>
          Group into container
        </MenuItem>
      )}
      {!!node.children?.length && !isSection && !site && (
        <MenuItem icon={<Ungroup />} shortcut={`${MOD}⇧G`} disabled={ro} onSelect={() => ungroupNode(nodeId)}>
          Ungroup
        </MenuItem>
      )}
      {isSection && (
        <>
          <MenuSeparator />
          <MenuItem
            icon={<Bookmark />}
            disabled={!perms.templates}
            onSelect={() =>
              openPrompt({
                title: 'Save as section template',
                description: 'Reuse this section on any website in your organization.',
                label: 'Template name',
                initial: name,
                confirmLabel: 'Save template',
                onConfirm: (v) => saveSectionTemplate(nodeId, v),
              })
            }
          >
            Save as section template…
          </MenuItem>
          {node.type !== 'global-section' && (
            <MenuItem
              icon={<Globe />}
              disabled={ro}
              onSelect={() =>
                openPrompt({
                  title: 'Convert to global section',
                  description: 'Global sections are shared: editing one updates every page that uses it.',
                  label: 'Section name',
                  initial: name,
                  confirmLabel: 'Convert',
                  onConfirm: (v) => convertToGlobalSection(nodeId, v, (gid) => replaceWithGlobalRef(nodeId, gid, v, getNode(nodeId)!)),
                })
              }
            >
              Convert to global section…
            </MenuItem>
          )}
        </>
      )}
      {!site && (
        <>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger disabled={ro} shortcut="⌫" onSelect={() => removeNode(nodeId)}>
            Delete
          </MenuItem>
        </>
      )}
      {site && (
        <MenuItem icon={<Layers2 />} disabled>
          Site-wide {meta?.target}
        </MenuItem>
      )}
    </>
  );
}
