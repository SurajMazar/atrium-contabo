'use client';

import { AtriumApiError } from '@atrium/sdk';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { copyNode, cutNode, pasteNodes } from './actions';
import { resimulatePreview } from './ai/actions';
import { useAiStore } from './ai/store';
import { usePlayAnimations } from './canvas/animations';
import { Canvas } from './canvas/canvas';
import { CommandPalette, ShortcutsDialog } from './command-palette';
import { EditorBanners, MediaPickerHost, PromptHost } from './hosts';
import { LeftSidebar, RightSidebar } from './panels/sidebars';
import { createSaveController, useAutosaveWiring } from './persistence/autosave';
import { loadDraft } from './persistence/server';
import { handleEditorKeyDown, isEditableTarget } from './shortcuts';
import { resetDocumentStore, setErrorReporter, setPageId, useDocumentStore } from './store/document';
import { NO_PERMISSIONS, useEditorStore, type EditorPermissions } from './store/editor';
import { select, useSelectionStore } from './store/ui';
import { Toolbar } from './toolbar/toolbar';
import { PublishDialog } from './toolbar/publish-dialog';
import { VersionHistoryDrawer } from './toolbar/version-history';
import { TipProvider } from './ui/primitives';

function usePermissions(websiteId: string, ready: boolean): EditorPermissions {
  const { can, status } = useSession();
  return useMemo(() => {
    if (status !== 'authenticated' || !ready) return NO_PERMISSIONS;
    const c = (p: string) => can(p, websiteId);
    return {
      edit: c('page.update'),
      publish: c('page.publish'),
      theme: c('theme.update'),
      navigation: c('navigation.update'),
      code: c('code.manage'),
      ai: c('ai.use'),
      createPage: c('page.create'),
      deletePage: c('page.delete'),
      templates: c('template.manage'),
      preview: c('deployment.preview') || c('page.update'),
    };
  }, [can, status, websiteId, ready]);
}

/** Keep the URL in sync with the edited page without a Next navigation (no remount). */
function useUrlSync(websiteId: string) {
  const pageId = useDocumentStore((s) => s.pageId);
  useEffect(() => {
    if (!pageId) return;
    const target = `/w/${websiteId}/editor/${pageId}`;
    if (window.location.pathname !== target) window.history.replaceState(window.history.state, '', target + window.location.search);
  }, [pageId, websiteId]);
}

function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleEditorKeyDown(e);
    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || window.getSelection()?.toString()) return;
      const id = useSelectionStore.getState().selectedId;
      if (id) copyNode(id, e);
    };
    const onCut = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || window.getSelection()?.toString()) return;
      const id = useSelectionStore.getState().selectedId;
      if (id) cutNode(id, e);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (pasteNodes(e.clipboardData?.getData('text/plain'))) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
}

/** Re-simulate an active AI preview whenever the underlying draft changes. */
function useAiPreviewSync() {
  useEffect(
    () =>
      useDocumentStore.subscribe((s, prev) => {
        if (s.definition !== prev.definition && useAiStore.getState().preview) resimulatePreview();
      }),
    [],
  );
}

/** Drop the selection when the selected node disappears (undo, page switch, delete elsewhere). */
function useSelectionGuard() {
  useEffect(
    () =>
      useDocumentStore.subscribe((s, prev) => {
        const id = useSelectionStore.getState().selectedId;
        if (!id || (s.definition === prev.definition && s.pageId === prev.pageId)) return;
        const { definition, pageId } = s;
        if (!definition) return select(null);
        const page = definition.pages.find((p) => p.id === pageId);
        const exists = (nodes: { id: string; children?: unknown[] }[]): boolean => nodes.some((n) => n.id === id || (Array.isArray(n.children) && exists(n.children as { id: string; children?: unknown[] }[])));
        if (!exists([definition.header, definition.footer, ...(page?.sections ?? []), ...definition.globalSections.map((g) => g.node)])) select(null);
      }),
    [],
  );
}

export function EditorApp({ websiteId, initialPageId }: { websiteId: string; initialPageId?: string }) {
  const session = useSession();
  const authed = session.status === 'authenticated';
  const website = useQuery({ queryKey: qk.website(websiteId), queryFn: () => api.websites.get(websiteId), enabled: authed });
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const perms = usePermissions(websiteId, !!website.data);

  // Editor-wide context for non-React modules.
  useEffect(() => {
    useEditorStore.setState({ websiteId, organizationId: website.data?.organizationId ?? session.currentOrg?.id ?? null, website: website.data ?? null });
  }, [websiteId, website.data, session.currentOrg?.id]);
  useEffect(() => {
    useEditorStore.setState({ perms });
  }, [perms]);

  useEffect(() => {
    setErrorReporter((m) => toast.error(m.length > 160 ? `${m.slice(0, 160)}…` : m, { id: 'builder-op-error' }));
  }, []);

  // Load the draft once authenticated.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    setLoadState('loading');
    createSaveController(api, websiteId);
    loadDraft(websiteId, initialPageId)
      .then(() => !cancelled && setLoadState('ready'))
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof AtriumApiError && err.status === 404 ? 'This website does not exist or you do not have access to it.' : errorMessage(err));
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [authed, websiteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => resetDocumentStore(), []);
  useEffect(() => {
    if (initialPageId && loadState === 'ready') setPageId(initialPageId);
  }, [initialPageId, loadState]);

  useAutosaveWiring(loadState === 'ready');
  useUrlSync(websiteId);
  useGlobalKeys();
  useSelectionGuard();
  useAiPreviewSync();
  usePlayAnimations();

  if (session.status === 'unauthenticated') {
    return (
      <div className="flex h-dvh items-center justify-center text-[13px] text-fg-muted">
        <Link href={`/login?next=/w/${websiteId}/editor`} className="text-accent hover:underline">
          Sign in to open the editor
        </Link>
      </div>
    );
  }
  if (loadState === 'error') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="size-6 text-danger" />
        <p className="text-[14px] font-medium text-fg">Could not open the editor</p>
        <p className="max-w-sm text-xs text-fg-muted">{loadError}</p>
        <div className="flex gap-2">
          <Link href={`/w/${websiteId}`} className="text-xs text-accent hover:underline">
            Back to dashboard
          </Link>
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <TipProvider delayDuration={350} skipDelayDuration={150}>
      <div className="flex h-dvh flex-col overflow-hidden bg-bg text-[13px] text-fg" data-builder>
        <Toolbar />
        <EditorBanners />
        <div className="flex min-h-0 flex-1">
          <LeftSidebar />
          {loadState === 'ready' ? (
            <Canvas />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-canvas text-xs text-fg-muted">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading draft…
            </div>
          )}
          <RightSidebar />
        </div>
      </div>
      <CommandPalette />
      <ShortcutsDialog />
      <PublishDialog />
      <VersionHistoryDrawer />
      <PromptHost />
      <MediaPickerHost />
    </TipProvider>
  );
}
