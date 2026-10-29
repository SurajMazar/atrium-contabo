'use client';

import { createRenderContext, getSiteCss, PageView, siteRootAttrs } from '@atrium/renderer-core';
import { googleFontsUrl } from '@atrium/design-tokens';
import type { PageDocument, WebsiteDefinition } from '@atrium/schema';
import { Component, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAiStore } from '../ai/store';
import { bumpCanvasEpoch, useDocumentStore } from '../store/document';
import { useEditorStore } from '../store/editor';
import { useViewportStore } from '../store/ui';
import { EDITOR_CHROME_CSS, useCanvasDom } from './dom';
import { useCanvasInteractions } from './interactions';
import { useSiteScriptMirror } from './site-scripts/use-site-scripts';

const BLANK_DOC = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>';

/** Definition the canvas renders: the AI scratch copy while previewing "after", otherwise the draft. */
function useRenderedDefinition(): WebsiteDefinition | null {
  const draft = useDocumentStore((s) => s.definition);
  const preview = useAiStore((s) => s.preview);
  return preview?.showAfter ? preview.definition : draft;
}

function ensureStyle(doc: Document, id: string): HTMLStyleElement {
  let el = doc.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = doc.createElement('style');
    el.id = id;
    doc.head.appendChild(el);
  }
  return el;
}

/**
 * Same-origin blank iframe whose body hosts a React portal. The site is
 * rendered by renderer-core in editor mode, so media queries respond to the
 * iframe width exactly like the published site.
 */
export function CanvasFrame({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  // A new key replaces the iframe, so nothing the live preview's animations did survives.
  const frameKey = useViewportStore((s) => s.frameKey);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const setup = () => {
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win || !doc.body) return;
      if (doc.getElementById('atrium-canvas-root')) return;
      ensureStyle(doc, 'atrium-site-css');
      ensureStyle(doc, 'atrium-editor-chrome').textContent = EDITOR_CHROME_CSS;
      const root = doc.createElement('div');
      root.id = 'atrium-canvas-root';
      doc.body.appendChild(root);
      useCanvasDom.setState({ frame: iframe, doc, win, mount: root });
      setMount(root);
    };
    // Wait for the srcDoc navigation: the initial about:blank document is replaced on load.
    iframe.addEventListener('load', setup);
    return () => {
      iframe.removeEventListener('load', setup);
      setMount(null);
      useCanvasDom.setState({ frame: null, doc: null, win: null, mount: null });
    };
  }, [frameKey]);

  useCanvasInteractions();
  useSiteScriptMirror();

  return (
    <>
      <iframe
        key={frameKey}
        ref={ref}
        title="Page canvas"
        srcDoc={BLANK_DOC}
        style={{ width, height, border: 0, display: 'block', background: '#fff' }}
        className="select-none"
      />
      {mount && <CanvasContent mount={mount} />}
    </>
  );
}

function CanvasContent({ mount }: { mount: HTMLElement }) {
  const definition = useRenderedDefinition();
  const pageId = useDocumentStore((s) => s.pageId);
  const epoch = useDocumentStore((s) => s.canvasEpoch);
  const playAnimations = useViewportStore((s) => s.playAnimations);
  const websiteId = useEditorStore((s) => s.websiteId);
  const page = useMemo(() => definition?.pages.find((p) => p.id === pageId) ?? definition?.pages[0], [definition, pageId]);
  const win = useCanvasDom((s) => s.win);
  const scrollY = useRef(0);

  useEffect(() => {
    if (!win) return;
    const onScroll = () => (scrollY.current = win.scrollY);
    win.addEventListener('scroll', onScroll, { passive: true });
    return () => win.removeEventListener('scroll', onScroll);
  }, [win]);
  // Remounts (after inline edits) keep the scroll position; switching pages starts at the top.
  useLayoutEffect(() => {
    if (win && scrollY.current) win.scrollTo(0, scrollY.current);
  }, [epoch, win]);
  useLayoutEffect(() => {
    win?.scrollTo(0, 0);
    scrollY.current = 0;
  }, [pageId, win]);

  if (!definition || !page) return null;
  return createPortal(
    <CanvasErrorBoundary key={epoch}>
      <SiteRoot definition={definition} page={page} playAnimations={playAnimations} websiteId={websiteId ?? undefined} />
    </CanvasErrorBoundary>,
    mount,
  );
}

let lastRecovery = 0;
/**
 * React owns the canvas DOM, but the site-script mirror (and inline editing) also change it. If a
 * commit trips over such a change, remount the page instead of taking the editor down.
 */
class CanvasErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[builder] canvas render failed, remounting the page', error);
    if (Date.now() - lastRecovery > 3000) {
      lastRecovery = Date.now();
      bumpCanvasEpoch();
    }
  }
  render() {
    return this.state.failed ? <p style={{ font: '13px system-ui, sans-serif', padding: 24, color: '#666' }}>This page could not be shown in the canvas.</p> : this.props.children;
  }
}

/**
 * Keep the previous value while `key` is unchanged. Used so the render context
 * only changes for site-level edits (theme, settings, navigation, forms, CMS, page
 * list) — editing a section then re-renders just that section's branch.
 */
function useStableBy<T>(value: T, key: string): T {
  const ref = useRef<{ key: string; value: T } | null>(null);
  if (!ref.current || ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}

const pageListKey = (pages: PageDocument[]) => pages.map((p) => `${p.id}|${p.slug}|${p.title}|${p.isHomepage}|${p.kind}|${p.collection ?? ''}|${p.status}|${JSON.stringify(p.translations ?? null)}`).join('¦');
const pageShellKey = (p: PageDocument) => {
  const first = p.sections.find((s) => !s.hidden);
  return `${p.id}|${p.slug}|${p.title}|${JSON.stringify(p.layout)}|${JSON.stringify(p.translations ?? null)}|${first ? `${first.type}:${first.variant ?? ''}` : ''}`;
};

const SiteRoot = memo(function SiteRoot({ definition, page, playAnimations, websiteId }: { definition: WebsiteDefinition; page: PageDocument; playAnimations: boolean; websiteId?: string }) {
  const locale = definition.settings.localization.defaultLocale;
  // Page list for link/path resolution: stable unless pages are added, renamed or re-slugged.
  const pages = useStableBy(definition.pages, pageListKey(definition.pages));
  const { settings, theme, navigation, header, footer, globalSections, forms, collections, redirects, customCss } = definition;
  const ctxDefinition = useMemo(
    () => ({ ...definition, pages }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, theme, navigation, header, footer, globalSections, forms, collections, redirects, customCss, pages],
  );
  // Page shell for the context: stable while only section content changes.
  const pageShell = useStableBy(page, pageShellKey(page));
  const ctx = useMemo(
    () => createRenderContext({ definition: ctxDefinition, mode: 'editor', editor: { playAnimations, showEmptyPlaceholders: true }, locale, basePath: '', websiteId }, pageShell),
    [ctxDefinition, pageShell, playAnimations, locale, websiteId],
  );
  const doc = useCanvasDom((s) => s.doc);

  // Site CSS: debounced (~50ms) and written straight into the iframe <style>, bypassing React.
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => {
      ensureStyle(doc, 'atrium-site-css').textContent = getSiteCss(ctx, page);
    }, 50);
    return () => clearTimeout(t);
  }, [ctx, page, doc]);

  // First paint: compile synchronously so the page never flashes unstyled.
  useLayoutEffect(() => {
    if (!doc) return;
    const el = ensureStyle(doc, 'atrium-site-css');
    if (!el.textContent) el.textContent = getSiteCss(ctx, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Fonts follow the theme only.
  const fontsUrl = useMemo(() => googleFontsUrl(definition.theme), [definition.theme]);
  useEffect(() => {
    if (!doc) return;
    let link = doc.getElementById('atrium-fonts') as HTMLLinkElement | null;
    if (!fontsUrl) {
      link?.remove();
      return;
    }
    if (!link) {
      link = doc.createElement('link');
      link.id = 'atrium-fonts';
      link.rel = 'stylesheet';
      doc.head.appendChild(link);
    }
    if (link.href !== fontsUrl) link.href = fontsUrl;
  }, [doc, fontsUrl]);

  // The published site puts the root attributes on <body> only (renderer layout), and site CSS is written
  // against that (`body.atrium-site …`, variables set on body). A second `.atrium-site` element inside
  // would re-apply the theme's defaults below body and undo such overrides, so the page renders straight
  // into the mount, like the published body. Before paint: the theme CSS is scoped to `.atrium-site`.
  useLayoutEffect(() => {
    if (!doc) return;
    const body = doc.body;
    const { className, ...attrs } = siteRootAttrs(ctx);
    body.classList.add(...String(className).split(' ').filter(Boolean));
    for (const [name, value] of Object.entries(attrs)) body.setAttribute(name, value);
  }, [doc, ctx]);

  // Let overlays re-measure after each commit.
  useEffect(() => {
    useCanvasDom.setState((s) => ({ renderTick: s.renderTick + 1 }));
  });

  return <PageView ctx={ctx} page={page} />;
});
