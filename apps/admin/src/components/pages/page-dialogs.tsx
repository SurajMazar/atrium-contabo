'use client';

import type { PageSummary } from '@atrium/sdk';
import { Banner, Button, Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, Field, Input } from '@atrium/ui';
import { CalendarClock, Home } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { normalizeSlugInput, validateSlug } from './create-page-dialog';
import type { PageUpdateVars } from './use-page-actions';
import { normalizeStatus } from './use-page-actions';

type Submit = (vars: Omit<PageUpdateVars, 'page'>) => Promise<unknown>;

/** Rename / change slug. Homepage slug is fixed to `/`. */
export function RenamePageDialog({ page, takenSlugs, onOpenChange, onSubmit }: { page: PageSummary | null; takenSlugs: string[]; onOpenChange: (o: boolean) => void; onSubmit: Submit }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setSlug(page.slug);
    }
  }, [page]);

  if (!page) return <Dialog open={false} />;
  const others = takenSlugs.filter((s) => s !== page.slug);
  const titleError = title.trim() ? null : 'Enter a page title';
  const slugError = page.isHomepage ? null : validateSlug(slug, others);
  const pristine = title.trim() === page.title && slug === page.slug;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (titleError || slugError || pristine) return;
    setBusy(true);
    try {
      await onSubmit({ title: title.trim() !== page.title ? title.trim() : undefined, slug: !page.isHomepage && slug !== page.slug ? slug : undefined, success: 'Page updated' });
      onOpenChange(false);
    } catch {
      /* toast handled by mutation */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="contents" noValidate>
          <DialogHeader title="Rename page" />
          <DialogBody className="space-y-4">
            <Field label="Title" required error={titleError}>
              <Input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            {page.isHomepage ? (
              <Banner icon={<Home />}>The homepage always lives at /. Set another page as homepage to change this one’s URL.</Banner>
            ) : (
              <Field label="URL" required error={slugError} help={!slugError && slug !== page.slug ? 'Existing links to the old URL will break unless you add a redirect.' : undefined}>
                <Input prefix={<span className="font-mono text-xs">/</span>} className="font-mono" spellCheck={false} value={slug} onChange={(e) => setSlug(normalizeSlugInput(e.target.value))} />
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" variant="primary" type="submit" loading={busy} disabled={pristine}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultPublishAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
}

/** Schedule a page to publish at a date/time (local), or clear an existing schedule. */
export function SchedulePageDialog({ page, onOpenChange, onSubmit }: { page: PageSummary | null; onOpenChange: (o: boolean) => void; onSubmit: Submit }) {
  const [value, setValue] = useState(defaultPublishAt);
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);

  useEffect(() => {
    if (page) setValue(defaultPublishAt());
  }, [page]);

  if (!page) return <Dialog open={false} />;
  const scheduled = normalizeStatus(page.status) === 'SCHEDULED';
  const date = value ? new Date(value) : null;
  const invalid = !date || Number.isNaN(date.getTime());
  const past = !invalid && date!.getTime() <= Date.now();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const run = async (kind: 'save' | 'clear') => {
    setBusy(kind);
    try {
      if (kind === 'save') await onSubmit({ status: 'scheduled', publishAt: date!.toISOString(), success: `Scheduled for ${date!.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` });
      else await onSubmit({ status: 'draft', publishAt: null, success: 'Schedule cleared' });
      onOpenChange(false);
    } catch {
      /* toast handled by mutation */
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!invalid && !past) void run('save');
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="contents" noValidate>
          <DialogHeader title="Schedule page" description={`“${page.title}” will be published automatically at this time.`} />
          <DialogBody className="space-y-3">
            <Field label="Publish at" error={invalid ? 'Pick a date and time' : past ? 'Pick a time in the future' : null} help={`Time zone: ${tz}`}>
              <Input type="datetime-local" autoFocus value={value} min={toLocalInput(new Date())} onChange={(e) => setValue(e.target.value)} />
            </Field>
            {scheduled && (
              <Banner icon={<CalendarClock />} tone="info">
                This page is already scheduled. Saving replaces the existing time.
              </Banner>
            )}
          </DialogBody>
          <DialogFooter>
            {scheduled && (
              <Button size="sm" variant="danger-ghost" className="mr-auto" loading={busy === 'clear'} onClick={() => void run('clear')}>
                Clear schedule
              </Button>
            )}
            <DialogClose asChild>
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" variant="primary" type="submit" loading={busy === 'save'} disabled={invalid || past}>
              Schedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
