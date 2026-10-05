'use client';

import { AtriumApiError } from '@atrium/sdk';
import type { Redirect } from '@atrium/schema';
import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Select,
  SkeletonRows,
  Switch,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, ClipboardPaste, CornerDownRight, Lock, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SaveBar, useBeforeUnload } from '@/components/settings/save-bar';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

type Code = Redirect['statusCode'];
const CODES: Code[] = [301, 302, 307, 308];
const CODE_OPTIONS = [
  { value: '301', label: '301', description: 'Permanent' },
  { value: '302', label: '302', description: 'Temporary' },
  { value: '307', label: '307', description: 'Temporary, keeps method' },
  { value: '308', label: '308', description: 'Permanent, keeps method' },
];

interface Row {
  key: string;
  id?: string;
  source: string;
  destination: string;
  statusCode: Code;
  enabled: boolean;
}

let seq = 0;
const newKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

const normSource = (s: string) => s.trim().replace(/\/+$/, '') || '/';
const normDest = (s: string) => {
  const t = s.trim();
  return /^https?:\/\//i.test(t) ? t.replace(/\/+$/, '') : t.replace(/\/+$/, '') || '/';
};

function toRows(list: Redirect[]): Row[] {
  return list.map((r) => ({ key: r.id || newKey(), id: r.id, source: r.source, destination: r.destination, statusCode: (CODES.includes(r.statusCode) ? r.statusCode : 301) as Code, enabled: r.enabled ?? true }));
}
const snapshot = (rows: Row[]) => JSON.stringify(rows.map(({ key: _key, ...r }) => r));

function validateRows(rows: Row[]): Record<string, { source?: string; destination?: string }> {
  const errs: Record<string, { source?: string; destination?: string }> = {};
  const seen = new Map<string, string>();
  for (const r of rows) {
    const e: { source?: string; destination?: string } = {};
    const src = r.source.trim();
    const dst = r.destination.trim();
    if (!src) e.source = 'Required';
    else if (!src.startsWith('/')) e.source = 'Must start with /';
    else if (/\s/.test(src)) e.source = 'No spaces';
    else {
      const n = normSource(src);
      if (seen.has(n)) e.source = 'Duplicate source';
      else seen.set(n, r.key);
    }
    if (!dst) e.destination = 'Required';
    else if (!dst.startsWith('/') && !/^https?:\/\//i.test(dst)) e.destination = 'Use a path (/new) or full URL';
    else if (src && normSource(src) === normDest(dst)) e.destination = 'Redirects to itself';
    if (e.source || e.destination) errs[r.key] = e;
  }
  return errs;
}

/** Parse "source destination [code]" lines (space, tab or comma separated). */
export function parseBulk(text: string): { rows: Array<Omit<Row, 'key'>>; invalid: number[] } {
  const rows: Array<Omit<Row, 'key'>> = [];
  const invalid: number[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const parts = t.split(/[\s,]+/).filter(Boolean);
    const [source, destination, code] = parts;
    const c = code ? Number(code) : 301;
    if (!source || !destination || !source.startsWith('/') || !CODES.includes(c as Code) || parts.length > 3) {
      invalid.push(i + 1);
      return;
    }
    rows.push({ source, destination, statusCode: c as Code, enabled: true });
  });
  return { rows, invalid };
}

function loopDetails(err: unknown): string[] {
  if (!(err instanceof AtriumApiError) || !err.isValidation) return [];
  const d = err.details;
  if (Array.isArray(d)) return d.filter((x): x is string => typeof x === 'string');
  return [];
}

