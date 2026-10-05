'use client';

import { Button, cn, Kbd } from '@atrium/ui';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

/** Lets a parent screen know whether the active section has unsaved edits. */
export const DirtyContext = createContext<((dirty: boolean) => void) | null>(null);

export function useReportDirty(dirty: boolean) {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report?.(dirty);
    return () => report?.(false);
  }, [dirty, report]);
}

/** Warn before closing the tab with unsaved edits. */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}

export interface SaveBarProps {
  dirty: boolean;
  saving?: boolean;
  disabled?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  message?: ReactNode;
  saveLabel?: string;
  className?: string;
}

/**
 * Sticky unsaved-changes bar. Renders only while dirty. ⌘S / Ctrl+S saves.
 */
export function SaveBar({ dirty, saving, disabled, onSave, onDiscard, message = 'You have unsaved changes', saveLabel = 'Save changes', className }: SaveBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dirty) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore bars inside hidden tabs.
      if (!ref.current || ref.current.offsetParent === null) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving && !disabled) onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, disabled, onSave]);

  if (!dirty) return null;
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Unsaved changes"
      className={cn('sticky bottom-0 z-20 mt-6 flex items-center gap-3 border-t border-border bg-surface/95 py-3 animate-fade-in', className)}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{message}</span>
      <span className="hidden items-center gap-1 text-xs text-fg-subtle lg:inline-flex">
        <Kbd>⌘</Kbd>
        <Kbd>S</Kbd>
      </span>
      <Button size="sm" variant="ghost" onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button size="sm" variant="primary" onClick={onSave} loading={saving} disabled={disabled}>
        {saveLabel}
      </Button>
    </div>
  );
}
