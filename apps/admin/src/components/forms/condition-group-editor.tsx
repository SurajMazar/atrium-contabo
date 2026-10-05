'use client';

import { ConditionOperatorSchema, type Condition, type ConditionGroup, type ConditionOperator } from '@atrium/schema';
import { Button, cn, Combobox, IconButton, Input, Select, TagInput } from '@atrium/ui';
import { ListPlus, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';

/** A field that conditions can reference. `type` lets the value input adapt. */
export interface ConditionFieldOption {
  /** Path evaluated against submission data (form field `name`). */
  value: string;
  label: string;
  type?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface ConditionGroupEditorProps {
  value: ConditionGroup | undefined;
  /** Emits `undefined` when the last condition is removed. */
  onChange: (next: ConditionGroup | undefined) => void;
  fields: ConditionFieldOption[];
  /** Text shown when there are no conditions (e.g. "Always visible"). */
  emptyLabel?: ReactNode;
  /** Max nesting depth of groups (root = 0). */
  maxDepth?: number;
  disabled?: boolean;
  className?: string;
}

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: 'is',
  neq: 'is not',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  contains: 'contains',
  notContains: 'does not contain',
  in: 'is any of',
  notIn: 'is none of',
  empty: 'is empty',
  notEmpty: 'is not empty',
  matches: 'matches pattern',
};

const OPERATORS = ConditionOperatorSchema.options;
const VALUELESS = new Set<ConditionOperator>(['empty', 'notEmpty']);
const LIST_OPS = new Set<ConditionOperator>(['in', 'notIn']);
const NUMERIC_OPS = new Set<ConditionOperator>(['gt', 'gte', 'lt', 'lte']);

function isGroup(c: Condition | ConditionGroup): c is ConditionGroup {
  return 'match' in c && Array.isArray((c as ConditionGroup).conditions);
}

function defaultOp(field: ConditionFieldOption | undefined): ConditionOperator {
  if (!field) return 'eq';
  if (field.type === 'textarea') return 'contains';
  if (field.type === 'file') return 'notEmpty';
  return 'eq';
}

function newCondition(fields: ConditionFieldOption[]): Condition {
  const f = fields[0];
  return { field: f?.value ?? '', op: defaultOp(f), value: f?.options?.[0]?.value ?? (f?.type === 'consent' ? true : '') };
}

/** Coerce a condition's value when the field or operator changes. */
function coerceValue(c: Condition, field: ConditionFieldOption | undefined): unknown {
  if (VALUELESS.has(c.op)) return undefined;
  if (LIST_OPS.has(c.op)) {
    if (Array.isArray(c.value)) return c.value.map(String);
    return c.value === undefined || c.value === '' ? [] : [String(c.value)];
  }
  const scalar = Array.isArray(c.value) ? c.value[0] : c.value;
  if (field && (field.type === 'number' || field.type === 'rating') && (NUMERIC_OPS.has(c.op) || c.op === 'eq' || c.op === 'neq')) {
    const n = Number(scalar);
    return scalar === '' || scalar === undefined || Number.isNaN(n) ? '' : n;
  }
  return scalar ?? '';
}

/**
 * Recursive editor for `ConditionGroup` (all/any with nested groups).
 * Used for form field visibility (`showIf`) and workflow rule conditions (`when`).
 */
export function ConditionGroupEditor({ value, onChange, fields, emptyLabel = 'No conditions', maxDepth = 2, disabled, className }: ConditionGroupEditorProps) {
  const hasAny = !!value && value.conditions.length > 0;
  if (!hasAny) {
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2', className)}>
        <span className="text-xs text-fg-muted">{emptyLabel}</span>
        <Button
          size="xs"
          variant="ghost"
          leadingIcon={<Plus />}
          disabled={disabled || fields.length === 0}
          title={fields.length === 0 ? 'Add another field to build conditions' : undefined}
          onClick={() => onChange({ match: 'all', conditions: [newCondition(fields)] })}
        >
          Add condition
        </Button>
      </div>
    );
  }
  return (
    <div className={className}>
      <GroupEditor group={value} depth={0} maxDepth={maxDepth} fields={fields} disabled={disabled} onChange={(g) => onChange(g && g.conditions.length ? g : undefined)} />
    </div>
  );
}

