'use client';

import { AlertTriangle, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media/media-picker';
import { getSaveController, useSaveStore } from './persistence/autosave';
import { reloadLatest } from './persistence/server';
import { useEditorStore, usePerms } from './store/editor';
import { useUiStore } from './store/ui';
import { Btn, Modal, TextInput } from './ui/primitives';

/** Shared MediaPicker instance opened via `requestMedia()` from anywhere in the builder. */
export function MediaPickerHost() {
  const req = useUiStore((s) => s.mediaRequest);
  const orgId = useEditorStore((s) => s.organizationId);
  const websiteId = useEditorStore((s) => s.websiteId);
  if (!orgId) return null;
  return (
    <MediaPicker
      open={!!req}
      onOpenChange={(o) => !o && useUiStore.setState({ mediaRequest: null })}
      organizationId={orgId}
      websiteId={websiteId ?? undefined}
      kind={req?.kind ?? 'image'}
      multiple={req?.multiple}
      onSelect={(media) => {
        req?.onSelect(media);
        useUiStore.setState({ mediaRequest: null });
      }}
    />
  );
}

export function PromptHost() {
  const prompt = useUiStore((s) => s.prompt);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(prompt?.initial ?? '');
  }, [prompt]);
  const close = () => useUiStore.setState({ prompt: null });
  const confirm = async () => {
    if (!prompt || !value.trim()) return;
    setBusy(true);
    try {
      await prompt.onConfirm(value.trim());
    } finally {
      setBusy(false);
      close();
    }
  };
  return (
    <Modal
      open={!!prompt}
      onOpenChange={(o) => !o && close()}
      title={prompt?.title ?? ''}
      description={prompt?.description}
      size="sm"
      footer={
        <>
          <Btn variant="secondary" onClick={close}>Cancel</Btn>
          <Btn variant="primary" disabled={!value.trim() || busy} onClick={confirm}>
            {busy ? 'Working…' : prompt?.confirmLabel}
          </Btn>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
        className="space-y-1"
      >
        <label className="text-xs text-fg-muted" htmlFor="builder-prompt">
          {prompt?.label}
        </label>
        <TextInput id="builder-prompt" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
      </form>
    </Modal>
  );
}

/** Non-blocking banners: save conflicts and view-only mode. */
export function EditorBanners() {
  const conflict = useSaveStore((s) => s.conflict);
  const perms = usePerms();
  const [busy, setBusy] = useState(false);
  return (
    <>
      {!perms.edit && (
        <div className="flex h-8 shrink-0 items-center justify-center gap-2 border-b border-border bg-surface-2 text-xs text-fg-muted">
          <Eye className="size-3.5" /> View only — you can browse and preview, but your role cannot edit pages.
        </div>
      )}
      {conflict && (
        <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-warning/30 bg-warning-soft px-3 py-1.5 text-xs text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>{conflict.label}</b> was changed by someone else since you opened it. Your edits are kept here and paused until you choose.
          </span>
          <Btn
            size="xs"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await reloadLatest().finally(() => setBusy(false));
            }}
          >
            Reload latest
          </Btn>
          <Btn
            size="xs"
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await getSaveController()?.overwrite().finally(() => setBusy(false));
            }}
          >
            Overwrite with mine
          </Btn>
        </div>
      )}
    </>
  );
}
