'use client';

import type { DraftResponse, PageWithDocument } from '@atrium/sdk';
import type { PageDocument } from '@atrium/schema';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { applySilently, loadDocument, mutate, setPageId, useDocumentStore } from '../store/document';
import { adoptServerDefinition } from './adopt';
import { useEditorStore } from '../store/editor';
import { select } from '../store/ui';
import { flushSaves, getSaveController } from './autosave';

/**
 * Server-authoritative operations. Every structural page change goes through
 * the dedicated endpoints, then local state is updated so history stays valid:
 * appends (create/duplicate) are applied without a history entry at the end of
 * the pages array; index-shifting changes (delete, homepage) reload the draft.
 */

const websiteId = () => {
  const id = useEditorStore.getState().websiteId;
  if (!id) throw new Error('Editor not initialised');
  return id;
};

export async function loadDraft(id: string, pageId?: string | null): Promise<DraftResponse> {
  const draft = await api.websites.draft(id);
  loadDocument(draft.definition, pageId ?? useDocumentStore.getState().pageId);
  getSaveController()?.init(draft.definition, draft.revisions);
  return draft;
}

/** Discard local unsaved changes and load what is on the server. */
export async function reloadLatest() {
  getSaveController()?.clearConflicts();
  const sel = useDocumentStore.getState().pageId;
  await loadDraft(websiteId(), sel);
  select(null);
  toast.success('Loaded the latest saved version');
}

function documentOf(res: PageWithDocument): PageDocument {
  const doc = res.document;
  return { ...doc, id: doc.id ?? res.id };
}

export async function createPage(input: { title: string; slug: string; sections?: unknown[]; templateId?: string }): Promise<string | null> {
  try {
    await flushSaves();
    const res = await api.pages.create(websiteId(), input);
    const page = documentOf(res);
    if (page.id !== res.id) page.id = res.id;
    applySilently((draft) => {
      if (!draft.pages.some((p) => p.id === page.id)) draft.pages.push(page);
    });
    const added = useDocumentStore.getState().definition!.pages.find((p) => p.id === page.id)!;
    getSaveController()?.trackPage(added, res.revision);
    setPageId(page.id);
    select(null);
    toast.success(`Page “${page.title}” created`);
    return page.id;
  } catch (err) {
    toast.error('Could not create page', { description: errorMessage(err) });
    return null;
  }
}

export async function duplicatePage(pageId: string): Promise<string | null> {
  try {
    await flushSaves();
    const res = await api.pages.duplicate(pageId);
    const page = documentOf(res);
    if (page.id !== res.id) page.id = res.id;
    applySilently((draft) => {
      if (!draft.pages.some((p) => p.id === page.id)) draft.pages.push(page);
    });
    const added = useDocumentStore.getState().definition!.pages.find((p) => p.id === page.id)!;
    getSaveController()?.trackPage(added, res.revision);
    setPageId(page.id);
    toast.success(`Duplicated as “${page.title}”`);
    return page.id;
  } catch (err) {
    toast.error('Could not duplicate page', { description: errorMessage(err) });
    return null;
  }
}

export async function deletePage(pageId: string): Promise<boolean> {
  try {
    await flushSaves();
    await api.pages.remove(pageId);
    getSaveController()?.untrackPage(pageId);
    const current = useDocumentStore.getState().pageId;
    await loadDraft(websiteId(), current === pageId ? null : current);
    toast.success('Page deleted');
    return true;
  } catch (err) {
    toast.error('Could not delete page', { description: errorMessage(err) });
    return false;
  }
}

export async function setHomepage(pageId: string): Promise<boolean> {
  try {
    await flushSaves();
    await api.pages.setHomepage(pageId);
    await loadDraft(websiteId(), useDocumentStore.getState().pageId);
    toast.success('Homepage updated');
    return true;
  } catch (err) {
    toast.error('Could not set homepage', { description: errorMessage(err) });
    return false;
  }
}

/** Apply an AI proposal server-side, then adopt the authoritative draft as one history entry. */
export async function applyAiGeneration(generationId: string, label: string, fallback: () => boolean): Promise<boolean> {
  await flushSaves();
  const res = await api.ai.apply(generationId);
  try {
    const draft = await api.websites.draft(websiteId());
    adoptServerDefinition(draft.definition, label, 'ai');
    getSaveController()?.markSaved(useDocumentStore.getState().definition!, draft.revisions);
    const pageId = useDocumentStore.getState().pageId;
    if (pageId && !draft.definition.pages.some((p) => p.id === pageId)) setPageId(draft.definition.pages[0]!.id);
  } catch {
    // Draft reload failed — apply locally so the user still sees the change, then trust revisions from apply().
    fallback();
    getSaveController()?.markSaved(useDocumentStore.getState().definition!, res.revisions);
  }
  return true;
}

