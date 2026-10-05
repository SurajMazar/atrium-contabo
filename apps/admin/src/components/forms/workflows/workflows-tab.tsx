'use client';

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createId, type FormAction, type FormField, type FormRule } from '@atrium/schema';
import {
  Badge,
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  SectionHeader,
  Switch,
  Tooltip,
} from '@atrium/ui';
import { ChevronDown, ChevronRight, Copy, GripVertical, MoreHorizontal, Plus, Trash2, Workflow } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Page } from '@/components/common/page';
import { useFormEditor } from '../builder/editor-context';
import { conditionFieldsFor } from '../builder/field-settings';
import { ConditionGroupEditor, summarizeConditions } from '../condition-group-editor';
import { restrictToVerticalAxis } from '../dnd';
import { countConditions, createAction, createRule } from '../form-model';
import { ActionCard, AddActionMenu } from './action-editor';

export function WorkflowsTab({ focusRuleId }: { focusRuleId?: string | null }) {
  const { draft, setDraft, readOnly, issues, organizationId } = useFormEditor();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const rules = draft.rules;
  const setRules = (fn: (r: FormRule[]) => FormRule[]) => setDraft((d) => ({ ...d, rules: fn(d.rules) }));

  const addRule = () => setRules((r) => [...r, createRule(r.length === 0 ? 'Notify team' : `Rule ${r.length + 1}`)]);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setRules((r) => {
      const from = r.findIndex((x) => x.id === e.active.id);
      const to = r.findIndex((x) => x.id === e.over!.id);
      return from < 0 || to < 0 ? r : arrayMove(r, from, to);
    });
  };

  return (
    <Page width="default" className="max-w-4xl">
      <SectionHeader
        title="Workflows"
        description="Rules run top to bottom after every submission. Each rule checks its conditions, then runs its Then or Else actions."
        actions={
          !readOnly &&
          rules.length > 0 && (
            <Button size="sm" leadingIcon={<Plus />} onClick={addRule}>
              Add rule
            </Button>
          )
        }
      />
      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState
            icon={<Workflow />}
            title="Automate what happens after a submission"
            description="Email your team, reply to the visitor, call a webhook, tag or assign the submission — conditionally."
            action={
              !readOnly && (
                <Button size="sm" variant="secondary" leadingIcon={<Plus />} onClick={addRule}>
                  Add rule
                </Button>
              )
            }
          />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
          <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3">
              {rules.map((rule, i) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  index={i}
                  fields={draft.fields}
                  organizationId={organizationId}
                  readOnly={readOnly}
                  issueCount={issues.filter((x) => x.target.tab === 'workflows' && x.target.ruleId === rule.id).length}
                  defaultOpen={focusRuleId ? focusRuleId === rule.id : rules.length <= 3}
                  onChange={(next) => setRules((r) => r.map((x) => (x.id === rule.id ? next : x)))}
                  onRemove={() => setRules((r) => r.filter((x) => x.id !== rule.id))}
                  onDuplicate={() =>
                    setRules((r) => {
                      const copy: FormRule = { ...structuredClone(rule), id: createId('rule'), name: `${rule.name} copy` };
                      const next = [...r];
                      next.splice(i + 1, 0, copy);
                      return next;
                    })
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </Page>
  );
}

function RuleCard({
  rule,
  index,
  fields,
  organizationId,
  readOnly,
  issueCount,
  defaultOpen,
  onChange,
  onRemove,
  onDuplicate,
}: {
  rule: FormRule;
  index: number;
  fields: FormField[];
  organizationId: string | undefined;
  readOnly: boolean;
  issueCount: number;
  defaultOpen: boolean;
  onChange: (r: FormRule) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id, disabled: readOnly });
  const condFields = conditionFieldsFor(fields);
  const hasConditions = countConditions(rule.when) > 0;
  const total = rule.then.length + rule.otherwise.length;

  const ctx = { fields, organizationId, disabled: readOnly };

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn('rounded-lg border border-border bg-surface', isDragging && 'relative z-10 shadow-popover', !rule.enabled && 'bg-surface-2/40')}>
      <div className="flex h-11 items-center gap-1.5 pl-1.5 pr-2">
        {!readOnly && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${rule.name}`}
            className="inline-flex size-6 cursor-grab items-center justify-center rounded-sm text-fg-subtle outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" strokeWidth={1.5} />
          </button>
        )}
        <IconButton label={open ? 'Collapse rule' : 'Expand rule'} size="xs" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronDown /> : <ChevronRight />}
        </IconButton>
        <span className="w-5 text-center text-xs tabular-nums text-fg-subtle">{index + 1}</span>
        <input
          aria-label="Rule name"
          value={rule.name}
          disabled={readOnly}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
          className="h-7 min-w-0 flex-1 rounded-sm bg-transparent px-1.5 text-sm font-medium text-fg outline-none hover:bg-surface-2 focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
        />
        {!open && (
          <span className="hidden max-w-[40%] truncate text-xs text-fg-muted md:inline">
            {hasConditions ? `When ${summarizeConditions(rule.when, condFields)}` : 'Always'} · {total} {total === 1 ? 'action' : 'actions'}
          </span>
        )}
        {issueCount > 0 && (
          <Badge tone="danger" size="xs">
            {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
          </Badge>
        )}
        <Tooltip content={rule.enabled ? 'Enabled' : 'Disabled'}>
          <span className="inline-flex">
            <Switch size="sm" aria-label="Rule enabled" checked={rule.enabled} disabled={readOnly} onCheckedChange={(enabled) => onChange({ ...rule, enabled })} />
          </span>
        </Tooltip>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Rule options" size="xs">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem icon={<Copy />} onSelect={onDuplicate}>
                Duplicate rule
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={onRemove}>
                Delete rule
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <Branch label="If">
            <ConditionGroupEditor value={rule.when} onChange={(when) => onChange({ ...rule, when })} fields={condFields} emptyLabel="Always run — no conditions" disabled={readOnly} />
          </Branch>
          <Branch label="Then">
            <ActionList actions={rule.then} onChange={(then) => onChange({ ...rule, then })} emptyText="No actions yet" {...ctx} />
          </Branch>
          {(hasConditions || rule.otherwise.length > 0) && (
            <Branch label="Else">
              <ActionList actions={rule.otherwise} onChange={(otherwise) => onChange({ ...rule, otherwise })} emptyText="Nothing happens when conditions don’t match" {...ctx} />
            </Branch>
          )}
          <div className="sm:pl-16">
            <Checkbox
              label="Stop processing"
              description="When this rule’s conditions match, skip the rules below it"
              checked={rule.stopProcessing}
              disabled={readOnly}
              onCheckedChange={(v) => onChange({ ...rule, stopProcessing: v === true })}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function Branch({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-4">
      <div className="pt-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ActionList({
  actions,
  onChange,
  emptyText,
  fields,
  organizationId,
  disabled,
}: {
  actions: FormAction[];
  onChange: (a: FormAction[]) => void;
  emptyText: string;
  fields: FormField[];
  organizationId: string | undefined;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {actions.length === 0 && <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-fg-muted">{emptyText}</p>}
      {actions.map((a, i) => (
        <ActionCard
          // Actions have no ids; index + type is stable enough for local editing.
          key={`${i}-${a.type}`}
          action={a}
          index={i}
          count={actions.length}
          fields={fields}
          organizationId={organizationId}
          disabled={disabled}
          onChange={(next) => onChange(actions.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(actions.filter((_, j) => j !== i))}
          onDuplicate={() => {
            const next = [...actions];
            next.splice(i + 1, 0, structuredClone(a));
            onChange(next);
          }}
          onMove={(dir) => onChange(arrayMove(actions, i, i + dir))}
        />
      ))}
      {!disabled && <AddActionMenu onAdd={(t) => onChange([...actions, createAction(t, fields)])} />}
    </div>
  );
}
