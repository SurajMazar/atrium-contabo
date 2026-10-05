'use client';

import { SUBMISSION_STATUSES, type FormAction, type FormField } from '@atrium/schema';
import type { SubmissionStatus } from '@atrium/sdk';
import {
  Banner,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  IconButton,
  Input,
  Label,
  SegmentedControl,
  Select,
  TagInput,
  Textarea,
} from '@atrium/ui';
import { ArrowDown, ArrowUp, CircleDot, Copy, Mail, MoreHorizontal, Plus, Reply, Smartphone, Tag, Trash2, UserPlus, Webhook, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { RichTextEditor } from '@/components/common/rich-text';
import { SUBMISSION_STATUS_META } from '@/components/common/status';
import { ACTION_META } from '../form-model';
import { useEmailProviders, useMembers, useSmsProviders, useWebhooks } from '../queries';
import { appendTokenToHtml, useInsertAtCursor, VariablePicker } from '../variable-picker';

export const ACTION_ICONS: Record<FormAction['type'], LucideIcon> = {
  email: Mail,
  autoresponder: Reply,
  sms: Smartphone,
  webhook: Webhook,
  tag: Tag,
  assign: UserPlus,
  status: CircleDot,
};

type Of<T extends FormAction['type']> = Extract<FormAction, { type: T }>;

interface Ctx {
  fields: FormField[];
  organizationId: string | undefined;
  disabled?: boolean;
}

/* ------------------------------------------------------------------ Card */

export function ActionCard({
  action,
  index,
  count,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  ...ctx
}: Ctx & {
  action: FormAction;
  index: number;
  count: number;
  onChange: (a: FormAction) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const Icon = ACTION_ICONS[action.type];
  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex h-9 items-center gap-2 border-b border-border pl-3 pr-1">
        <Icon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
        <span className="text-sm font-medium">{ACTION_META[action.type].label}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{summarizeAction(action)}</span>
        {!ctx.disabled && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Action options" size="xs">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem icon={<ArrowUp />} disabled={index === 0} onSelect={() => onMove(-1)}>
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem icon={<ArrowDown />} disabled={index === count - 1} onSelect={() => onMove(1)}>
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Copy />} onSelect={onDuplicate}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} tone="danger" onSelect={onRemove}>
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="space-y-3 p-3">
        <ActionBody action={action} onChange={onChange} {...ctx} />
      </div>
    </div>
  );
}

export function summarizeAction(a: FormAction): string {
  switch (a.type) {
    case 'email':
      return a.to.length ? `to ${a.to.join(', ')}` : 'No recipients yet';
    case 'autoresponder':
      return `to {{${a.emailField}}}`;
    case 'sms':
      return a.to.length ? `to ${a.to.join(', ')}` : 'No recipients yet';
    case 'webhook':
      return a.url ?? (a.webhookId ? 'Saved webhook' : 'Not configured');
    case 'tag':
      return a.tags.join(', ') || 'No tags yet';
    case 'assign':
      return a.userId ? '' : 'No teammate chosen';
    case 'status':
      return SUBMISSION_STATUS_META[a.status.toUpperCase() as SubmissionStatus]?.label ?? a.status;
  }
}

function ActionBody(props: Ctx & { action: FormAction; onChange: (a: FormAction) => void }) {
  const { action } = props;
  switch (action.type) {
    case 'email':
      return <EmailAction {...props} action={action} />;
    case 'autoresponder':
      return <AutoresponderAction {...props} action={action} />;
    case 'sms':
      return <SmsAction {...props} action={action} />;
    case 'webhook':
      return <WebhookAction {...props} action={action} />;
    case 'tag':
      return (
        <Field label="Tags" help="Added to the submission when this runs">
          <TagInput value={action.tags} onChange={(tags) => props.onChange({ ...action, tags })} placeholder="vip, wedding" transform={(t) => t.trim().toLowerCase()} disabled={props.disabled} />
        </Field>
      );
    case 'assign':
      return <AssignAction {...props} action={action} />;
    case 'status':
      return (
        <Field label="Status">
          <Select
            size="sm"
            value={action.status}
            onValueChange={(status) => props.onChange({ ...action, status })}
            disabled={props.disabled}
            options={SUBMISSION_STATUSES.map((s) => ({ value: s, label: SUBMISSION_STATUS_META[s.toUpperCase() as SubmissionStatus]?.label ?? s }))}
          />
        </Field>
      );
  }
}

