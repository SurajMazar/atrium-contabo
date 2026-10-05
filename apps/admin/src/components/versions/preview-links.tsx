'use client';

import type { PreviewToken } from '@atrium/sdk';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  CopyField,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Select,
  SkeletonRows,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, KeyRound, Link2, Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { qk } from '@/lib/query-keys';

const EXPIRY = [
  { value: '1', label: '1 hour' },
  { value: '24', label: '24 hours' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function expiresIn(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = diff / 3_600_000;
  if (h < 1) return rtf.format(Math.max(1, Math.round(diff / 60_000)), 'minute');
  if (h < 48) return rtf.format(Math.round(h), 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

export function PreviewLinks({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const key = qk.previewTokens(websiteId);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<PreviewToken | null>(null);
  // Full URLs are only returned at creation; keep the ones made in this session.
  const [known, setKnown] = useState<Record<string, string>>({});

  const q = useQuery({ queryKey: key, queryFn: () => api.websites.previewTokens(websiteId) });

  const revoke = useMutation({
    mutationFn: (t: PreviewToken) => api.websites.revokePreviewToken(websiteId, t.id),
    onMutate: async (t) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PreviewToken[]>(key);
      qc.setQueryData<PreviewToken[]>(key, (list) => list?.filter((x) => x.id !== t.id));
      return { prev };
    },
    onSuccess: () => toast.success('Preview link revoked'),
    onError: (err, _t, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error('Could not revoke link', { description: errorMessage(err) });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <Card id="preview-links" className="scroll-mt-20">
      <CardHeader
        title="Preview links"
        description="Share the current draft with people outside your team. Links show unpublished changes."
        actions={
          <Button size="sm" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
            Create link
          </Button>
        }
      />
      {q.isPending ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          compact
          icon={<Link2 />}
          title="No active preview links"
          action={
            <Button size="sm" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
              Create link
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <TH>Label</TH>
                <TH>Link</TH>
                <TH>Expires</TH>
                <TH className="w-10">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {q.data.map((t) => {
                const url = t.url || known[t.id];
                return (
                  <TR key={t.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-fg">{t.label || <span className="text-fg-muted">Untitled link</span>}</span>
                        {t.hasPassword && (
                          <Badge tone="outline" size="xs">
                            <Lock />
                            Password
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="w-[44%] min-w-[240px]">
                      {url ? <CopyField size="sm" value={url} label="Preview URL" /> : <span className="text-xs text-fg-subtle">Shown once when created</span>}
                    </TD>
                    <TD muted className="whitespace-nowrap">
                      <span title={formatDateTime(t.expiresAt)}>{expiresIn(t.expiresAt)}</span>
                    </TD>
                    <TD className="pl-0">
                      <IconButton label="Revoke link" size="xs" onClick={() => setRevoking(t)}>
                        <Trash2 />
                      </IconButton>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}

      <CreatePreviewLinkDialog
        open={creating}
        onOpenChange={setCreating}
        websiteId={websiteId}
        onCreated={(t) => {
          setKnown((k) => ({ ...k, [t.id]: t.url }));
          qc.setQueryData<PreviewToken[]>(key, (list) => [t, ...(list ?? []).filter((x) => x.id !== t.id)]);
        }}
      />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        tone="danger"
        title="Revoke preview link?"
        description={`Anyone with ${revoking?.label ? `“${revoking.label}”` : 'this link'} loses access immediately.`}
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking) await revoke.mutateAsync(revoking);
        }}
      />
    </Card>
  );
}

function CreatePreviewLinkDialog({ open, onOpenChange, websiteId, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; websiteId: string; onCreated: (t: PreviewToken) => void }) {
  const api = useApi();
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState('72');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<PreviewToken | null>(null);

  useEffect(() => {
    if (!open) {
      setLabel('');
      setHours('72');
      setPassword('');
      setCreated(null);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () => api.websites.createPreviewToken(websiteId, { label: label.trim() || undefined, expiresInHours: Number(hours), password: password || undefined }),
    onSuccess: (t) => {
      setCreated(t);
      onCreated(t);
    },
    onError: (err) => toast.error('Could not create preview link', { description: errorMessage(err) }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password && password.length < 4) return;
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {created ? (
          <>
            <DialogHeader title="Preview link created" description="Copy it now — for security, the full link isn’t shown again after you leave this page." />
            <DialogBody className="space-y-3">
              <CopyField value={created.url} label="Preview URL" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <span>Expires {formatDateTime(created.expiresAt)}</span>
                {created.hasPassword && (
                  <Badge tone="outline" size="xs">
                    <KeyRound />
                    Password protected
                  </Badge>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="ghost" asChild>
                <a href={created.url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Open
                </a>
              </Button>
              <DialogClose asChild>
                <Button size="sm" variant="primary" autoFocus>
                  Done
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="contents" noValidate>
            <DialogHeader title="Create preview link" />
            <DialogBody className="space-y-4">
              <Field label="Label" optional help="Helps you recognise who the link was shared with.">
                <Input autoFocus value={label} maxLength={80} placeholder="e.g. Client review" onChange={(e) => setLabel(e.target.value)} />
              </Field>
              <Field label="Expires after">
                <Select value={hours} onValueChange={setHours} options={EXPIRY} />
              </Field>
              <Field label="Password" optional error={password && password.length < 4 ? 'Use at least 4 characters' : null} help="Visitors must enter it before seeing the preview.">
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Banner tone="neutral">Preview links always show the latest draft, including changes made after the link was created.</Banner>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button size="sm" variant="primary" type="submit" loading={create.isPending}>
                Create link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