function GroupEditor({
  group,
  depth,
  maxDepth,
  fields,
  disabled,
  onChange,
  onRemove,
}: {
  group: ConditionGroup;
  depth: number;
  maxDepth: number;
  fields: ConditionFieldOption[];
  disabled?: boolean;
  onChange: (g: ConditionGroup | undefined) => void;
  onRemove?: () => void;
}) {
  const setAt = (i: number, next: Condition | ConditionGroup | undefined) => {
    const conditions = [...group.conditions];
    if (next === undefined) conditions.splice(i, 1);
    else conditions[i] = next;
    if (!conditions.length && onRemove) onRemove();
    else onChange({ ...group, conditions });
  };
  const add = (c: Condition | ConditionGroup) => onChange({ ...group, conditions: [...group.conditions, c] });

  return (
    <div className={cn('space-y-2', depth > 0 && 'rounded-md border border-border bg-surface-2/40 p-2.5')}>
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span>Match</span>
        <Select
          size="xs"
          className="w-[72px]"
          aria-label="Match mode"
          value={group.match}
          onValueChange={(v) => onChange({ ...group, match: v as ConditionGroup['match'] })}
          disabled={disabled}
          options={[
            { value: 'all', label: 'all' },
            { value: 'any', label: 'any' },
          ]}
        />
        <span>of the following</span>
        {onRemove && (
          <IconButton label="Remove group" size="xs" className="ml-auto" onClick={onRemove} disabled={disabled}>
            <X />
          </IconButton>
        )}
      </div>
      <ul className="space-y-2">
        {group.conditions.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1.5 w-8 shrink-0 text-right text-2xs font-medium uppercase tracking-wide text-fg-subtle">{i === 0 ? 'If' : group.match === 'all' ? 'and' : 'or'}</span>
            <div className="min-w-0 flex-1">
              {isGroup(c) ? (
                <GroupEditor group={c} depth={depth + 1} maxDepth={maxDepth} fields={fields} disabled={disabled} onChange={(g) => setAt(i, g)} onRemove={() => setAt(i, undefined)} />
              ) : (
                <ConditionRow condition={c} fields={fields} disabled={disabled} onChange={(n) => setAt(i, n)} onRemove={() => setAt(i, undefined)} />
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1 pl-10">
        <Button size="xs" variant="ghost" leadingIcon={<Plus />} disabled={disabled || !fields.length} onClick={() => add(newCondition(fields))}>
          Condition
        </Button>
        {depth < maxDepth && (
          <Button
            size="xs"
            variant="ghost"
            leadingIcon={<ListPlus />}
            disabled={disabled || !fields.length}
            onClick={() => add({ match: group.match === 'all' ? 'any' : 'all', conditions: [newCondition(fields)] })}
          >
            Group
          </Button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({ condition, fields, disabled, onChange, onRemove }: { condition: Condition; fields: ConditionFieldOption[]; disabled?: boolean; onChange: (c: Condition) => void; onRemove: () => void }) {
  const field = fields.find((f) => f.value === condition.field);
  const fieldOptions = field
    ? fields.map((f) => ({ value: f.value, label: f.label }))
    : [...(condition.field ? [{ value: condition.field, label: `${condition.field} (missing)` }] : []), ...fields.map((f) => ({ value: f.value, label: f.label }))];

  return (
    <div className="flex flex-wrap items-start gap-1.5">
      <Select
        size="sm"
        className={cn('w-[140px] flex-1 basis-[140px]', !field && condition.field && 'text-danger')}
        aria-label="Field"
        placeholder="Field"
        value={condition.field || undefined}
        disabled={disabled}
        options={fieldOptions}
        onValueChange={(v) => {
          const nf = fields.find((f) => f.value === v);
          const next: Condition = { field: v, op: condition.op, value: undefined };
          next.value = nf?.options?.length && !LIST_OPS.has(next.op) && !VALUELESS.has(next.op) ? nf.options[0]!.value : coerceValue({ ...next, value: '' }, nf);
          onChange(next);
        }}
      />
      <Select
        size="sm"
        className="w-[136px] flex-1 basis-[120px]"
        aria-label="Operator"
        value={condition.op}
        disabled={disabled}
        options={OPERATORS.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
        onValueChange={(v) => {
          const next = { ...condition, op: v as ConditionOperator };
          onChange({ ...next, value: coerceValue(next, field) });
        }}
      />
      {!VALUELESS.has(condition.op) && (
        <div className="min-w-[120px] flex-[2] basis-[140px]">
          <ValueInput condition={condition} field={field} disabled={disabled} onChange={(value) => onChange({ ...condition, value })} />
        </div>
      )}
      <IconButton label="Remove condition" size="sm" onClick={onRemove} disabled={disabled}>
        <X />
      </IconButton>
    </div>
  );
}

function ValueInput({ condition, field, disabled, onChange }: { condition: Condition; field: ConditionFieldOption | undefined; disabled?: boolean; onChange: (v: unknown) => void }) {
  const opts = field?.options ?? [];
  const op = condition.op;

  if (LIST_OPS.has(op)) {
    const arr = Array.isArray(condition.value) ? condition.value.map(String) : [];
    if (opts.length)
      return <Combobox multiple size="sm" aria-label="Values" value={arr} onChange={onChange} disabled={disabled} options={opts.map((o) => ({ value: o.value, label: o.label }))} placeholder="Choose values" />;
    return <TagInput value={arr} onChange={onChange} disabled={disabled} placeholder="Type and press Enter" className="min-h-7" />;
  }

  if (opts.length && op !== 'matches' && !NUMERIC_OPS.has(op)) {
    const v = String(condition.value ?? '');
    const options = opts.some((o) => o.value === v) || !v ? opts : [{ label: `${v} (missing)`, value: v }, ...opts];
    return <Select size="sm" aria-label="Value" value={v || undefined} placeholder="Value" disabled={disabled} onValueChange={onChange} options={options.filter((o) => o.value !== '').map((o) => ({ value: o.value, label: o.label }))} />;
  }

  if (field?.type === 'consent' || (field?.type === 'checkbox' && !opts.length)) {
    const v = condition.value === true || condition.value === 'true' ? 'true' : 'false';
    return (
      <Select
        size="sm"
        aria-label="Value"
        value={v}
        disabled={disabled}
        onValueChange={(x) => onChange(x === 'true')}
        options={[
          { value: 'true', label: 'Checked' },
          { value: 'false', label: 'Not checked' },
        ]}
      />
    );
  }

  const numeric = field?.type === 'number' || field?.type === 'rating';
  const inputType = op === 'matches' ? 'text' : numeric ? 'number' : field?.type === 'date' ? 'date' : field?.type === 'time' ? 'time' : field?.type === 'datetime' ? 'datetime-local' : 'text';
  return (
    <Input
      size="sm"
      aria-label="Value"
      type={inputType}
      className={cn(op === 'matches' && 'font-mono text-xs')}
      placeholder={op === 'matches' ? '^[A-Z].*' : 'Value'}
      value={condition.value === undefined || condition.value === null ? '' : String(condition.value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        if (numeric && op !== 'matches' && raw !== '' && !Number.isNaN(Number(raw))) onChange(Number(raw));
        else onChange(raw);
      }}
    />
  );
}

/** Short human summary for collapsed views: "email is not empty and 2 more". */
export function summarizeConditions(g: ConditionGroup | undefined, fields: ConditionFieldOption[]): string {
  if (!g || !g.conditions.length) return '';
  const first = g.conditions[0]!;
  const label = (c: Condition) => {
    const f = fields.find((x) => x.value === c.field);
    const v = VALUELESS.has(c.op) ? '' : ` ${Array.isArray(c.value) ? c.value.join(', ') : (f?.options?.find((o) => o.value === String(c.value))?.label ?? String(c.value ?? ''))}`;
    return `${f?.label ?? c.field} ${OPERATOR_LABELS[c.op]}${v}`;
  };
  const head = isGroup(first) ? `(${first.conditions.length} conditions)` : label(first);
  const rest = g.conditions.length - 1;
  return rest > 0 ? `${head} ${g.match === 'all' ? 'and' : 'or'} ${rest} more` : head;
}
