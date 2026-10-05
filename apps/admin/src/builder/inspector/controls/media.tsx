'use client';

import type { MediaRef } from '@atrium/schema';
import { Crosshair, ImageIcon, RefreshCw, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { mediaRef } from '../../actions';
import { requestMedia } from '../../store/ui';
import { Btn, CommitInput, Row } from '../../ui/primitives';
import type { ControlProps } from './types';

function asRef(v: unknown): MediaRef | null {
  if (!v) return null;
  if (typeof v === 'string') return { src: v };
  if (typeof v === 'object' && typeof (v as MediaRef).src === 'string') return v as MediaRef;
  return null;
}

/**
 * Media prop editor: opens the shared MediaPicker, shows a thumbnail with a
 * focal-point picker, and edits alt text. String-valued props (`src`) are
 * kept as strings.
 */
export function MediaControl({ value, onChange, control, disabled, node }: ControlProps<unknown>) {
  const ref = asRef(value);
  const stringMode = typeof value === 'string' || control.name.endsWith('src');
  const [focal, setFocal] = useState(false);
  const isVideo = control.mediaKind === 'video' || ref?.mimeType?.startsWith('video') || /\.(mp4|webm|mov)(\?|$)/i.test(ref?.src ?? '');

  const pick = () =>
    requestMedia({
      kind: control.mediaKind ?? 'image',
      onSelect: ([m]) => {
        if (!m) return;
        if (stringMode) onChange(m.url);
        else onChange({ ...mediaRef(m), ...(ref?.alt && !m.alt ? { alt: ref.alt } : {}) });
      },
    });

  const patch = (p: Partial<MediaRef>, mergeKey?: string) => {
    if (!ref || stringMode) return;
    onChange({ ...ref, ...p }, mergeKey ? { mergeKey } : undefined);
  };

  if (!ref) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={pick}
        className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong bg-surface-2 text-xs text-fg-muted hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {isVideo ? <Video className="size-5" /> : <ImageIcon className="size-5" />}
        Choose {control.mediaKind === 'video' ? 'video' : 'image'}
      </button>
    );
  }

  const fp = ref.focalPoint ?? { x: 0.5, y: 0.5 };
  return (
    <div className="space-y-2">
      <div
        className="group relative aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2"
        onClick={(e) => {
          if (!focal || disabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          patch({ focalPoint: { x: Math.round(((e.clientX - r.left) / r.width) * 100) / 100, y: Math.round(((e.clientY - r.top) / r.height) * 100) / 100 } });
        }}
        style={{ cursor: focal ? 'crosshair' : undefined }}
      >
        {isVideo ? (
          <video src={ref.src} poster={ref.poster} muted className="size-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ref.src} alt={ref.alt ?? ''} className="size-full object-cover" style={{ objectPosition: `${fp.x * 100}% ${fp.y * 100}%` }} draggable={false} />
        )}
        {focal && (
          <span className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]" style={{ left: `${fp.x * 100}%`, top: `${fp.y * 100}%` }} />
        )}
        {!focal && !disabled && (
          <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Btn size="xs" variant="secondary" onClick={pick} icon={<RefreshCw className="size-3" />}>
              Replace
            </Btn>
            <Btn size="xs" variant="secondary" onClick={() => onChange(undefined)} aria-label="Remove" icon={<Trash2 className="size-3" />} />
          </div>
        )}
      </div>
      {!stringMode && !isVideo && (
        <>
          <Row label="Alt text" help="Describe the image for screen readers and SEO.">
            <CommitInput value={ref.alt ?? ''} disabled={disabled} placeholder="Describe the image" onCommit={(alt) => patch({ alt: alt || undefined }, `alt:${node?.id}:${control.name}`)} />
          </Row>
          <div className="flex items-center justify-between">
            <Btn size="xs" variant={focal ? 'subtle' : 'ghost'} active={focal} disabled={disabled} onClick={() => setFocal((f) => !f)} icon={<Crosshair className="size-3.5" />}>
              {focal ? 'Click image to set focus' : 'Focal point'}
            </Btn>
            {ref.focalPoint && (
              <Btn size="xs" variant="ghost" onClick={() => patch({ focalPoint: undefined })}>
                Reset
              </Btn>
            )}
          </div>
        </>
      )}
    </div>
  );
}