/* ------------------------------------------------------------- Inputs */

function TemplatedInput({ label, value, onChange, fields, placeholder, disabled, help }: { label: string; value: string; onChange: (v: string) => void; fields: FormField[]; placeholder?: string; disabled?: boolean; help?: string }) {
  const id = useId();
  const { ref, insert } = useInsertAtCursor<HTMLInputElement>(value, onChange);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <Input ref={ref} id={id} size="sm" className="flex-1" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        <VariablePicker fields={fields} onInsert={insert} disabled={disabled} />
      </div>
      {help && <p className="text-xs text-fg-muted">{help}</p>}
    </div>
  );
}

function HtmlBodyInput({ label, value, onChange, fields, disabled }: { label: string; value: string; onChange: (v: string) => void; fields: FormField[]; disabled?: boolean }) {
  const [mode, setMode] = useState<'rich' | 'html'>('rich');
  const { ref, insert } = useInsertAtCursor<HTMLTextAreaElement>(value, onChange);
  return (
    <Field
      label={label}
      hint={
        <span className="flex items-center gap-1">
          <SegmentedControl
            size="xs"
            aria-label="Body editor"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'rich', label: 'Rich text' },
              { value: 'html', label: 'HTML' },
            ]}
          />
          <VariablePicker fields={fields} disabled={disabled} onInsert={(t) => (mode === 'html' ? insert(t) : onChange(appendTokenToHtml(value, t)))} />
        </span>
      }
    >
      {mode === 'rich' ? (
        <RichTextEditor compact value={value} onChange={onChange} minHeight={96} disabled={disabled} placeholder="Write the message…" />
      ) : (
        <Textarea ref={ref} mono rows={6} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      )}
    </Field>
  );
}

function ProviderSelect({ value, onChange, query, kindLabel, organizationId, disabled }: { value: string | undefined; onChange: (v: string | undefined) => void; query: ReturnType<typeof useEmailProviders>; kindLabel: string; organizationId: string | undefined; disabled?: boolean }) {
  const list = query.data ?? [];
  return (
    <Field
      label="Provider"
      optional
      hint={
        organizationId && !query.isLoading && list.length === 0 ? (
          <Link href={`/org/${organizationId}/integrations`} className="text-accent hover:underline">
            Configure {kindLabel}
          </Link>
        ) : undefined
      }
    >
      <Select
        size="sm"
        value={value && list.some((p) => p.id === value) ? value : '__default'}
        onValueChange={(v) => onChange(v === '__default' ? undefined : v)}
        disabled={disabled || query.isLoading}
        options={[{ value: '__default', label: 'Organization default' }, ...list.map((p) => ({ value: p.id, label: p.name, description: [p.driver, p.fromEmail].filter(Boolean).join(' · ') }))]}
      />
    </Field>
  );
}

/* ------------------------------------------------------------- Actions */

