'use client';

import type { ChangeSummary } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import type { AiProposal } from '@atrium/sdk';
import { AlertTriangle, ArrowUp, Check, Eye, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyProposal, discardProposal, previewProposal, QUICK_PROMPTS, sendAiPrompt, setPreviewSide } from '../ai/actions';
import { useAiStore, type AiMessage } from '../ai/store';
import { cn, MOD } from '../lib/cn';
import { findInDef } from '../lib/tree';
import { useDocumentStore } from '../store/document';
import { useEditorStore, usePerms } from '../store/editor';
import { useSelectionStore } from '../store/ui';
import { Badge, Btn, Empty, IconBtn, PanelHeader, Segmented } from '../ui/primitives';
import { AiSetupCard, useAiStatus } from '@/components/ai/ai-setup';

type Mode = 'edit' | 'section' | 'page';

export function AiPanel() {
  const perms = usePerms();
  const messages = useAiStore((s) => s.messages);
  const pending = useAiStore((s) => s.pending);
  const draft = useAiStore((s) => s.draft);
  const focusTick = useAiStore((s) => s.focusTick);
  const [mode, setMode] = useState<Mode>('edit');
  const [text, setText] = useState(draft);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const selectedId = useSelectionStore((s) => s.selectedId);
  const selected = useDocumentStore((s) => findInDef(s.definition, s.pageId, selectedId));
  const pageTitle = useDocumentStore((s) => s.definition?.pages.find((p) => p.id === s.pageId)?.title);
  const orgId = useEditorStore((s) => s.organizationId);
  const aiStatus = useAiStatus(orgId);

  useEffect(() => {
    if (draft) setText(draft);
    inputRef.current?.focus();
    const el = inputRef.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }, [focusTick, draft]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending]);

  if (!perms.ai) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="AI" />
        <Empty icon={<Sparkles className="size-6" />} title="AI is not available for your role">Ask an administrator for the “Use AI generation and editing” permission.</Empty>
      </div>
    );
  }

  if (orgId && aiStatus.data && !aiStatus.data.ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader
          title={
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-accent" /> Ask AI
            </span>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <AiSetupCard orgId={orgId} status={aiStatus.data} compact />
        </div>
      </div>
    );
  }

  const send = () => {
    if (!text.trim() || pending) return;
    void sendAiPrompt(text, mode);
    setText('');
  };

  const context = selected ? `${selected.name ?? registry.get(selected.type)?.name ?? selected.type}` : pageTitle ? `Page “${pageTitle}”` : 'Website';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title={
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-accent" /> Ask AI
          </span>
        }
        actions={messages.length > 0 && <IconBtn label="Clear conversation" onClick={() => useAiStore.setState({ messages: [], preview: null })}><Trash2 /></IconBtn>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!messages.length && (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-fg-muted">Describe a change in plain language. You will see a live preview and a list of changes before anything is applied.</p>
            <div className="space-y-1">
              {QUICK_PROMPTS.map((p) => (
                <button key={p} type="button" onClick={() => void sendAiPrompt(p, /create .* page/i.test(p) ? 'page' : 'edit')} className="block w-full rounded-md border border-border px-2 py-1.5 text-left text-xs text-fg hover:border-border-strong hover:bg-surface-2">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m) => (
            <MessageView key={m.id} m={m} orgId={orgId} />
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <Loader2 className="size-3.5 animate-spin" /> Thinking…
            </div>
          )}
        </div>
        <div ref={endRef} />
      </div>
      <div className="shrink-0 space-y-2 border-t border-border p-2.5">
        <Segmented size="xs" value={mode} onChange={setMode} options={[{ label: 'Edit', value: 'edit' }, { label: 'New section', value: 'section' }, { label: 'New page', value: 'page' }]} />
        <div className="rounded-md border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-ring">
          <textarea
            ref={inputRef}
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={mode === 'page' ? 'Describe the page to create…' : mode === 'section' ? 'Describe the section to add after the selection…' : 'What would you like to change?'}
            className="block w-full resize-none bg-transparent px-2.5 py-2 text-[13px] leading-5 outline-none placeholder:text-fg-subtle"
          />
          <div className="flex items-center gap-2 px-2 pb-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">Context: {context}</span>
            <span className="text-[10px] text-fg-subtle">{MOD}J</span>
            <button type="button" onClick={send} disabled={!text.trim() || pending} aria-label="Send" className="flex size-6 items-center justify-center rounded-md bg-accent text-accent-fg disabled:opacity-40">
              <ArrowUp className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageView({ m, orgId }: { m: AiMessage; orgId: string | null }) {
  if (m.role === 'user') {
    return <div className="ml-6 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] leading-5">{m.text}</div>;
  }
  if (m.role === 'error') {
    const notConfigured = /connect an ai provider/i.test(m.text);
    return (
      <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger-soft px-2.5 py-2 text-xs text-danger">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div>
          {m.text}
          {notConfigured && orgId && (
            <Link href={`/org/${orgId}/integrations`} target="_blank" className="mt-1 block font-medium underline">
              Open Integrations
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[13px] leading-5 text-fg">{m.text}</p>
      {m.proposal && m.proposal.operations?.length > 0 && <ProposalCard m={m} proposal={m.proposal} />}
    </div>
  );
}

const KIND_TONE = { added: 'success', modified: 'accent', removed: 'danger' } as const;

function ProposalCard({ m, proposal }: { m: AiMessage; proposal: AiProposal }) {
  const preview = useAiStore((s) => (s.preview?.generationId === proposal.generationId ? s.preview : null));
  const pending = useAiStore((s) => s.pending);
  const pages = useDocumentStore((s) => s.definition?.pages);
  const changes = preview?.changes ?? proposal.changes ?? [];
  const grouped = useMemo(() => {
    const g = new Map<string, ChangeSummary[]>();
    for (const c of changes) {
      const key = c.pageId ? (pages?.find((p) => p.id === c.pageId)?.title ?? 'New page') : c.scope === 'page' ? 'Pages' : 'Site';
      g.set(key, [...(g.get(key) ?? []), c]);
    }
    return [...g.entries()];
  }, [changes, pages]);
  const [confirming, setConfirming] = useState(false);
  const usage = (proposal as AiProposal & { usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number } }).usage;
  const status = m.status;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-2.5 py-1.5">
        <span className="flex-1 text-xs font-medium">
          {changes.length} change{changes.length === 1 ? '' : 's'}
        </span>
        {status === 'applied' && <Badge tone="success"><Check className="mr-0.5 size-3" />Applied</Badge>}
        {status === 'discarded' && <Badge>Discarded</Badge>}
        {status === 'proposed' && preview && !preview.error && (
          <Segmented size="xs" className="w-28" value={preview.showAfter ? 'after' : 'before'} onChange={(v) => setPreviewSide(v === 'after')} options={[{ label: 'Before', value: 'before' }, { label: 'After', value: 'after' }]} />
        )}
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto px-2.5 py-2">
        {grouped.map(([group, list]) => (
          <div key={group}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{group}</p>
            <ul className="space-y-0.5">
              {list.map((c, i) => (
                <li key={`${c.id}-${i}`} className="flex items-center gap-1.5 text-xs">
                  <Badge tone={KIND_TONE[c.kind]} className="w-16 justify-center capitalize">{c.kind}</Badge>
                  <span className="min-w-0 flex-1 truncate" title={c.label}>{c.label}</span>
                  <span className="text-[10px] text-fg-subtle">{c.scope}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {proposal.warnings?.length ? (
          <ul className="space-y-0.5 rounded-md bg-warning-soft px-2 py-1.5 text-[11px] text-warning">
            {proposal.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
        {preview?.error && <p className="text-[11px] text-danger">Live preview unavailable: {preview.error}</p>}
        {usage && (
          <p className="text-[10px] text-fg-subtle">
            {usage.inputTokens ?? 0} in · {usage.outputTokens ?? 0} out tokens{usage.costUsd !== undefined ? ` · $${usage.costUsd.toFixed(4)}` : ''}
          </p>
        )}
      </div>
      {status === 'proposed' && (
        <div className="flex items-center gap-1.5 border-t border-border px-2.5 py-2">
          {!preview && (
            <Btn size="xs" variant="ghost" icon={<Eye className="size-3" />} onClick={() => previewProposal(proposal)}>
              Preview
            </Btn>
          )}
          <span className="flex-1" />
          <Btn size="xs" variant="secondary" icon={<X className="size-3" />} disabled={pending} onClick={() => discardProposal(m.id)}>
            Discard
          </Btn>
          <Btn
            size="xs"
            variant="primary"
            icon={<Check className="size-3" />}
            disabled={pending}
            onClick={() => {
              if (proposal.requiresConfirmation && !confirming) return setConfirming(true);
              void applyProposal(m.id);
            }}
          >
            {confirming ? 'Confirm — apply changes' : 'Apply'}
          </Btn>
        </div>
      )}
    </div>
  );
}

