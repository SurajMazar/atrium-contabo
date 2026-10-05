'use client';

import { Button } from '@atrium/ui';

/** Sticky footer shown while a settings table has unsaved edits. */
export function SaveBar({ dirty, saving, onSave, onReset, message = 'You have unsaved changes', disabled }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void; message?: string; disabled?: boolean }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-surface px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-fg-muted">{message}</span>
        <Button size="sm" variant="ghost" onClick={onReset} disabled={saving}>
          Discard
        </Button>
        <Button size="sm" variant="primary" loading={saving} disabled={disabled} onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
