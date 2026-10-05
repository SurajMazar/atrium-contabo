import { findNode, jsonClone, type SiteOperation } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import { createId, setResponsive, type Animation, type Breakpoint, type CollectionBinding, type Node, type NodeInput, type PageDocument, type Visibility } from '@atrium/schema';
import { toast } from 'sonner';
import { internalClipboard, parseClipboard, serializeNodes } from './lib/clipboard';
import type { DropTarget } from './lib/drop-target';
import { canAccept } from './lib/rules';
import { buildNodeIndex, getTree, locate, type NodeMeta } from './lib/tree';
import { mutate, runOps, useDocumentStore, type CommitOptions } from './store/document';
import { canEdit } from './store/editor';
import { select, useSelectionStore, type DragPayload } from './store/ui';

/* ───────────── context helpers ───────────── */

function docState() {
  return useDocumentStore.getState();
}

function guard(): boolean {
  if (!canEdit()) {
    toast.message('View-only mode', { id: 'view-only', description: 'You do not have permission to edit pages.' });
    return false;
  }
  return !!docState().definition;
}

export function targetOf(nodeId: string): string | null {
  const { definition, pageId } = docState();
  if (!definition) return null;
  return locate(definition, pageId, nodeId)?.target ?? null;
}

function nodeIndex(): Map<string, NodeMeta> {
  const { definition, pageId } = docState();
  return definition ? buildNodeIndex(definition, pageId) : new Map();
}

export function getNode(nodeId: string | null): Node | null {
  const { definition, pageId } = docState();
  if (!definition || !nodeId) return null;
  return locate(definition, pageId, nodeId)?.loc.node ?? null;
}

const accepts = (parentType: string | null, childType: string) => canAccept(registry, parentType, childType);

export interface Placement {
  target: string;
  parentId: string | null;
  index?: number;
  /** Wrap the node in a section first (element inserted at page root). */
  wrap?: boolean;
}

/**
 * Where a new node of `type` should go: after the selection when its parent
 * accepts it, else inside the selection, else up the ancestor chain, else at
 * the end of the page (wrapped in a section for non-section components).
 */
export function resolveInsertPlacement(type: string, anchorId: string | null = useSelectionStore.getState().selectedId): Placement | null {
  const { definition, pageId } = docState();
  if (!definition || !pageId) return null;
  const index = buildNodeIndex(definition, pageId);
  let cur = anchorId ? index.get(anchorId) : undefined;
  if (cur && cur.target !== pageId) cur = undefined; // header/footer: insert into page instead
  if (cur) {
    if (accepts(cur.type, type) && cur.childCount === 0) return { target: pageId, parentId: cur.id };
    if (accepts(cur.parentType, type)) return { target: pageId, parentId: cur.parentId, index: cur.index + 1 };
    if (accepts(cur.type, type)) return { target: pageId, parentId: cur.id };
    let up = cur.parentId ? index.get(cur.parentId) : undefined;
    while (up) {
      if (accepts(up.parentType, type)) return { target: pageId, parentId: up.parentId, index: up.index + 1 };
      if (accepts(up.type, type)) return { target: pageId, parentId: up.id };
      up = up.parentId ? index.get(up.parentId) : undefined;
    }
  }
  const page = definition.pages.find((p) => p.id === pageId)!;
  let rootIndex = page.sections.length;
  if (cur) {
    let top = cur;
    while (top.parentId) top = index.get(top.parentId)!;
    rootIndex = top.index + 1;
  }
  if (accepts(null, type)) return { target: pageId, parentId: null, index: rootIndex };
  if (registry.has('section') && accepts('section', type)) return { target: pageId, parentId: null, index: rootIndex, wrap: true };
  return null;
}

function addNodeOp(placement: Placement, node: NodeInput): SiteOperation {
  const payload: NodeInput = placement.wrap ? { type: 'section', props: {}, children: [node] } : node;
  return { op: 'addNode', pageId: placement.target, parentId: placement.parentId, index: placement.index, node: payload };
}

function newNodeInput(type: string): NodeInput {
  // createNode applies default props/children/animation and ids.
  return registry.createNode(type) as NodeInput;
}