export function RedirectsEditor({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useSession();
  const canEdit = can('redirect.manage', websiteId);
  const q = useQuery({ queryKey: qk.redirects(websiteId), queryFn: () => api.websites.redirects(websiteId) });

  const baseRows = useMemo(() => (Array.isArray(q.data) ? toRows(q.data) : null), [q.data]);
  const baseline = useMemo(() => (baseRows ? snapshot(baseRows) : null), [baseRows]);
  const [rows, setRows] = useState<Row[] | null>(baseRows);
  const [loaded, setLoaded] = useState<string | null>(baseline);
  if (baseline !== loaded) {
    setLoaded(baseline);
    setRows(baseRows);
  }
  const [search, setSearch] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; loops: string[] } | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const dirty = rows !== null && baseline !== null && snapshot(rows) !== baseline;
  useBeforeUnload(dirty);
  const errors = useMemo(() => validateRows(rows ?? []), [rows]);
  const errorCount = Object.keys(errors).length;
  const loopSources = useMemo(() => {
    const set = new Set<string>();
    for (const l of serverError?.loops ?? []) for (const part of l.split(/\s*→\s*|\s*->\s*/)) if (part.trim()) set.add(normSource(part));
    return set;
  }, [serverError]);

  const save = useMutation({
    mutationFn: (list: Row[]) =>
      api.websites.saveRedirects(
        websiteId,
        list.map((r) => ({ ...(r.id ? { id: r.id } : {}), source: normSource(r.source), destination: r.destination.trim(), statusCode: r.statusCode, enabled: r.enabled })),
      ),
    onSuccess: (saved) => {
      setServerError(null);
      setShowErrors(false);
      qc.setQueryData(qk.redirects(websiteId), saved);
      void qc.invalidateQueries({ queryKey: qk.brokenLinks(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.draft(websiteId) });
      toast.success('Redirects saved');
    },
    onError: (err) => {
      const loops = loopDetails(err);
      setServerError({ message: err instanceof Error ? err.message : 'Could not save redirects', loops });
      toast.error(loops.length ? 'Redirect loop detected' : 'Could not save redirects', { description: loops.length ? undefined : err instanceof Error ? err.message : undefined });
    },
  });

  const onSave = () => {
    if (!rows) return;
    if (errorCount) {
      setShowErrors(true);
      toast.error(`Fix ${errorCount} ${errorCount === 1 ? 'redirect' : 'redirects'} before saving`);
      return;
    }
    save.mutate(rows);
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => (rs ? rs.map((r) => (r.key === key ? { ...r, ...patch } : r)) : rs));
  const remove = (key: string) => setRows((rs) => (rs ? rs.filter((r) => r.key !== key) : rs));
  const add = () => {
    setSearch('');
    setRows((rs) => [...(rs ?? []), { key: newKey(), source: '/', destination: '', statusCode: 301, enabled: true }]);
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-redirect-source]');
      inputs[inputs.length - 1]?.focus();
    });
  };
  const importRows = (incoming: Array<Omit<Row, 'key'>>) => {
    const list = [...(rows ?? [])];
    let added = 0;
    let updated = 0;
    for (const r of incoming) {
      const i = list.findIndex((x) => normSource(x.source) === normSource(r.source));
      if (i >= 0) {
        list[i] = { ...list[i]!, destination: r.destination, statusCode: r.statusCode, enabled: true };
        updated++;
      } else {
        list.push({ key: newKey(), ...r });
        added++;
      }
    }
    setRows(list);
    toast.success(`${added} added${updated ? `, ${updated} updated` : ''}`, { description: 'Review and save to apply.' });
  };

  const visible = useMemo(() => {
    const f = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => !f || r.source.toLowerCase().includes(f) || r.destination.toLowerCase().includes(f));
  }, [rows, search]);

  if (q.isPending) return <SkeletonRows rows={6} className="rounded-lg border border-border bg-surface" />;
  if (q.isError) return <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />;
  if (!rows) return null;

  return (
    <div className="space-y-3">
      {!canEdit && (
        <Banner tone="neutral" icon={<Lock />}>
          You can view redirects but need the <code className="font-mono text-xs">redirect.manage</code> permission to change them.
        </Banner>
      )}
      {serverError && (
        <Banner tone="danger" icon={<AlertTriangle />} action={<Button size="xs" variant="ghost" onClick={() => setServerError(null)}>Dismiss</Button>}>
          <p className="font-medium">{serverError.loops.length ? 'These redirects form a loop' : serverError.message}</p>
          {serverError.loops.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {serverError.loops.map((l) => (
                <li key={l} className="font-mono text-xs text-fg-muted">
                  {l}
                </li>
              ))}
            </ul>
          )}
        </Banner>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong">
          <EmptyState
            icon={<CornerDownRight />}
            title="No redirects"
            description="Send visitors and search engines from old URLs to new ones, e.g. after renaming a page."
            action={
              canEdit && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="primary" leadingIcon={<Plus />} onClick={add}>
                    Add redirect
                  </Button>
                  <Button size="sm" variant="ghost" leadingIcon={<ClipboardPaste />} onClick={() => setBulkOpen(true)}>
                    Bulk import
                  </Button>
                </div>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input size="sm" prefix={<Search />} placeholder="Filter redirects" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" aria-label="Filter redirects" />
            <span className="text-xs tabular-nums text-fg-muted">
              {rows.length} {rows.length === 1 ? 'redirect' : 'redirects'}
              {showErrors && errorCount > 0 && <span className="text-danger"> · {errorCount} with errors</span>}
            </span>
            <div className="flex-1" />
            {canEdit && (
              <>
                <Button size="sm" variant="ghost" leadingIcon={<ClipboardPaste />} onClick={() => setBulkOpen(true)}>
                  Bulk import
                </Button>
                <Button size="sm" leadingIcon={<Plus />} onClick={add}>
                  Add redirect
                </Button>
              </>
            )}
          </div>
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>Source</TH>
                  <TH className="w-6" aria-hidden />
                  <TH>Destination</TH>
                  <TH className="w-32">Status</TH>
                  <TH className="w-20" align="center">
                    Enabled
                  </TH>
                  <TH className="w-10">
                    <span className="sr-only">Remove</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {visible.length === 0 ? (
                  <TR>
                    <TD colSpan={6}>
                      <p className="py-6 text-center text-sm text-fg-muted">No redirects match.</p>
                    </TD>
                  </TR>
                ) : (
                  visible.map((r) => {
                    const e = showErrors || r.source.length > 1 || r.destination ? errors[r.key] : undefined;
                    const inLoop = loopSources.has(normSource(r.source));
                    return (
                      <TR key={r.key} className={cn('align-top', !r.enabled && 'opacity-60')}>
                        <TD className="py-1.5 align-top">
                          <Input
                            size="sm"
                            data-redirect-source
                            value={r.source}
                            onChange={(ev) => update(r.key, { source: ev.target.value })}
                            invalid={!!e?.source || inLoop}
                            disabled={!canEdit}
                            className="font-mono text-xs"
                            aria-label="Source path"
                            placeholder="/old-path"
                          />
                          {(e?.source || inLoop) && <p className="mt-1 text-xs text-danger">{e?.source ?? 'Part of a redirect loop'}</p>}
                        </TD>
                        <TD className="px-0 py-1.5 align-top">
                          <ArrowRight className="mt-1.5 size-3.5 text-fg-subtle" strokeWidth={1.5} aria-hidden />
                        </TD>
                        <TD className="py-1.5 align-top">
                          <Input
                            size="sm"
                            value={r.destination}
                            onChange={(ev) => update(r.key, { destination: ev.target.value })}
                            invalid={!!e?.destination}
                            disabled={!canEdit}
                            className="font-mono text-xs"
                            aria-label="Destination"
                            placeholder="/new-path or https://…"
                          />
                          {e?.destination && <p className="mt-1 text-xs text-danger">{e.destination}</p>}
                        </TD>
                        <TD className="py-1.5 align-top">
                          <Select size="sm" value={String(r.statusCode)} onValueChange={(v) => update(r.key, { statusCode: Number(v) as Code })} options={CODE_OPTIONS} disabled={!canEdit} aria-label="Status code" className="w-full" />
                        </TD>
                        <TD align="center" className="py-1.5 align-top">
                          <span className="inline-flex h-7 items-center">
                            <Switch size="sm" checked={r.enabled} onCheckedChange={(enabled) => update(r.key, { enabled })} disabled={!canEdit} aria-label={r.enabled ? 'Disable redirect' : 'Enable redirect'} />
                          </span>
                        </TD>
                        <TD className="py-1.5 align-top">
                          {canEdit && (
                            <IconButton label="Remove redirect" size="sm" variant="ghost" onClick={() => remove(r.key)}>
                              <Trash2 />
                            </IconButton>
                          )}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableContainer>
          <p className="text-xs text-fg-muted">Use 301 for pages that moved for good. Trailing slashes are ignored when matching. Changes apply on the next publish.</p>
        </>
      )}

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        disabled={!canEdit}
        onSave={onSave}
        onDiscard={() => {
          setRows(baseRows);
          setServerError(null);
          setShowErrors(false);
        }}
        message={showErrors && errorCount ? `${errorCount} ${errorCount === 1 ? 'redirect needs' : 'redirects need'} attention` : undefined}
      />
      <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} onImport={importRows} />
    </div>
  );
}

function BulkImportDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (o: boolean) => void; onImport: (rows: Array<Omit<Row, 'key'>>) => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseBulk(text), [text]);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setText('');
        onOpenChange(o);
      }}
    >
      <DialogContent size="md">
        <DialogHeader title="Bulk import redirects" description="One redirect per line: source, destination and an optional status code (defaults to 301)." />
        <DialogBody className="space-y-2">
          <Textarea
            autoFocus
            mono
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'/old-rooms /rooms 301\n/blog/2023-offer /offers\n/legacy https://example.com/new 302'}
            aria-label="Redirect lines"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-muted">
              {parsed.rows.length} valid {parsed.rows.length === 1 ? 'line' : 'lines'}. Existing sources are updated.
            </span>
            {parsed.invalid.length > 0 && (
              <span className="text-danger">
                Skipping line{parsed.invalid.length > 1 ? 's' : ''} {parsed.invalid.slice(0, 6).join(', ')}
                {parsed.invalid.length > 6 ? '…' : ''}
              </span>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={parsed.rows.length === 0}
            onClick={() => {
              onImport(parsed.rows);
              setText('');
              onOpenChange(false);
            }}
          >
            Add {parsed.rows.length || ''} {parsed.rows.length === 1 ? 'redirect' : 'redirects'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
