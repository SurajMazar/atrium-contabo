'use client';

import type { BuildReport } from '@atrium/builder-core';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Rocket, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { goToPage } from '../panels/pages-panel';
import { flushSaves } from '../persistence/autosave';
import { useDocumentStore } from '../store/document';
import { useEditorStore } from '../store/editor';
import { useUiStore } from '../store/ui';
import { Btn, Modal, TextInput } from '../ui/primitives';

type Phase = 'validating' | 'report' | 'publishing' | 'done' | 'error';

/** Validate → show the BuildReport → publish (blocked while any check fails). */
export function PublishDialog() {
  const open = useUiStore((s) => s.publishOpen);
  const websiteId = useEditorStore((s) => s.websiteId);
  const website = useEditorStore((s) => s.website);
  const [phase, setPhase] = useState<Phase>('validating');
  const [report, setReport] = useState<BuildReport | null>(null);
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pages = useDocumentStore((s) => s.definition?.pages);

  const close = () => useUiStore.setState({ publishOpen: false });

  useEffect(() => {
    if (!open || !websiteId) return;
    let cancelled = false;
    setPhase('validating');
    setReport(null);
    setVersion(null);
    setError(null);
    (async () => {
      try {
        await flushSaves();
        const r = await api.websites.validate(websiteId);
        if (!cancelled) {
          setReport(r);
          setPhase('report');
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err));
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, websiteId]);

  const publish = async () => {
    if (!websiteId) return;
    setPhase('publishing');
    try {
      const res = await api.websites.publish(websiteId, { message: message.trim() || undefined });
      setVersion(res.version.number);
      setReport(res.report);
      setPhase('done');
      toast.success(`Published version ${res.version.number}`);
    } catch (err) {
      setError(errorMessage(err));
      setPhase('error');
    }
  };

  const failures = report?.checks.filter((c) => c.status === 'fail').length ?? 0;
  const pageFor = (detail: string) => pages?.find((p) => detail.startsWith(`${p.title}:`) || detail.includes(`/${p.slug}`) && p.slug);

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      title={phase === 'done' ? 'Published' : 'Publish website'}
      description={phase === 'done' ? undefined : 'Pre-publish checks run against the saved draft.'}
      size="md"
      footer={
        phase === 'done' ? (
          <>
            {website?.platformUrl && (
              <a href={website.primaryDomain ? `https://${website.primaryDomain}` : website.platformUrl} target="_blank" rel="noreferrer">
                <Btn variant="secondary" icon={<ExternalLink className="size-3.5" />}>View live site</Btn>
              </a>
            )}
            <Btn variant="primary" onClick={close}>Done</Btn>
          </>
        ) : (
          <>
            <Btn variant="secondary" onClick={close}>Cancel</Btn>
            <Btn variant="primary" icon={phase === 'publishing' ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} disabled={phase !== 'report' || failures > 0} onClick={publish}>
              {failures > 0 ? `Fix ${failures} issue${failures === 1 ? '' : 's'} to publish` : 'Publish'}
            </Btn>
          </>
        )
      }
    >
      {phase === 'validating' && (
        <p className="flex items-center gap-2 py-6 text-[13px] text-fg-muted">
          <Loader2 className="size-4 animate-spin" /> Saving and running checks…
        </p>
      )}
      {phase === 'error' && <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      {phase === 'done' && version !== null && (
        <div className="space-y-2 py-2 text-[13px]">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-5 text-success" /> Version {version} is live.
          </p>
          <Link href={`/w/${websiteId}/versions`} target="_blank" className="text-xs text-accent hover:underline">
            View version history
          </Link>
        </div>
      )}
      {report && phase !== 'done' && (
        <div className="space-y-3">
          <ul className="divide-y divide-border rounded-md border border-border">
            {report.checks.map((c) => (
              <li key={c.id} className="px-3 py-2">
                <div className="flex items-center gap-2 text-[13px]">
                  {c.status === 'pass' ? <CheckCircle2 className="size-4 text-success" /> : c.status === 'warn' ? <AlertTriangle className="size-4 text-warning" /> : <XCircle className="size-4 text-danger" />}
                  <span className="flex-1 font-medium">{c.label}</span>
                  {c.details.length > 0 && <span className="text-[11px] text-fg-subtle">{c.details.length}</span>}
                </div>
                {c.status !== 'pass' && c.details.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-6">
                    {c.details.slice(0, 8).map((d, i) => {
                      const p = pageFor(d);
                      return (
                        <li key={i} className="flex items-start gap-2 text-xs text-fg-muted">
                          <span className="min-w-0 flex-1">{d}</span>
                          {p && (
                            <button
                              type="button"
                              className="shrink-0 text-accent hover:underline"
                              onClick={() => {
                                goToPage(p.id);
                                close();
                              }}
                            >
                              Open page
                            </button>
                          )}
                        </li>
                      );
                    })}
                    {c.details.length > 8 && <li className="text-[11px] text-fg-subtle">+{c.details.length - 8} more</li>}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-1">
            <label className="text-xs text-fg-muted" htmlFor="publish-message">
              Version note (optional)
            </label>
            <TextInput id="publish-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. New rooms page and spring offers" />
          </div>
          {report.warnings > 0 && failures === 0 && <p className="text-[11px] text-fg-subtle">Warnings do not block publishing.</p>}
        </div>
      )}
    </Modal>
  );
}