/** Insert a component near the selection (click-to-insert from the Add panel). */
export function insertComponent(type: string, placement?: Placement | null): string | null {
  if (!guard()) return null;
  const where = placement ?? resolveInsertPlacement(type);
  if (!where) {
    toast.error(`Cannot place “${registry.get(type)?.name ?? type}” here`);
    return null;
  }
  const res = runOps(`Add ${registry.get(type)?.name ?? type}`, [addNodeOp(where, newNodeInput(type))]);
  const created = res.ok ? (res.results[0]?.createdId ?? null) : null;
  // When wrapped in a section, the inserted component is the wrapper's first child.
  const id = created && where.wrap ? (findNode(getTree(docState().definition!, where.target) ?? [], created)?.node.children?.[0]?.id ?? created) : created;
  if (id) select(id);
  return id;
}

export function insertTemplate(node: NodeInput, name: string, placement?: Placement | null): string | null {
  if (!guard()) return null;
  const where = placement ?? resolveInsertPlacement(node.type);
  if (!where) {
    toast.error(`Cannot place “${name}” here`);
    return null;
  }
  const res = runOps(`Add ${name}`, [addNodeOp(where, jsonClone(node))]);
  const id = res.ok ? (res.results[0]?.createdId ?? null) : null;
  if (id) select(id);
  return id;
}

/** Apply a resolved canvas/layers drop. */
export function applyDrop(payload: DragPayload, target: DropTarget, treeTarget?: string): string | null {
  if (!guard()) return null;
  const { pageId } = docState();
  const where: Placement = { target: treeTarget ?? pageId!, parentId: target.parentId, index: target.index };
  if (payload.kind === 'component') return insertComponent(payload.type, where);
  if (payload.kind === 'template') return insertTemplate(payload.node, payload.name, where);
  if (payload.kind === 'move') {
    const t = targetOf(payload.nodeId);
    if (!t) return null;
    runOps('Move element', [{ op: 'moveNode', pageId: t, nodeId: payload.nodeId, parentId: target.parentId, index: target.index }]);
    select(payload.nodeId);
    return payload.nodeId;
  }
  if (payload.kind === 'media') {
    const control = firstMediaControl('image');
    if (!control) return null;
    const node = registry.createNode('image', { props: { ...(registry.get('image')?.defaultProps ?? {}), [control]: mediaRef(payload.media) } });
    return insertTemplate(node as NodeInput, 'Image', where);
  }
  return null;
}

/** Name of the first top-level media control of a component (image drop target). */
export function firstMediaControl(type: string): string | null {
  const def = registry.get(type);
  return def?.controls.find((c) => c.type === 'media' && !c.name.includes('.') && c.mediaKind !== 'video')?.name ?? null;
}

/** Drop an image from the media panel onto an existing node that has an image control. */
export function applyMediaToNode(nodeId: string, media: Parameters<typeof mediaRef>[0]): boolean {
  const node = getNode(nodeId);
  if (!node) return false;
  const control = firstMediaControl(node.type);
  if (!control) return false;
  setProp(nodeId, control, mediaRef(media), { label: 'Replace image' });
  return true;
}

export function mediaRef(m: { url: string; alt?: string | null; width?: number | null; height?: number | null; id: string; mimeType?: string; blurDataUrl?: string | null }) {
  return {
    src: m.url,
    mediaId: m.id,
    ...(m.alt ? { alt: m.alt } : {}),
    ...(m.width ? { width: m.width } : {}),
    ...(m.height ? { height: m.height } : {}),
    ...(m.mimeType ? { mimeType: m.mimeType } : {}),
    ...(m.blurDataUrl ? { blurDataUrl: m.blurDataUrl } : {}),
  };
}

/* ───────────── node edits ───────────── */

export function setProp(nodeId: string, path: string, value: unknown, opts: CommitOptions & { label?: string } = {}) {
  if (!guard()) return;
  const t = targetOf(nodeId);
  if (!t) return;
  runOps(opts.label ?? 'Edit content', [{ op: 'setProp', pageId: t, nodeId, path, value }], { mergeKey: opts.mergeKey ?? `prop:${nodeId}:${path}`, source: opts.source });
}