export async function restorePageVersion(pageId: string, versionId: string): Promise<boolean> {
  try {
    await flushSaves();
    const res = await api.pages.restoreVersion(pageId, versionId);
    const doc = documentOf(res);
    mutate('Restore page version', (draft) => {
      const i = draft.pages.findIndex((p) => p.id === pageId);
      if (i >= 0) draft.pages[i] = { ...doc, id: pageId };
    }, { source: 'system' });
    getSaveController()?.markSaved(useDocumentStore.getState().definition!, { pages: { [pageId]: res.revision } }, { pageIds: [pageId] });
    toast.success('Version restored');
    return true;
  } catch (err) {
    toast.error('Could not restore version', { description: errorMessage(err) });
    return false;
  }
}

/** ⌘S — save now and create a named checkpoint of the current page. */
export async function saveCheckpoint(message?: string) {
  const pageId = useDocumentStore.getState().pageId;
  const ok = await flushSaves();
  if (!ok) {
    toast.error('Some changes could not be saved yet', { description: 'They are kept locally and will retry automatically.' });
    return;
  }
  if (!pageId) return;
  try {
    const page = useDocumentStore.getState().definition?.pages.find((p) => p.id === pageId);
    const v = await api.pages.createVersion(pageId, message ?? `Checkpoint · ${new Date().toLocaleString()}`);
    toast.success(`Saved · version ${v.number}`, { description: page?.title });
  } catch (err) {
    toast.error('Saved, but the version checkpoint failed', { description: errorMessage(err) });
  }
}

/** Open a draft preview in a new tab. */
export async function openPreview() {
  const win = window.open('about:blank', '_blank');
  try {
    await flushSaves();
    const token = await api.websites.createPreviewToken(websiteId(), { expiresInHours: 24, label: 'Editor preview' });
    const { definition, pageId } = useDocumentStore.getState();
    const slug = definition?.pages.find((p) => p.id === pageId)?.slug ?? '';
    const url = previewUrl(token.url, token.token, slug);
    if (win) win.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    win?.close();
    toast.error('Could not open preview', { description: errorMessage(err) });
  }
}

/** `${PREVIEW_URL}/_preview/{token}/{slug}` derived from the token response url. */
export function previewUrl(url: string, token: string | undefined, slug: string): string {
  const clean = slug.replace(/^\/+/, '');
  const m = /^(.*\/_preview\/[^/?#]+)/.exec(url);
  if (m) return clean ? `${m[1]}/${clean}` : m[1]!;
  if (token) {
    try {
      const origin = new URL(url).origin;
      return `${origin}/_preview/${token}${clean ? `/${clean}` : ''}`;
    } catch {
      /* fall through */
    }
  }
  return url;
}

/** Save a node as an organization SECTION template (server snapshots it from the draft). */
export async function saveSectionTemplate(nodeId: string, name: string) {
  const { organizationId } = useEditorStore.getState();
  const pageId = useDocumentStore.getState().pageId;
  if (!organizationId || !pageId) return;
  try {
    await flushSaves();
    await api.templates.create(organizationId, { kind: 'SECTION', name, from: { websiteId: websiteId(), pageId, nodeId } });
    toast.success(`Saved “${name}” to section templates`);
  } catch (err) {
    toast.error('Could not save template', { description: errorMessage(err) });
  }
}

/** Create a reusable global section from a page node and replace the node with a reference. */
export async function convertToGlobalSection(nodeId: string, name: string, replace: (globalId: string) => void) {
  const def = useDocumentStore.getState().definition;
  const pageId = useDocumentStore.getState().pageId;
  const page = def?.pages.find((p) => p.id === pageId);
  const node = page ? findSection(page.sections, nodeId) : null;
  if (!node) return;
  try {
    const dto = await api.globalSections.create(websiteId(), { name, node });
    replace(dto.id);
    getSaveController()?.trackGlobal(useDocumentStore.getState().definition!, dto.id);
    toast.success(`“${name}” is now a global section`, { description: 'Edits to it will apply on every page that uses it.' });
  } catch (err) {
    toast.error('Could not create global section', { description: errorMessage(err) });
  }
}

function findSection(nodes: PageDocument['sections'], id: string): PageDocument['sections'][number] | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children ? findSection(n.children, id) : null;
    if (hit) return hit;
  }
  return null;
}
