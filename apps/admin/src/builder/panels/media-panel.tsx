'use client';

import { useQuery } from '@tanstack/react-query';
import { ImageIcon, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { applyMediaToNode, firstMediaControl, getNode, insertTemplate, mediaRef } from '../actions';
import { registry } from '@atrium/component-registry';
import { useEditorStore, usePerms } from '../store/editor';
import { requestMedia, useSelectionStore } from '../store/ui';
import { Btn, Empty, PanelHeader } from '../ui/primitives';
import { dragSourceProps } from './drag';

function useMedia(orgId: string | null, websiteId: string | null) {
  const query = { websiteId: websiteId ?? undefined, type: 'image' as const, limit: 48 };
  return useQuery({
    queryKey: qk.media(orgId ?? '', query),
    queryFn: () => api.media.list(orgId!, query),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

function useMediaToCanvas() {
  return (m: Parameters<typeof mediaRef>[0]) => {
    const sel = useSelectionStore.getState().selectedId;
    const node = getNode(sel);
    if (node && firstMediaControl(node.type)) {
      applyMediaToNode(node.id, m);
      return;
    }
    const control = firstMediaControl('image');
    if (!control) return toast.message('Select an image element first', { description: 'Then click a photo to use it.' });
    const n = registry.createNode('image', { props: { [control]: { src: m.url, mediaId: m.id, alt: m.alt ?? undefined, width: m.width ?? undefined, height: m.height ?? undefined } } });
    insertTemplate(n, 'Image');
  };
}

export function MediaPanel() {
  const orgId = useEditorStore((s) => s.organizationId);
  const websiteId = useEditorStore((s) => s.websiteId);
  const perms = usePerms();
  const media = useMedia(orgId, websiteId);
  const use = useMediaToCanvas();
  const items = media.data?.items ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Media" actions={<Btn size="xs" variant="secondary" icon={<Upload className="size-3.5" />} disabled={!perms.edit} onClick={() => requestMedia({ kind: 'image', onSelect: ([m]) => m && use(m) })}>Library</Btn>} />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="px-1 pb-2 text-[11px] leading-4 text-fg-subtle">Drag a photo onto an image on the canvas to replace it, or into a layout to add it. Click to apply to the selection.</p>
        {media.isLoading && (
          <p className="flex items-center gap-2 px-1 text-xs text-fg-muted">
            <Loader2 className="size-3.5 animate-spin" /> Loading media…
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.alt ?? m.filename}
              disabled={!perms.edit}
              onClick={() => use(m)}
              {...dragSourceProps(() => ({ kind: 'media', media: { url: m.url, alt: m.alt, width: m.width, height: m.height, id: m.id, mimeType: m.mimeType } }), perms.edit)}
              className="group relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-surface-2 hover:border-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.variants?.find((v) => v.width <= 480)?.url ?? m.url} alt={m.alt ?? ''} loading="lazy" className="size-full object-cover" draggable={false} />
              {!m.alt && <span className="absolute left-1 top-1 rounded bg-warning px-1 text-[9px] font-semibold uppercase text-white">no alt</span>}
            </button>
          ))}
        </div>
        {!media.isLoading && !items.length && (
          <Empty icon={<ImageIcon className="size-6" />} title="No images yet">
            Upload photos to the media library to use them here.
          </Empty>
        )}
        {media.isError && <p className="px-1 py-2 text-xs text-danger">Could not load media.</p>}
      </div>
    </div>
  );
}
