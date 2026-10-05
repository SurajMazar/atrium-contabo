'use client';

import { Sparkles } from 'lucide-react';
import { Btn, Segmented } from '../ui/primitives';
import { applyProposal, discardProposal, setPreviewSide } from './actions';
import { useAiStore } from './store';

/** Floating bar over the canvas while an AI proposal is being previewed. */
export function AiPreviewBar() {
  const preview = useAiStore((s) => s.preview);
  const pending = useAiStore((s) => s.pending);
  const message = useAiStore((s) => s.messages.find((m) => m.proposal?.generationId === s.preview?.generationId && m.status === 'proposed'));
  if (!preview || !message) return null;
  return (
    <div className="sticky top-3 z-20 mx-auto flex w-fit max-w-[92%] items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-popover">
      <Sparkles className="size-4 text-accent" />
      <span className="max-w-72 truncate text-[13px] font-medium">AI preview · {preview.changes.length} change{preview.changes.length === 1 ? '' : 's'}</span>
      {preview.error ? (
        <span className="text-xs text-danger">Preview unavailable: {preview.error}</span>
      ) : (
        <Segmented
          className="w-36"
          value={preview.showAfter ? 'after' : 'before'}
          onChange={(v) => setPreviewSide(v === 'after')}
          options={[
            { label: 'Before', value: 'before' },
            { label: 'After', value: 'after' },
          ]}
        />
      )}
      <Btn variant="secondary" size="sm" onClick={() => discardProposal(message.id)} disabled={pending}>
        Discard
      </Btn>
      <Btn variant="primary" size="sm" onClick={() => applyProposal(message.id)} disabled={pending}>
        Apply
      </Btn>
    </div>
  );
}
