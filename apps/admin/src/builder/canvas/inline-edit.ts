import { getPath } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import { getNode, setProp } from '../actions';
import { controlForPath } from '../lib/controls';
import { canEdit } from '../store/editor';
import { setEditing, useUiStore } from '../store/ui';

let active: { finish: (commit: boolean) => void } | null = null;

export function isInlineEditing() {
  return !!active;
}

export function finishInlineEdit(commit = true) {
  active?.finish(commit);
}

/**
 * Start plaintext inline editing on an element marked `data-edit-prop`.
 * The raw prop value (including `*emphasis*` markers) is shown while editing.
 * Commit on blur / Enter (Shift+Enter inserts a newline for multi-line props),
 * Esc cancels. The canvas is remounted afterwards because the browser mutated
 * React-owned DOM.
 */
export function startInlineEdit(el: HTMLElement, nodeId: string, prop: string): boolean {
  if (!canEdit()) return false;
  finishInlineEdit(true);
  const node = getNode(nodeId);
  if (!node || node.locked) return false;
  const raw = getPath(node.props, prop);
  if (typeof raw !== 'string' && raw !== undefined) return false;
  const control = controlForPath(registry.get(node.type)?.controls ?? [], prop);
  if (control?.type === 'richtext') {
    useUiStore.setState({ inspectorTab: 'content', rightOpen: true });
    return false;
  }
  const multiline = control ? control.type === 'textarea' : (raw ?? '').includes('\n');
  const original = raw ?? '';
  const doc = el.ownerDocument;

  // Keep React's own DOM nodes so they can be restored on finish (no canvas remount needed).
  const reactNodes = Array.from(el.childNodes);
  el.setAttribute('data-atrium-editing', '');
  try {
    el.contentEditable = 'plaintext-only';
  } catch {
    el.contentEditable = 'true';
  }
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.textContent = original;
  el.spellcheck = true;
  el.focus({ preventScroll: true });
  const range = doc.createRange();
  range.selectNodeContents(el);
  const sel = doc.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  setEditing(nodeId);

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
      e.preventDefault();
      finish(true);
    }
  };
  const onBlur = () => finish(true);
  const onPaste = (e: ClipboardEvent) => {
    // Always paste as plain text.
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    doc.execCommand('insertText', false, multiline ? text : text.replace(/\s*\n\s*/g, ' '));
  };

  let done = false;
  function finish(commit: boolean) {
    if (done) return;
    done = true;
    active = null;
    el.removeEventListener('keydown', onKey, true);
    el.removeEventListener('blur', onBlur);
    el.removeEventListener('paste', onPaste);
    const text = (el.innerText ?? el.textContent ?? '').replace(/ /g, ' ').replace(/\n$/, '');
    el.removeAttribute('data-atrium-editing');
    el.contentEditable = 'false';
    setEditing(null);
    const next = multiline ? text : text.replace(/\s*\n\s*/g, ' ');
    // Put back exactly the nodes React rendered, then let React reconcile the change normally.
    el.replaceChildren(...reactNodes);
    if (commit && next !== original) setProp(nodeId, prop, next, { label: 'Edit text', mergeKey: `inline:${nodeId}:${prop}:${Date.now()}` });
  }

  el.addEventListener('keydown', onKey, true);
  el.addEventListener('blur', onBlur);
  el.addEventListener('paste', onPaste);
  active = { finish };
  return true;
}