function EmailAction({ action, onChange, fields, organizationId, disabled }: Ctx & { action: Of<'email'>; onChange: (a: FormAction) => void }) {
  const providers = useEmailProviders(organizationId);
  const members = useMembers(organizationId);
  const [showCopies, setShowCopies] = useState(!!(action.cc?.length || action.bcc?.length));
  const suggestions = [...fields.filter((f) => f.type === 'email').map((f) => `{{${f.name}}}`), ...(members.data ?? []).map((m) => m.user.email)];
  return (
    <>
      <Field
        label="To"
        required
        help="Press Enter or comma after each address. Use {{email}} to include the submitter."
        hint={
          !showCopies && (
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowCopies(true)}>
              Add Cc/Bcc
            </button>
          )
        }
      >
        <TagInput value={action.to} onChange={(to) => onChange({ ...action, to })} suggestions={suggestions} placeholder="team@example.com" disabled={disabled} />
      </Field>
      {showCopies && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cc">
            <TagInput value={action.cc ?? []} onChange={(cc) => onChange({ ...action, cc: cc.length ? cc : undefined })} suggestions={suggestions} disabled={disabled} />
          </Field>
          <Field label="Bcc">
            <TagInput value={action.bcc ?? []} onChange={(bcc) => onChange({ ...action, bcc: bcc.length ? bcc : undefined })} suggestions={suggestions} disabled={disabled} />
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <TemplatedInput label="Reply-to" value={action.replyTo ?? ''} onChange={(replyTo) => onChange({ ...action, replyTo: replyTo || undefined })} fields={fields} placeholder="{{email}}" disabled={disabled} />
        <ProviderSelect value={action.providerId} onChange={(providerId) => onChange({ ...action, providerId })} query={providers} kindLabel="email" organizationId={organizationId} disabled={disabled} />
      </div>
      <TemplatedInput label="Subject" value={action.subject} onChange={(subject) => onChange({ ...action, subject })} fields={fields} disabled={disabled} />
      <HtmlBodyInput label="Body" value={action.html ?? ''} onChange={(html) => onChange({ ...action, html: html || undefined })} fields={fields} disabled={disabled} />
      {!action.html && <p className="text-xs text-fg-muted">Leave empty to send a table of all submitted values.</p>}
    </>
  );
}

function AutoresponderAction({ action, onChange, fields, organizationId, disabled }: Ctx & { action: Of<'autoresponder'>; onChange: (a: FormAction) => void }) {
  const providers = useEmailProviders(organizationId);
  const emailFields = fields.filter((f) => f.type === 'email');
  const exists = emailFields.some((f) => f.name === action.emailField);
  return (
    <>
      {emailFields.length === 0 && <Banner tone="warning">Add an Email field to the form so the autoresponder knows where to send.</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Send to field" error={emailFields.length > 0 && !exists ? 'This field no longer exists' : undefined}>
          <Select
            size="sm"
            value={action.emailField}
            onValueChange={(emailField) => onChange({ ...action, emailField })}
            disabled={disabled || emailFields.length === 0}
            options={[...(exists ? [] : [{ value: action.emailField || 'email', label: `${action.emailField || 'email'} (missing)` }]), ...emailFields.map((f) => ({ value: f.name, label: f.label || f.name }))]}
          />
        </Field>
        <ProviderSelect value={action.providerId} onChange={(providerId) => onChange({ ...action, providerId })} query={providers} kindLabel="email" organizationId={organizationId} disabled={disabled} />
      </div>
      <TemplatedInput label="Subject" value={action.subject} onChange={(subject) => onChange({ ...action, subject })} fields={fields} disabled={disabled} />
      <HtmlBodyInput label="Message" value={action.html} onChange={(html) => onChange({ ...action, html })} fields={fields} disabled={disabled} />
    </>
  );
}

function SmsAction({ action, onChange, fields, organizationId, disabled }: Ctx & { action: Of<'sms'>; onChange: (a: FormAction) => void }) {
  const providers = useSmsProviders(organizationId);
  const { ref, insert } = useInsertAtCursor<HTMLTextAreaElement>(action.body, (body) => onChange({ ...action, body: body.slice(0, 1600) }));
  const len = action.body.length;
  const segments = Math.max(1, Math.ceil(len / 160));
  const phoneTokens = fields.filter((f) => f.type === 'phone').map((f) => `{{${f.name}}}`);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="To" required help="E.164 numbers, e.g. +15551234567">
          <TagInput value={action.to} onChange={(to) => onChange({ ...action, to })} suggestions={phoneTokens} placeholder="+15551234567" disabled={disabled} />
        </Field>
        <ProviderSelect value={action.providerId} onChange={(providerId) => onChange({ ...action, providerId })} query={providers} kindLabel="SMS" organizationId={organizationId} disabled={disabled} />
      </div>
      <Field
        label="Message"
        hint={
          <span className="flex items-center gap-2">
            <span className={cn('tabular-nums', len > 1600 ? 'text-danger' : len > 1400 ? 'text-warning' : 'text-fg-subtle')}>
              {len}/1600 · {segments} {segments === 1 ? 'segment' : 'segments'}
            </span>
            <VariablePicker fields={fields} onInsert={insert} disabled={disabled} />
          </span>
        }
      >
        <Textarea ref={ref} rows={3} maxLength={1600} value={action.body} onChange={(e) => onChange({ ...action, body: e.target.value })} disabled={disabled} />
      </Field>
    </>
  );
}

