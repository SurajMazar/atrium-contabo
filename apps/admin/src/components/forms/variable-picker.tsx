'use client';

import type { FormField } from '@atrium/schema';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, IconButton, Tooltip } from '@atrium/ui';
import { Braces } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { isInputField } from './form-model';

const SYSTEM_VARS = [
  { token: '{{submission.id}}', label: 'Submission ID' },
  { token: '{{website.name}}', label: 'Website name' },
  { token: '{{form.name}}', label: 'Form name' },
];

/** Menu that inserts `{{token}}` placeholders for fields and system values. */
export function VariablePicker({ fields, onInsert, disabled }: { fields: FormField[]; onInsert: (token: string) => void; disabled?: boolean }) {
  const inputs = fields.filter(isInputField);
  return (
    <DropdownMenu>
      <Tooltip content="Insert variable">
        <DropdownMenuTrigger asChild>
          <IconButton label="Insert variable" size="sm" variant="ghost" disabled={disabled}>
            <Braces />
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        {inputs.length > 0 && <DropdownMenuLabel>Fields</DropdownMenuLabel>}
        {inputs.map((f) => (
          <DropdownMenuItem key={f.id} onSelect={() => onInsert(`{{${f.name}}}`)} shortcut={<span className="font-mono">{`{{${f.name}}}`}</span>}>
            {f.label || f.name}
          </DropdownMenuItem>
        ))}
        {inputs.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuLabel>System</DropdownMenuLabel>
        {SYSTEM_VARS.map((v) => (
          <DropdownMenuItem key={v.token} onSelect={() => onInsert(v.token)} shortcut={<span className="font-mono">{v.token}</span>}>
            {v.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Insert text at the caret of an input/textarea (falls back to appending). */
export function useInsertAtCursor<T extends HTMLInputElement | HTMLTextAreaElement>(value: string, onChange: (v: string) => void) {
  const ref = useRef<T>(null);
  const insert = useCallback(
    (token: string) => {
      const el = ref.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + token + value.slice(end));
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [value, onChange],
  );
  return { ref, insert };
}

/** Append a token inside the last paragraph of an HTML string. */
export function appendTokenToHtml(html: string, token: string): string {
  if (!html.trim()) return `<p>${token}</p>`;
  return /<\/p>\s*$/.test(html) ? html.replace(/<\/p>\s*$/, ` ${token}</p>`) : `${html} ${token}`;
}
