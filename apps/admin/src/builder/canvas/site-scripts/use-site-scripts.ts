'use client';

import { pagePath, type WebsiteDefinition } from '@atrium/schema';
import { useEffect, useMemo } from 'react';
import { bumpCanvasEpoch, useDocumentStore } from '../../store/document';
import { selectFrameWidth, useViewportStore } from '../../store/ui';
import { useCanvasDom } from '../dom';
import { isInlineEditing } from '../inline-edit';
import { sandboxDocument } from './agent';
import { applyMirror, snapshotCanvas, undoMirror, type MirrorLog } from './mirror';
import type { SandboxPayload, SandboxResult, SandboxScript } from './protocol';

/**
 * Site scripts in the builder canvas.
 *
 * Published pages run the site's scripts, and some sites build much of their UI with them. The canvas
 * shares the admin origin, so those scripts must never run in it: a script there could act as whoever
 * has the editor open. Instead, after each canvas render the page is copied into an opaque-origin
 * sandbox iframe (no cookies, storage or access to the admin), the site's `necessary` scripts run
 * there, and the DOM changes they make are replayed onto the canvas as sanitized, inert markup. The
 * canvas then looks like the published page while React keeps owning every Atrium node. Analytics,
 * marketing and preference scripts never run; neither do scripts loaded from a URL.
 */

/** Inline `necessary` scripts, the only ones the canvas sandbox runs. */
export function canvasScripts(def: WebsiteDefinition | null | undefined): SandboxScript[] {
  if (!def) return [];
  return def.settings.scripts
    .filter((s) => s.enabled !== false && s.consentCategory === 'necessary' && !s.src && !!s.code?.trim())
    .map((s) => ({ code: s.code!, placement: s.placement }));
}

let applied: MirrorLog | null = null;

function clearMirror(doc: Document | null) {
  if (applied && applied.doc === doc) undoMirror(applied);
  applied = null;
  useCanvasDom.setState({ scriptMirror: 'off' });
}

const DEBOUNCE_MS = 250;

function runSandbox(payload: SandboxPayload, width: number, height: number, onResult: (r: SandboxResult) => void): () => void {
  const frame = document.createElement('iframe');
  // Opaque origin: scripts in it cannot reach the admin, its cookies or its storage.
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.title = 'Site scripts';
  frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none;z-index:-1;`;
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data as Partial<SandboxResult> | null;
    if (!d || d.type !== 'atrium:site-scripts' || d.nonce !== payload.nonce) return;
    dispose();
    onResult({ type: d.type, nonce: d.nonce, ops: Array.isArray(d.ops) ? d.ops : [], head: Array.isArray(d.head) ? d.head : [], errors: Array.isArray(d.errors) ? d.errors.map(String).slice(0, 20) : [] });
  };
  const timeout = window.setTimeout(() => dispose(), payload.maxMs + 8000);
  function dispose() {
    window.clearTimeout(timeout);
    window.removeEventListener('message', onMessage);
    frame.remove();
  }
  window.addEventListener('message', onMessage);
  frame.srcdoc = sandboxDocument(payload);
  document.body.appendChild(frame);
  return dispose;
}

export function useSiteScriptMirror() {
  const doc = useCanvasDom((s) => s.doc);
  const win = useCanvasDom((s) => s.win);
  const tick = useCanvasDom((s) => s.renderTick);
  const enabled = useViewportStore((s) => s.siteScripts);
  const width = useViewportStore(selectFrameWidth);
  const siteScripts = useDocumentStore((s) => s.definition?.settings.scripts);
  const path = useDocumentStore((s) => {
    const page = s.definition?.pages.find((p) => p.id === s.pageId) ?? s.definition?.pages[0];
    return page ? (page.isHomepage ? '/' : pagePath(page.slug)) : '/';
  });
  const scripts = useMemo(() => (siteScripts ? canvasScripts({ settings: { scripts: siteScripts } } as WebsiteDefinition) : []), [siteScripts]);

  useEffect(() => {
    if (!doc || !win) return;
    if (applied && applied.doc !== doc) applied = null; // a new canvas document
    if (!enabled || !scripts.length) {
      clearMirror(doc);
      return;
    }
    let cancelled = false;
    let dispose: (() => void) | null = null;
    let timer = 0;
    const go = () => {
      if (cancelled) return;
      if (isInlineEditing()) {
        timer = window.setTimeout(go, 400);
        return;
      }
      const gen = useCanvasDom.getState().renderTick;
      const canvas = snapshotCanvas(doc, applied);
      const payload: SandboxPayload = {
        nonce: crypto.randomUUID(),
        path,
        reducedMotion: true,
        html: canvas.html,
        body: canvas.body,
        styles: canvas.styles,
        scripts,
        quietMs: 200,
        maxMs: 4000,
      };
      useCanvasDom.setState({ scriptMirror: 'pending' });
      dispose = runSandbox(payload, win.innerWidth || width, win.innerHeight || 800, (result) => {
        dispose = null;
        const state = useCanvasDom.getState();
        // Stale: the canvas re-rendered meanwhile (a newer run is already scheduled).
        if (cancelled || state.renderTick !== gen || state.doc !== doc) return;
        // Applying would disturb text being typed; the edit's commit schedules a fresh run.
        if (isInlineEditing()) return;
        if (result.errors.length) console.warn('[builder] site script errors in the canvas sandbox:', result.errors);
        const undo = applied ? undoMirror(applied) : { uncertain: false };
        applied = null;
        if (undo.uncertain) {
          // React's DOM could not be restored exactly: remount the page and mirror again.
          useCanvasDom.setState({ scriptMirror: 'pending' });
          bumpCanvasEpoch();
          return;
        }
        applied = applyMirror(canvas.snap, result);
        useCanvasDom.setState({ scriptMirror: 'on' });
      });
    };
    timer = window.setTimeout(go, applied ? DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      dispose?.();
    };
  }, [doc, win, enabled, scripts, path, tick, width]);

  // Leaving the editor: drop the mirror bookkeeping.
  useEffect(() => () => void (applied = null), []);
}
