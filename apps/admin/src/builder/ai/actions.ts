'use client';

import { diffWebsites } from '@atrium/builder-core';
import { AtriumApiError, type AiProposal, type RewriteMode } from '@atrium/sdk';
import { createId } from '@atrium/schema';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { buildNodeIndex } from '../lib/tree';
import { applyAiGeneration } from '../persistence/server';
import { runOps, simulateOps, useDocumentStore } from '../store/document';
import { useEditorStore } from '../store/editor';
import { useSelectionStore } from '../store/ui';
import { useAiStore, type AiMessage } from './store';

export const QUICK_PROMPTS = [
  'Make this hero more luxurious',
  'Add a wedding section',
  'Change this site to a darker color palette',
  'Add an enquiry form below the pricing section',
  'Make animations more subtle',
  'Optimize the homepage for SEO',
  'Create a rooms page',
  'Change all buttons to squared corners',
];

export const REWRITE_MODES: Array<{ mode: RewriteMode; label: string }> = [
  { mode: 'rewrite', label: 'Rewrite' },
  { mode: 'shorten', label: 'Shorten' },
  { mode: 'expand', label: 'Expand' },
  { mode: 'professional', label: 'More professional' },
  { mode: 'luxurious', label: 'More luxurious' },
  { mode: 'casual', label: 'More casual' },
  { mode: 'seo', label: 'SEO optimize' },
  { mode: 'translate', label: 'Translate…' },
];

/** Friendly error text; detects "no AI provider configured". */
export function aiErrorMessage(err: unknown): { text: string; notConfigured: boolean } {
  if (err instanceof AtriumApiError) {
    const notConfigured =
      /not.?configured|no (ai )?provider|provider.*(missing|not)|integration/i.test(`${err.code} ${err.message}`) || err.code === 'AI_NOT_CONFIGURED' || err.code === 'NOT_CONFIGURED' || err.status === 424 || err.status === 412;
    if (notConfigured) return { text: 'Connect an AI provider in Integrations to use AI editing.', notConfigured: true };
    if (err.status === 429 || err.code === 'RATE_LIMITED') return { text: 'AI usage limit reached for now. Try again later or upgrade your plan.', notConfigured: false };
    if (err.status === 403) return { text: 'Your role does not allow AI editing on this website.', notConfigured: false };
    return { text: err.message || 'The AI request failed.', notConfigured: false };
  }
  return { text: err instanceof Error ? err.message : 'The AI request failed.', notConfigured: false };
}

function push(msg: Omit<AiMessage, 'id' | 'at'>): AiMessage {
  const m: AiMessage = { ...msg, id: createId('msg'), at: Date.now() };
  useAiStore.setState((s) => ({ messages: [...s.messages, m] }));
  return m;
}