export function setStyle(nodeId: string, key: string, breakpoint: Breakpoint, value: unknown, opts: CommitOptions = {}) {
  if (!guard()) return;
  const t = targetOf(nodeId);
  if (!t) return;
  const v = value === '' || value === null ? undefined : value;
  runOps('Edit style', [{ op: 'setStyle', pageId: t, nodeId, key, breakpoint, value: v }], { mergeKey: opts.mergeKey ?? `style:${nodeId}:${key}:${breakpoint}` });
}

/** Non-responsive style keys (backgroundImage) are set as a whole. */
export function setStyleObject(nodeId: string, key: 'backgroundImage', value: unknown) {
  if (!guard()) return;
  editNode(nodeId, 'Edit background', (n) => {
    const style = (n.style ?? {}) as Record<string, unknown>;
    if (value === undefined || value === null) delete style[key];
    else style[key] = value;
    n.style = Object.keys(style).length ? (style as Node['style']) : undefined;
  }, { mergeKey: `style:${nodeId}:${key}` });
}

/** Direct recipe on one node (fields that SiteOperations do not cover: visibility, binding, translations). */
export function editNode(nodeId: string, label: string, recipe: (node: Node) => void, opts: CommitOptions = {}) {
  if (!guard()) return;
  const { pageId } = docState();
  mutate(label, (draft) => {
    const hit = locate(draft, pageId, nodeId);
    if (hit) recipe(hit.loc.node);
  }, opts);
}

export function updateNode(nodeId: string, label: string, patch: Omit<Extract<SiteOperation, { op: 'updateNode' }>, 'op' | 'pageId' | 'nodeId'>, opts: CommitOptions = {}) {
  if (!guard()) return;
  const t = targetOf(nodeId);
  if (!t) return;
  runOps(label, [{ op: 'updateNode', pageId: t, nodeId, ...patch }], opts);
}

export function renameNode(nodeId: string, name: string) {
  editNode(nodeId, 'Rename', (n) => {
    if (name.trim()) n.name = name.trim().slice(0, 120);
    else delete n.name;
  });
}

export function toggleHidden(nodeId: string) {
  const n = getNode(nodeId);
  if (n) updateNode(nodeId, n.hidden ? 'Show element' : 'Hide element', { hidden: !n.hidden });
}

export function toggleLocked(nodeId: string) {
  const n = getNode(nodeId);
  if (n) updateNode(nodeId, n.locked ? 'Unlock element' : 'Lock element', { locked: !n.locked });
}

export function switchVariant(nodeId: string, variant: string) {
  updateNode(nodeId, 'Switch variant', { variant });
}

export function setAnimation(nodeId: string, animation: Animation | null, mergeKey?: string) {
  if (animation && (!animation.preset || animation.preset === 'none')) animation = null;
  updateNode(nodeId, animation ? 'Edit animation' : 'Remove animation', { animation }, { mergeKey: mergeKey ?? `anim:${nodeId}` });
}

export function setVisibility(nodeId: string, recipe: (v: Visibility) => void) {
  editNode(nodeId, 'Edit visibility', (n) => {
    const v: Visibility = { ...(n.visibility ?? {}) };
    recipe(v);
    const clean = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && !(Array.isArray(x) && x.length === 0)));
    n.visibility = Object.keys(clean).length ? (clean as Visibility) : undefined;
  });
}

export function setResponsiveHidden(nodeId: string, bp: Breakpoint, hidden: boolean) {
  setVisibility(nodeId, (v) => {
    v.hidden = setResponsive(v.hidden, bp, hidden) as Visibility['hidden'];
  });
}

export function setBinding(nodeId: string, binding: CollectionBinding | undefined) {
  editNode(nodeId, binding ? 'Edit collection binding' : 'Remove collection binding', (n) => {
    if (binding) n.binding = binding;
    else delete n.binding;
  }, { mergeKey: `binding:${nodeId}` });
}

