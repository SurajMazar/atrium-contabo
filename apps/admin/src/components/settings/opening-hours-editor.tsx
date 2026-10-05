'use client';

import { Button, ChoiceChips, EmptyState, IconButton, Input } from '@atrium/ui';
import { Clock, Plus, Trash2 } from 'lucide-react';

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];
const DAY_LABEL: Record<Day, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export interface HoursRow {
  key: string;
  days: Day[];
  opens: string;
  closes: string;
  label: string;
}

let seq = 0;
export const hoursKey = () => `h${Date.now().toString(36)}${(seq++).toString(36)}`;

export function hoursErrors(rows: HoursRow[]): Record<string, string> {
  const e: Record<string, string> = {};
  for (const r of rows) {
    if (!r.days.length) e[r.key] = 'Pick at least one day';
    else if (!r.opens || !r.closes) e[r.key] = 'Set opening and closing times';
  }
  return e;
}

export function OpeningHoursEditor({ value, onChange, disabled }: { value: HoursRow[]; onChange: (rows: HoursRow[]) => void; disabled?: boolean }) {
  const errs = hoursErrors(value);
  const update = (key: string, patch: Partial<HoursRow>) => onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    const usedDays = new Set(value.flatMap((r) => r.days));
    const weekdays = DAYS.slice(0, 5).filter((d) => !usedDays.has(d));
    const rest = DAYS.filter((d) => !usedDays.has(d));
    onChange([...value, { key: hoursKey(), days: weekdays.length ? weekdays : rest.slice(0, 1), opens: '09:00', closes: '17:00', label: '' }]);
  };

  if (value.length === 0)
    return (
      <div className="rounded-md border border-dashed border-border-strong">
        <EmptyState compact icon={<Clock />} title="No opening hours" description="Shown in the footer, contact blocks and LocalBusiness structured data." action={<Button size="sm" leadingIcon={<Plus />} onClick={add} disabled={disabled}>Add hours</Button>} />
      </div>
    );

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-md border border-border">
        {value.map((r) => (
          <li key={r.key} className="space-y-2.5 px-3 py-3">
            <div className="flex items-start gap-3">
              <ChoiceChips<Day> multiple options={DAYS.map((d) => ({ value: d, label: DAY_LABEL[d] }))} value={r.days} onChange={(days) => !disabled && update(r.key, { days: DAYS.filter((d) => (days as Day[]).includes(d)) })} className="flex-1" />
              <IconButton label="Remove hours" size="sm" variant="ghost" onClick={() => onChange(value.filter((x) => x.key !== r.key))} disabled={disabled}>
                <Trash2 />
              </IconButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input size="sm" type="time" value={r.opens} onChange={(e) => update(r.key, { opens: e.target.value })} disabled={disabled} aria-label="Opens" className="w-28" />
              <span className="text-sm text-fg-subtle">to</span>
              <Input size="sm" type="time" value={r.closes} onChange={(e) => update(r.key, { closes: e.target.value })} disabled={disabled} aria-label="Closes" className="w-28" />
              <Input size="sm" value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} disabled={disabled} placeholder="Label, e.g. Restaurant" aria-label="Label" className="min-w-40 flex-1" />
            </div>
            {errs[r.key] && <p className="text-xs text-danger">{errs[r.key]}</p>}
            {r.closes && r.opens && r.closes <= r.opens && !errs[r.key] && <p className="text-xs text-fg-muted">Closes after midnight.</p>}
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" leadingIcon={<Plus />} onClick={add} disabled={disabled}>
        Add hours
      </Button>
    </div>
  );
}
