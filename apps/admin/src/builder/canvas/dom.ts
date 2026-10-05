import { create } from 'zustand';

/** Handles to the canvas iframe, shared by the frame, overlay and interaction layers. */
export interface CanvasDomState {
  frame: HTMLIFrameElement | null;
  doc: Document | null;
  win: Window | null;
  /** Element inside the iframe body that hosts the React portal. */
  mount: HTMLElement | null;
  /** Bumped after each canvas render commit so overlays can re-measure. */
  renderTick: number;
}

export const useCanvasDom = create<CanvasDomState>()(() => ({ frame: null, doc: null, win: null, mount: null, renderTick: 0 }));

export function nodeElement(id: string | null | undefined): HTMLElement | null {
  if (!id) return null;
  const doc = useCanvasDom.getState().doc;
  if (!doc) return null;
  return doc.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
}

export function scrollNodeIntoView(id: string) {
  const el = nodeElement(id);
  const win = useCanvasDom.getState().win;
  if (!el || !win) return;
  const r = el.getBoundingClientRect();
  const vh = win.innerHeight;
  if (r.top >= 0 && r.bottom <= vh) return;
  win.scrollTo({ top: Math.max(0, win.scrollY + r.top - Math.min(120, vh / 4)), behavior: 'smooth' });
}

/** Minimal CSS injected into the canvas document for editor chrome (never shipped to sites). */
export const EDITOR_CHROME_CSS = `
html,body{margin:0;min-height:100%;}
body{cursor:default;}
html{scrollbar-width:thin;}
[data-node-hidden]{opacity:.35!important;outline:1px dashed rgba(120,120,120,.6);outline-offset:-1px;}
.a-dropzone,[data-drop-zone]{min-height:56px;display:flex;align-items:center;justify-content:center;border:1px dashed rgba(43,79,216,.35);border-radius:6px;color:rgba(43,79,216,.75);font:500 12px/1.2 system-ui,sans-serif;background:rgba(43,79,216,.03);}
.a-dropzone:empty::after,[data-drop-zone]:empty::after{content:'Drop elements here';}
[data-atrium-editing]{outline:2px solid #2b4fd8!important;outline-offset:2px;cursor:text;white-space:pre-wrap;}
[data-atrium-editing]:focus{outline:2px solid #2b4fd8!important;}
a,button,input,select,textarea,label{cursor:default!important;}
.atrium-site [data-atrium-drop-target]{outline:2px dashed #2b4fd8;outline-offset:-2px;}
`;
