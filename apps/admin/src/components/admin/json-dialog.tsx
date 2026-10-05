'use client';

import { Button, CodeEditor, Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader } from '@atrium/ui';
import { useState, type ReactNode } from 'react';

/** Parse a JSON object; returns an error message instead of throwing. */
export function parseJsonObject(text: string, opts: { numbersOnly?: boolean } = {}): { value: Record<string, unknown> } | { error: string } {
  let v: unknown;
  try {
    v = text.trim() === '' ? {} : JSON.parse(text);
  } catch (e) {
    return { error: (e as Error).message.replace(/^JSON\.parse: /, '') };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Must be a JSON object, e.g. { "key": 1 }' };
  if (opts.numbersOnly) {
    const bad = Object.entries(v as Record<string, unknown>).find(([, x]) => typeof x !== 'number' || !Number.isFinite(x));
    if (bad) return { error: `"${bad[0]}" must be a number` };
  }
  return { value: v as Record<string, unknown> };
}

/** Edit a JSON object in a dialog with validation. */
export function JsonDialog({ open, onOpenChange, title, description, value, onApply, numbersOnly, help }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; value: Record<string, unknown>; onApply: (v: Record<string, unknown>) => void; numbersOnly?: boolean; help?: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && <JsonDialogBody title={title} description={description} value={value} numbersOnly={numbersOnly} help={help} onApply={(v) => (onApply(v), onOpenChange(false))} />}
      </DialogContent>
    </Dialog>
  );
}

function JsonDialogBody({ title, description, value, numbersOnly, help, onApply }: { title: ReactNode; description?: ReactNode; value: Record<string, unknown>; numbersOnly?: boolean; help?: ReactNode; onApply: (v: Record<string, unknown>) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const parsed = parseJsonObject(text, { numbersOnly });
  const error = 'error' in parsed ? parsed.error : null;
  return (
    <>
      <DialogHeader title={title} description={description} />
      <DialogBody className="space-y-2">
        <CodeEditor value={text} onChange={setText} language="json" minRows={12} invalid={!!error} aria-label="JSON" />
        {error ? <p className="text-xs text-danger">{error}</p> : help ? <p className="text-xs text-fg-muted">{help}</p> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button variant="primary" size="sm" disabled={!!error} onClick={() => 'value' in parsed && onApply(parsed.value)}>
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}