function WebhookAction({ action, onChange, organizationId, disabled }: Ctx & { action: Of<'webhook'>; onChange: (a: FormAction) => void }) {
  const webhooks = useWebhooks(organizationId);
  const [mode, setMode] = useState<'saved' | 'custom'>(action.url && !action.webhookId ? 'custom' : 'saved');
  const list = webhooks.data ?? [];
  const selected = list.find((w) => w.id === action.webhookId);
  const urlInvalid = !!action.url && !/^https?:\/\/\S+$/.test(action.url);
  return (
    <>
      <SegmentedControl
        size="sm"
        aria-label="Webhook source"
        value={mode}
        onValueChange={(m) => {
          setMode(m);
          onChange(m === 'saved' ? { type: 'webhook', webhookId: action.webhookId } : { type: 'webhook', url: action.url });
        }}
        options={[
          { value: 'saved', label: 'Saved webhook' },
          { value: 'custom', label: 'Custom URL' },
        ]}
      />
      {mode === 'saved' ? (
        <Field
          label="Webhook"
          help={selected && !selected.enabled ? 'This webhook is disabled and will not receive requests.' : 'Signed with the webhook’s secret; retries are logged in Webhooks.'}
          hint={
            organizationId && (
              <Link href={`/org/${organizationId}/webhooks`} className="text-accent hover:underline">
                Manage
              </Link>
            )
          }
        >
          {!webhooks.isLoading && list.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-fg-muted">No webhooks yet. Create one in organization settings or use a custom URL.</p>
          ) : (
            <Select
              size="sm"
              placeholder={webhooks.isLoading ? 'Loading…' : 'Choose a webhook'}
              value={action.webhookId && list.some((w) => w.id === action.webhookId) ? action.webhookId : undefined}
              onValueChange={(webhookId) => onChange({ type: 'webhook', webhookId })}
              disabled={disabled || webhooks.isLoading}
              options={list.map((w) => ({ value: w.id, label: w.name, description: w.url }))}
            />
          )}
        </Field>
      ) : (
        <Field label="URL" help="Receives a JSON POST with the submission values" error={urlInvalid ? 'Enter a valid http(s) URL' : undefined}>
          <Input size="sm" type="url" className="font-mono text-xs" placeholder="https://hooks.example.com/form" value={action.url ?? ''} onChange={(e) => onChange({ type: 'webhook', url: e.target.value || undefined })} disabled={disabled} />
        </Field>
      )}
    </>
  );
}

function AssignAction({ action, onChange, organizationId, disabled }: Ctx & { action: Of<'assign'>; onChange: (a: FormAction) => void }) {
  const members = useMembers(organizationId);
  const list = members.data ?? [];
  return (
    <Field label="Assign to">
      <Select
        size="sm"
        placeholder={members.isLoading ? 'Loading…' : 'Choose a teammate'}
        value={action.userId || undefined}
        onValueChange={(userId) => onChange({ ...action, userId })}
        disabled={disabled || members.isLoading}
        options={[
          ...(action.userId && !list.some((m) => m.user.id === action.userId) && !members.isLoading ? [{ value: action.userId, label: 'Former member' }] : []),
          ...list.map((m) => ({ value: m.user.id, label: m.user.name || m.user.email, description: m.user.email })),
        ]}
      />
    </Field>
  );
}

/* --------------------------------------------------------- Add action menu */

export function AddActionMenu({ onAdd, disabled, label = 'Add action' }: { onAdd: (t: FormAction['type']) => void; disabled?: boolean; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" disabled={disabled} leadingIcon={<Plus />}>
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        {(Object.keys(ACTION_META) as Array<FormAction['type']>).map((t) => {
          const Icon = ACTION_ICONS[t];
          return (
            <DropdownMenuItem key={t} icon={<Icon />} onSelect={() => onAdd(t)}>
              {ACTION_META[t].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
