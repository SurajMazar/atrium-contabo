import { cloneWithNewIds, jsonClone } from '@atrium/builder-core';
import type { Node } from '@atrium/schema';

/** Envelope written to the system clipboard so nodes can travel between tabs/sites. */
export interface ClipboardEnvelope {
  atrium: 'nodes';
  version: 1;
  nodes: Node[];
}

export const CLIPBOARD_MIME = 'application/x-atrium-nodes';

export function serializeNodes(nodes: Node[]): string {
  const env: ClipboardEnvelope = { atrium: 'nodes', version: 1, nodes: jsonClone(nodes) };
  return JSON.stringify(env);
}

function isNodeLike(v: unknown): v is Node {
  if (!v || typeof v !== 'object') return false;
  const n = v as Record<string, unknown>;
  if (typeof n.type !== 'string' || !n.type) return false;
  if (n.props !== undefined && (typeof n.props !== 'object' || n.props === null)) return false;
  if (n.children !== undefined && (!Array.isArray(n.children) || !n.children.every(isNodeLike))) return false;
  return true;
}

/** Fresh ids for every node; anchors are dropped so HTML ids stay unique on the page. */
export function reidNodes(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    const copy = cloneWithNewIds({ ...n, props: n.props ?? {} });
    const strip = (x: Node) => {
      delete x.anchor;
      x.children?.forEach(strip);
    };
    strip(copy);
    return copy;
  });
}

/** Parse clipboard text; returns re-identified nodes or null when it is not Atrium data. */
export function parseClipboard(text: string | null | undefined): Node[] | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const data = JSON.parse(trimmed) as Partial<ClipboardEnvelope>;
    if (data.atrium !== 'nodes' || !Array.isArray(data.nodes) || !data.nodes.length) return null;
    if (!data.nodes.every(isNodeLike)) return null;
    return reidNodes(data.nodes);
  } catch {
    return null;
  }
}

/** In-memory clipboard (works without clipboard permissions, e.g. inside the iframe). */
let internal: string | null = null;
export const internalClipboard = {
  write(nodes: Node[]) {
    internal = serializeNodes(nodes);
    return internal;
  },
  read(): Node[] | null {
    return parseClipboard(internal);
  },
  get raw() {
    return internal;
  },
};
