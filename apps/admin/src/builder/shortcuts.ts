import { toast } from 'sonner';
import {
  duplicateNode, groupNode, moveBy, removeNode, selectParent, selectSibling, ungroupNode,
} from './actions';
import { askAi } from './ai/store';
import { saveCheckpoint } from './persistence/server';
import { redo, undo, useDocumentStore } from './store/document';
import { useEditorStore } from './store/editor';
import { openLeft, setDevice, togglePanels, useSelectionStore, useUiStore } from './store/ui';
import { scrollNodeIntoView } from './canvas/dom';

export function isEditableTarget(t: EventTarget | null): boolean {
  if (!t || !(t as Element).tagName) return false;
  const el = t as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest?.('[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],[role="textbox"],[cmdk-input]');
}

/** Any modal UI open (dialogs/menus handle their own keys). */
function overlayOpen(): boolean {
  const ui = useUiStore.getState();
  if (ui.paletteOpen || ui.publishOpen || ui.shortcutsOpen) return true;
  return typeof document !== 'undefined' && !!document.querySelector('[role="dialog"][data-state="open"],[role="menu"][data-state="open"],[role="alertdialog"]');
}

export interface ShortcutDef {
  keys: string;
  label: string;
  group: 'General' | 'Selection' | 'Editing' | 'View';
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: '⌘K', label: 'Command palette', group: 'General' },
  { keys: '⌘J', label: 'Ask AI', group: 'General' },
  { keys: '⌘S', label: 'Save now + version checkpoint', group: 'General' },
  { keys: '⌘Z', label: 'Undo', group: 'General' },
  { keys: '⌘⇧Z / ⌘Y', label: 'Redo', group: 'General' },
  { keys: '?', label: 'Keyboard shortcuts', group: 'General' },
  { keys: 'Esc', label: 'Select parent, then deselect', group: 'Selection' },
  { keys: '↑ / ↓', label: 'Previous / next sibling', group: 'Selection' },
  { keys: '⌘C / ⌘V', label: 'Copy / paste element', group: 'Editing' },
  { keys: '⌘D', label: 'Duplicate', group: 'Editing' },
  { keys: '⌘G', label: 'Group into container', group: 'Editing' },
  { keys: '⌘⇧G', label: 'Ungroup', group: 'Editing' },
  { keys: '⌥↑ / ⌥↓', label: 'Move up / down', group: 'Editing' },
  { keys: 'Delete', label: 'Delete element', group: 'Editing' },
  { keys: 'Double-click', label: 'Edit text inline', group: 'Editing' },
  { keys: '1 – 4', label: 'Desktop / laptop / tablet / mobile', group: 'View' },
  { keys: '⌘\\', label: 'Toggle panels', group: 'View' },
];

/**
 * Global editor keymap. Installed on the parent window and forwarded from the
 * canvas iframe so shortcuts work wherever focus is. Ignored while typing.
 */
export function handleEditorKeyDown(e: KeyboardEvent): boolean {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  const typing = isEditableTarget(e.target);
  const ui = useUiStore.getState();

  // Shortcuts that work even while typing.
  if (mod && key === 'k') {
    e.preventDefault();
    useUiStore.setState({ paletteOpen: !ui.paletteOpen });
    return true;
  }
  if (mod && key === 's') {
    e.preventDefault();
    void saveCheckpoint();
    return true;
  }
  if (mod && key === 'j') {
    e.preventDefault();
    if (!useEditorStore.getState().perms.ai) {
      toast.message('AI is not available for your role');
      return true;
    }
    openLeft('ai');
    askAi();
    return true;
  }
  if (typing || overlayOpen()) return false;
  if (useSelectionStore.getState().editingId) return false;

  const selected = useSelectionStore.getState().selectedId;

  if (mod && key === 'z') {
    e.preventDefault();
    const label = e.shiftKey ? redo() : undo();
    if (label) toast.message(`${e.shiftKey ? 'Redo' : 'Undo'}: ${label}`, { id: 'history', duration: 1400 });
    return true;
  }
  if (mod && key === 'y') {
    e.preventDefault();
    const label = redo();
    if (label) toast.message(`Redo: ${label}`, { id: 'history', duration: 1400 });
    return true;
  }
  if (mod && e.key === '\\') {
    e.preventDefault();
    togglePanels();
    return true;
  }
  if (mod && key === 'd' && selected) {
    e.preventDefault();
    duplicateNode(selected);
    return true;
  }
  if (mod && key === 'g' && selected) {
    e.preventDefault();
    if (e.shiftKey) ungroupNode(selected);
    else groupNode(selected);
    return true;
  }
  if (mod) return false; // leave ⌘C/⌘V/⌘X to the copy/paste events

  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
    e.preventDefault();
    removeNode(selected);
    return true;
  }
  if (e.key === 'Escape') {
    if (ui.contextMenu) {
      useUiStore.setState({ contextMenu: null });
      return true;
    }
    if (selected) {
      e.preventDefault();
      selectParent();
      return true;
    }
    return false;
  }
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
    e.preventDefault();
    const delta = e.key === 'ArrowUp' ? -1 : 1;
    if (e.altKey && selected) moveBy(selected, delta);
    else selectSibling(delta);
    const now = useSelectionStore.getState().selectedId;
    if (now) scrollNodeIntoView(now);
    return true;
  }
  if (!e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
    setDevice((['desktop', 'laptop', 'tablet', 'mobile'] as const)[Number(e.key) - 1]!);
    return true;
  }
  if (e.key === '?') {
    useUiStore.setState({ shortcutsOpen: true });
    return true;
  }
  if (key === 'a' && !selected && useDocumentStore.getState().definition) {
    openLeft('add');
    return true;
  }
  if (key === 'l') {
    openLeft('layers');
    return true;
  }
  return false;
}