export function removeNode(nodeId: string) {
  if (!guard()) return;
  const t = targetOf(nodeId);
  const idx = nodeIndex();
  const meta = idx.get(nodeId);
  if (!t || t === 'header' || t === 'footer') {
    if (t) toast.message('The site header and footer cannot be deleted', { description: 'Hide them per page from the Page settings instead.' });
    return;
  }
  if (t.startsWith('global:') && !meta?.parentId) {
    toast.message('Select the global section block on the page to remove it');
    return;
  }
  // pick a neighbour to keep keyboard flow
  let next: string | null = meta?.parentId ?? null;
  if (meta) {
    const { definition } = docState();
    const siblings = meta.parentId ? findNode(getTree(definition!, t)!, meta.parentId)?.node.children : getTree(definition!, t);
    const sib = siblings?.[meta.index + 1] ?? siblings?.[meta.index - 1];
    if (sib) next = sib.id;
  }
  const label = `Delete ${registry.get(meta?.type ?? '')?.name ?? 'element'}`;
  if (runOps(label, [{ op: 'removeNode', pageId: t, nodeId }]).ok) select(next);
}

export function duplicateNode(nodeId: string) {
  if (!guard()) return;
  const t = targetOf(nodeId);
  if (!t || t === 'header' || t === 'footer') return;
  if (t.startsWith('global:') && !nodeIndex().get(nodeId)?.parentId) return;
  const res = runOps('Duplicate', [{ op: 'duplicateNode', pageId: t, nodeId }]);
  const id = res.results[0]?.createdId;
  if (id) select(id);
}

export function moveBy(nodeId: string, delta: -1 | 1) {
  if (!guard()) return;
  const meta = nodeIndex().get(nodeId);
  if (!meta || meta.target === 'header' || meta.target === 'footer') return;
  if (meta.target.startsWith('global:') && !meta.parentId) return;
  const { definition } = docState();
  const siblings = meta.parentId ? findNode(getTree(definition!, meta.target)!, meta.parentId)?.node.children ?? [] : getTree(definition!, meta.target)!;
  const to = meta.index + delta;
  if (to < 0 || to >= siblings.length) return;
  // moveNode index is pre-removal: moving down by one means inserting after the next sibling.
  runOps(delta < 0 ? 'Move up' : 'Move down', [{ op: 'moveNode', pageId: meta.target, nodeId, parentId: meta.parentId, index: delta < 0 ? to : to + 1 }], { mergeKey: `move:${nodeId}` });
}

/** Insert a fresh copy of the same component type before/after (quick action). */
export function insertSiblingOf(nodeId: string, position: 'before' | 'after', type?: string) {
  const meta = nodeIndex().get(nodeId);
  if (!meta) return;
  const t = type ?? meta.type;
  if (!accepts(meta.parentType, t)) return;
  insertComponent(t, { target: meta.target, parentId: meta.parentId, index: meta.index + (position === 'after' ? 1 : 0) });
}

export function selectParent(): boolean {
  const id = useSelectionStore.getState().selectedId;
  if (!id) return false;
  const meta = nodeIndex().get(id);
  select(meta?.parentId ?? null);
  return true;
}

export function selectSibling(delta: -1 | 1) {
  const id = useSelectionStore.getState().selectedId;
  const { definition, pageId } = docState();
  if (!definition || !pageId) return;
  if (!id) {
    const first = definition.pages.find((p) => p.id === pageId)?.sections[0];
    if (first) select(first.id);
    return;
  }
  const meta = nodeIndex().get(id);
  if (!meta) return;
  const tree = getTree(definition, meta.target)!;
  const siblings = meta.parentId ? findNode(tree, meta.parentId)?.node.children ?? [] : tree;
  const next = siblings[meta.index + delta];
  if (next) select(next.id);
}

/** ⌘G — wrap in a container. */
export function groupNode(nodeId: string) {
  if (!guard()) return;
  const meta = nodeIndex().get(nodeId);
  if (!meta || meta.target === 'header' || meta.target === 'footer') return;
  const wrapperType = registry.has('container') ? 'container' : 'stack';
  if (!accepts(meta.parentType, wrapperType) || !accepts(wrapperType, meta.type)) {
    toast.error('This element cannot be grouped here');
    return;
  }
  const wrapper = registry.createNode(wrapperType, { name: 'Group' });
  const { pageId } = docState();
  const ok = mutate('Group into container', (draft) => {
    const hit = locate(draft, pageId, nodeId);
    if (!hit) return;
    const node = hit.loc.node;
    wrapper.children = [jsonClone(node)];
    hit.loc.list.splice(hit.loc.index, 1, wrapper);
  });
  if (ok) select(wrapper.id);
}

