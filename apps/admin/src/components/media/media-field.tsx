'use client';

import type { Media } from '@atrium/sdk';
import { Button, cn, IconButton } from '@atrium/ui';
import { ImageIcon, Replace, X } from 'lucide-react';
import { useState } from 'react';
import { MediaPicker } from './media-picker';

export interface MediaFieldProps {
  /** Current URL (or empty). */
  value: string | undefined | null;
  /** Receives the chosen URL and full media record (null when cleared). */
  onChange: (url: string | undefined, media: Media | null) => void;
  organizationId: string;
  websiteId?: string;
  kind?: 'image' | 'video' | 'any';
  id?: string;
  disabled?: boolean;
  /** Preview aspect; 'square' for favicons/logos. */
  aspect?: 'wide' | 'square';
  className?: string;
  placeholder?: string;
}

/** Single media slot with preview, choose/replace and clear (uses MediaPicker). */
export function MediaField({ value, onChange, organizationId, websiteId, kind = 'image', id, disabled, aspect = 'wide', className, placeholder = 'Choose image' }: MediaFieldProps) {
  const [open, setOpen] = useState(false);
  const isVideo = value ? /\.(mp4|webm|mov)(\?|$)/i.test(value) : false;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={value ? 'Replace media' : placeholder}
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2 text-fg-subtle outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring',
          aspect === 'square' ? 'size-14' : 'h-14 w-24',
          !value && 'border-dashed',
        )}
        style={{ backgroundImage: 'linear-gradient(45deg, var(--ui-surface-3) 25%, transparent 25%, transparent 75%, var(--ui-surface-3) 75%), linear-gradient(45deg, var(--ui-surface-3) 25%, transparent 25%, transparent 75%, var(--ui-surface-3) 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 5px 5px' }}
      >
        {value ? (
          isVideo ? (
            <video src={value} className="size-full object-cover" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-contain" />
          )
        ) : (
          <ImageIcon className="size-4" strokeWidth={1.5} />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {value ? <span className="truncate font-mono text-2xs text-fg-subtle" title={value}>{value.split('/').pop()}</span> : <span className="text-xs text-fg-muted">No file selected</span>}
        <div className="flex items-center gap-1">
          <Button size="xs" leadingIcon={value ? <Replace /> : <ImageIcon />} onClick={() => setOpen(true)} disabled={disabled}>
            {value ? 'Replace' : placeholder}
          </Button>
          {value && (
            <IconButton label="Remove" size="xs" onClick={() => onChange(undefined, null)} disabled={disabled}>
              <X />
            </IconButton>
          )}
        </div>
      </div>
      <MediaPicker open={open} onOpenChange={setOpen} organizationId={organizationId} websiteId={websiteId} kind={kind} onSelect={(m) => m[0] && onChange(m[0].url, m[0])} />
    </div>
  );
}