function update(id: string, patch: Partial<AiMessage>) {
  useAiStore.setState((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}

/** Build a live scratch preview of a proposal (rendered by the canvas while previewing). */
export function previewProposal(proposal: AiProposal) {
  const def = useDocumentStore.getState().definition;
  if (!def) return;
  const { definition, error } = simulateOps(def, proposal.operations);
  useAiStore.setState({
    preview: { generationId: proposal.generationId, definition, showAfter: !error, changes: proposal.changes?.length ? proposal.changes : diffWebsites(def, definition), error, operations: proposal.operations },
  });
  // Follow the change: switch to an affected page when the current one is untouched.
  const pageId = useDocumentStore.getState().pageId;
  const pages = new Set(proposal.changes?.map((c) => c.pageId ?? (c.scope === 'page' ? c.id : undefined)).filter(Boolean) as string[]);
  if (pages.size && pageId && !pages.has(pageId)) {
    const target = [...pages].find((p) => definition.pages.some((x) => x.id === p));
    if (target) useDocumentStore.setState({ pageId: target });
  }
}

export function setPreviewSide(showAfter: boolean) {
  useAiStore.setState((s) => (s.preview ? { preview: { ...s.preview, showAfter } } : s));
}

export async function sendAiPrompt(prompt: string, kind: 'edit' | 'section' | 'page' = 'edit') {
  const websiteId = useEditorStore.getState().websiteId;
  const { pageId, definition } = useDocumentStore.getState();
  const text = prompt.trim();
  if (!websiteId || !text || useAiStore.getState().pending) return;
  // Only one live proposal at a time.
  discardActiveProposal();
  push({ role: 'user', text, kind });
  useAiStore.setState({ pending: true, draft: '' });
  const nodeId = useSelectionStore.getState().selectedId ?? undefined;
  try {
    let proposal: AiProposal;
    if (kind === 'page') proposal = await api.ai.generatePage(websiteId, { prompt: text });
    else if (kind === 'section' && pageId && definition) {
      let index: number | undefined;
      if (nodeId) {
        const idx = buildNodeIndex(definition, pageId);
        let m = idx.get(nodeId);
        while (m?.parentId) m = idx.get(m.parentId);
        if (m && m.target === pageId) index = m.index + 1;
      }
      proposal = await api.ai.generateSection(websiteId, { prompt: text, pageId, index });
    } else proposal = await api.ai.edit(websiteId, { prompt: text, pageId: pageId ?? undefined, nodeId });
    const hasOps = proposal.operations?.length > 0;
    push({ role: 'assistant', text: proposal.summary || (hasOps ? 'Here is a proposal.' : 'No changes were needed.'), proposal, kind, status: hasOps ? 'proposed' : undefined });
    if (hasOps) previewProposal(proposal);
  } catch (err) {
    const { text: message } = aiErrorMessage(err);
    push({ role: 'error', text: message });
  } finally {
    useAiStore.setState({ pending: false });
  }
}

function activeProposalMessage(): AiMessage | undefined {
  const gen = useAiStore.getState().preview?.generationId;
  return useAiStore.getState().messages.find((m) => m.proposal?.generationId === gen && m.status === 'proposed');
}

export function discardActiveProposal() {
  const m = activeProposalMessage();
  if (m) update(m.id, { status: 'discarded' });
  useAiStore.setState({ preview: null });
}

export function discardProposal(messageId: string) {
  update(messageId, { status: 'discarded' });
  const m = useAiStore.getState().messages.find((x) => x.id === messageId);
  if (m?.proposal?.generationId === useAiStore.getState().preview?.generationId) useAiStore.setState({ preview: null });
}

/**
 * Apply server-side (authoritative), then adopt the server draft locally as ONE
 * undoable history entry with source 'ai'.
 */
export async function applyProposal(messageId: string) {
  const m = useAiStore.getState().messages.find((x) => x.id === messageId);
  const proposal = m?.proposal;
  if (!m || !proposal) return;
  const label = `AI: ${proposal.summary?.slice(0, 60) || 'edit'}`;
  useAiStore.setState({ pending: true });
  try {
    await applyAiGeneration(proposal.generationId, label, () => runOps(label, proposal.operations, { source: 'ai' }).ok);
    update(messageId, { status: 'applied' });
    useAiStore.setState({ preview: null });
    toast.success('AI changes applied', { description: 'Undo with ⌘Z if you change your mind.' });
  } catch (err) {
    toast.error('Could not apply AI changes', { description: aiErrorMessage(err).text });
  } finally {
    useAiStore.setState({ pending: false });
  }
}

/** Rewrite a text prop via AI; returns the new text. */
export async function rewriteText(text: string, mode: RewriteMode, locale?: string): Promise<string | null> {
  const websiteId = useEditorStore.getState().websiteId;
  if (!websiteId || !text.trim()) return null;
  try {
    const res = await api.ai.rewrite(websiteId, { text, mode, locale });
    return res.text;
  } catch (err) {
    const e = aiErrorMessage(err);
    toast.error(e.notConfigured ? 'AI is not connected' : 'Rewrite failed', { description: e.text });
    return null;
  }
}

/** Keep the live AI preview in sync when the user edits the draft while previewing. */
export function resimulatePreview() {
  const preview = useAiStore.getState().preview;
  const def = useDocumentStore.getState().definition;
  if (!preview || !def) return;
  const { definition, error } = simulateOps(def, preview.operations);
  useAiStore.setState({ preview: { ...preview, definition, error, showAfter: error ? false : preview.showAfter } });
}