/** ⌘⇧G — replace a container with its children. */
export function ungroupNode(nodeId: string) {
  if (!guard()) return;
  const meta = nodeIndex().get(nodeId);
  const node = getNode(nodeId);
  if (!meta || !node?.children?.length) return;
  if (!node.children.every((c) => accepts(meta.parentType, c.type))) {
    toast.error('Children cannot be placed in the parent');
    return;
  }
  const first = node.children[0]!.id;
  const { pageId } = docState();
  const ok = mutate('Ungroup', (draft) => {
    const hit = locate(draft, pageId, nodeId);
    if (hit) hit.loc.list.splice(hit.loc.index, 1, ...(hit.loc.node.children ?? []));
  });
  if (ok) select(first);
}

/* ───────────── clipboard ───────────── */

export function copyNode(nodeId: string, event?: ClipboardEvent): boolean {
  const node = getNode(nodeId);
  if (!node) return false;
  const text = internalClipboard.write([node]);
  if (event?.clipboardData) {
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  } else {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }
  toast.message('Copied', { id: 'clipboard', description: 'Paste with ⌘V on any page.' });
  return true;
}

export function cutNode(nodeId: string, event?: ClipboardEvent) {
  if (copyNode(nodeId, event)) removeNode(nodeId);
}

export function pasteNodes(text?: string | null): boolean {
  if (!guard()) return false;
  const nodes = parseClipboard(text) ?? internalClipboard.read();
  if (!nodes?.length) return false;
  const { definition, pageId } = docState();
  if (!definition || !pageId) return false;
  const ops: SiteOperation[] = [];
  let anchor = useSelectionStore.getState().selectedId;
  let lastPlacement: Placement | null = null;
  for (const n of nodes) {
    const prev = lastPlacement as Placement | null;
    const where: Placement | null = prev ? { ...prev, index: prev.index !== undefined ? prev.index + 1 : undefined } : resolveInsertPlacement(n.type, anchor);
    if (!where) continue;
    ops.push(addNodeOp(where, n as NodeInput));
    lastPlacement = where;
    anchor = null;
  }
  if (!ops.length) {
    toast.error('Nothing can be pasted here');
    return false;
  }
  const res = runOps(nodes.length > 1 ? `Paste ${nodes.length} elements` : 'Paste', ops);
  const id = res.results[res.results.length - 1]?.createdId;
  if (id) select(id);
  return res.ok;
}

export { serializeNodes };

/* ───────────── pages ───────────── */

type PagePatch = Extract<SiteOperation, { op: 'updatePage' }>['patch'];

export function updatePage(pageId: string, patch: PagePatch, opts: CommitOptions & { label?: string } = {}) {
  if (!guard()) return;
  runOps(opts.label ?? 'Edit page', [{ op: 'updatePage', pageId, patch }], { mergeKey: opts.mergeKey ?? `page:${pageId}:${Object.keys(patch).join(',')}`, source: opts.source });
}

export function editPage(pageId: string, label: string, recipe: (p: PageDocument) => void, opts: CommitOptions = {}) {
  if (!guard()) return;
  mutate(label, (draft) => {
    const p = draft.pages.find((x) => x.id === pageId);
    if (p) recipe(p);
  }, opts);
}

/* ───────────── global sections ───────────── */

/** Replace a page section with a `global-section` reference node (after the API created the global section). */
export function replaceWithGlobalRef(nodeId: string, globalId: string, name: string, node: Node) {
  const { pageId } = docState();
  const refNode: Node = { id: createId(), type: 'global-section', name, props: {}, ref: globalId };
  const ok = mutate('Convert to global section', (draft) => {
    if (!draft.globalSections.some((g) => g.id === globalId)) draft.globalSections.push({ id: globalId, name, node: jsonClone(node) });
    const hit = locate(draft, pageId, nodeId);
    if (hit) hit.loc.list.splice(hit.loc.index, 1, refNode);
  });
  if (ok) select(refNode.id);
}
