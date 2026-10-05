'use client';

import type { Webhook, WebsiteSummary } from '@atrium/sdk';
import { Button, Checkbox, Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, Field, Input, Select, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { ALL_EVENTS, groupedEvents, isAllEvents } from './events';

const ALL_SITES = '__all__';

function validateUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return 'URL is required';
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return 'Enter a full URL, e.g. https://example.com/hooks/atrium';
  }
  if (u.protocol !== 'https:') return 'Webhook URLs must use HTTPS';
  return null;
}

/** Create (target === 'new') or edit a webhook endpoint. */
export function WebhookDialog({ orgId, target, onOpenChange, onCreated }: { orgId: string; target: Webhook | 'new' | null; onOpenChange: (open: boolean) => void; onCreated: (w: Webhook) => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      {target !== null && (
        <DialogContent size="lg">
          <WebhookForm key={target === 'new' ? 'new' : target.id} orgId={orgId} webhook={target === 'new' ? null : target} onClose={() => onOpenChange(false)} onCreated={onCreated} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function WebhookForm({ orgId, webhook, onClose, onCreated }: { orgId: string; webhook: Webhook | null; onClose: () => void; onCreated: (w: Webhook) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const isNew = !webhook;
  const [name, setName] = useState(webhook?.name ?? '');
  const [url, setUrl] = useState(webhook?.url ?? '');
  const [events, setEvents] = useState<string[]>(() => (webhook ? (isAllEvents(webhook.events) ? ALL_EVENTS : webhook.events.filter((e) => ALL_EVENTS.includes(e))) : ['form.submitted']));
  const [websiteId, setWebsiteId] = useState(webhook?.websiteId ?? ALL_SITES);
  const [errors, setErrors] = useState<{ name?: string; url?: string; events?: string }>({});
  const websites = useQuery({ queryKey: qk.websites(orgId), queryFn: () => api.websites.list(orgId), staleTime: 60_000 });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), url: url.trim(), events };
      if (isNew) return api.webhooks.create(orgId, websiteId !== ALL_SITES ? { ...body, websiteId } : body);
      return api.webhooks.update(webhook.id, body);
    },
    onSuccess: (w) => {
      void qc.invalidateQueries({ queryKey: qk.webhooks(orgId) });
      onClose();
      if (isNew) onCreated(w);
      else toast.success('Webhook saved');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save webhook')),
  });

  const submit = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Name is required';
    const u = validateUrl(url);
    if (u) next.url = u;
    if (events.length === 0) next.events = 'Choose at least one event';
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  };

  const toggle = (list: string[], on: boolean) => setEvents((cur) => (on ? [...new Set([...cur, ...list])] : cur.filter((e) => !list.includes(e))));
  const allOn = ALL_EVENTS.every((e) => events.includes(e));
  const someOn = events.length > 0;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader title={isNew ? 'Add webhook' : 'Edit webhook'} description="Atrium sends a signed POST request to this URL when the selected events happen." />
      <DialogBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Field label="Name" required error={errors.name}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM sync" />
          </Field>
          <Field label="Endpoint URL" required error={errors.url}>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/atrium" className="font-mono text-xs" inputMode="url" spellCheck={false} />
          </Field>
        </div>
        <Field label="Websites" help={isNew ? 'Only send events from one website, or from every website in the organization.' : 'Scope is fixed after creation.'}>
          <Select
            value={websiteId}
            onValueChange={setWebsiteId}
            disabled={!isNew || websites.isPending}
            options={[{ value: ALL_SITES, label: 'All websites' }, ...((websites.data ?? []) as WebsiteSummary[]).map((w) => ({ value: w.id, label: w.name }))]}
          />
        </Field>
        <fieldset className="space-y-2">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium text-fg">
              Events<span className="ml-0.5 text-danger" aria-hidden>*</span>
            </legend>
            <Checkbox label="Select all" checked={allOn ? true : someOn ? 'indeterminate' : false} onCheckedChange={() => setEvents(allOn ? [] : ALL_EVENTS)} />
          </div>
          <div className="grid gap-x-6 gap-y-3 rounded-md border border-border p-3 sm:grid-cols-2">
            {groupedEvents().map((g) => {
              const groupOn = g.events.every((e) => events.includes(e));
              const groupSome = g.events.some((e) => events.includes(e));
              return (
                <div key={g.key} className="space-y-1.5">
                  <div className="flex h-5 items-center justify-between gap-2">
                    <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{g.label}</span>
                    {g.events.length > 1 && (
                      <button type="button" onClick={() => toggle(g.events, !groupOn)} className="rounded-sm text-2xs font-medium text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${groupOn ? 'Clear' : 'Select'} all ${g.label} events`}>
                        {groupOn ? 'Clear' : groupSome ? 'Select rest' : 'Select all'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {g.events.map((e) => (
                      <Checkbox key={e} label={<span className="font-mono text-xs">{e}</span>} checked={events.includes(e)} onCheckedChange={(v) => toggle([e], v === true)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {errors.events && <p className="text-xs text-danger">{errors.events}</p>}
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" size="sm" type="button">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" size="sm" loading={save.isPending}>
          {isNew ? 'Add webhook' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}
