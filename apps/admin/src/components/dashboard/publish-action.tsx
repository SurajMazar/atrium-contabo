'use client';

import type { BuildReport } from '@atrium/builder-core';
import { AtriumApiError } from '@atrium/sdk';
import {
  Badge,
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Textarea,
  toast,
  cn,
} from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CircleCheck, CircleX, Rocket } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RequirePermission } from '@/components/common/permission';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

function isBuildReport(v: unknown): v is BuildReport {
  return !!v && typeof v === 'object' && Array.isArray((v as BuildReport).checks);
}

/** Invalidate everything a publish/rollback changes. */
export function useInvalidatePublishing(websiteId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.website(websiteId), exact: true }),
      qc.invalidateQueries({ queryKey: qk.dashboard(websiteId) }),
      qc.invalidateQueries({ queryKey: qk.versions(websiteId) }),
      qc.invalidateQueries({ queryKey: qk.deployments(websiteId) }),
      qc.invalidateQueries({ queryKey: qk.pages(websiteId) }),
    ]);
}

/** Publish button + optional message dialog + build report on 422. */
export function PublishButton({ websiteId, size = 'sm' }: { websiteId: string; size?: 'sm' | 'md' }) {
  const api = useApi();
  const invalidate = useInvalidatePublishing(websiteId);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<BuildReport | null>(null);

  const publish = useMutation({
    mutationFn: () => api.websites.publish(websiteId, { message: message.trim() || undefined }),
    onSuccess: async (res) => {
      setOpen(false);
      setMessage('');
      const warnings = res.report?.warnings ?? 0;
      toast.success(`Published version ${res.version.number}`, warnings ? { description: `${warnings} ${warnings === 1 ? 'warning' : 'warnings'} in the build report` } : undefined);
      await invalidate();
    },
    onError: (err) => {
      if (err instanceof AtriumApiError && err.status === 422 && isBuildReport(err.details)) {
        setOpen(false);
        setReport(err.details);
        return;
      }
      toast.error('Could not publish', { description: errorMessage(err) });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    publish.mutate();
  };

  return (
    <>
      <RequirePermission permission="page.publish" websiteId={websiteId}>
        <Button size={size} variant="primary" leadingIcon={<Rocket />} onClick={() => setOpen(true)}>
          Publish
        </Button>
      </RequirePermission>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <form onSubmit={submit} className="contents">
            <DialogHeader title="Publish website" description="Freezes the current draft as a new version and makes it live." />
            <DialogBody>
              <Field label="Message" optional help="Shown in version history.">
                <Textarea
                  autoFocus
                  rows={2}
                  value={message}
                  placeholder="e.g. Updated pricing page"
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
                  }}
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button size="sm" variant="primary" type="submit" loading={publish.isPending}>
                Publish
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <BuildReportDialog report={report} onOpenChange={(o) => !o && setReport(null)} />
    </>
  );
}

const checkIcon = {
  pass: <CircleCheck className="size-4 text-success" strokeWidth={1.5} />,
  warn: <AlertTriangle className="size-4 text-warning" strokeWidth={1.5} />,
  fail: <CircleX className="size-4 text-danger" strokeWidth={1.5} />,
} as const;

/** Lists failing and warning checks from a BuildReport. */
export function BuildReportDialog({ report, onOpenChange }: { report: BuildReport | null; onOpenChange: (open: boolean) => void }) {
  const checks = report ? [...report.checks].sort((a, b) => rank(a.status) - rank(b.status)) : [];
  const visible = checks.filter((c) => c.status !== 'pass');
  const passed = checks.length - visible.length;
  return (
    <Dialog open={!!report} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title="Fix these issues before publishing" description="Publishing is blocked while any check fails. Warnings don’t block publishing." />
        <DialogBody className="space-y-3">
          {report && (
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <Badge tone="danger">{report.errors} blocking</Badge>
              <Badge tone="warning">{report.warnings} warnings</Badge>
              <span>{passed} checks passed</span>
            </div>
          )}
          {visible.length === 0 ? (
            <Banner tone="danger" icon={<CircleX />}>
              The server rejected the publish but returned no failing checks. Try again, or run validation from the editor.
            </Banner>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {visible.map((c) => (
                <li key={c.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {checkIcon[c.status]}
                    <span className="text-sm font-medium text-fg">{c.label}</span>
                    <span className={cn('ml-auto text-2xs uppercase tracking-wide', c.status === 'fail' ? 'text-danger' : 'text-warning')}>{c.status === 'fail' ? 'Blocking' : 'Warning'}</span>
                  </div>
                  {c.details.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-fg-muted">
                      {c.details.slice(0, 12).map((d, i) => (
                        <li key={i} className="list-disc">
                          {d}
                        </li>
                      ))}
                      {c.details.length > 12 && <li className="list-none text-fg-subtle">+{c.details.length - 12} more</li>}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function rank(s: 'pass' | 'warn' | 'fail') {
  return s === 'fail' ? 0 : s === 'warn' ? 1 : 2;
}
