'use client';

import type { Website } from '@atrium/sdk';
import { Banner, Button, Checkbox, cn, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, FieldGroup, IconButton, Input, toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Braces, Copy, Download, FileArchive, FileUp, Info, Package, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { RequirePermission } from '@/components/common/permission';
import { downloadAuthenticated, useApi } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { SectionHeading } from './section-kit';

type Format = 'json' | 'zip' | 'nextjs';
const EXPORTS: Array<{ format: Format; title: string; description: string; filename: string; icon: ReactNode }> = [
  { format: 'json', title: 'JSON', description: 'The full site definition in a single file. Re-importable.', filename: 'site.json', icon: <Braces /> },
  { format: 'zip', title: 'ZIP archive', description: 'Site, theme, pages, collections and forms as separate files, plus a media manifest.', filename: 'site.zip', icon: <FileArchive /> },
  { format: 'nextjs', title: 'Next.js project', description: 'A standalone Next.js app you can host anywhere.', filename: 'site-nextjs.zip', icon: <Package /> },
];

export function TransferSection({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const { website } = useWebsite();
  const [busy, setBusy] = useState<Format | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);

  const download = async (e: (typeof EXPORTS)[number]) => {
    setBusy(e.format);
    try {
      await downloadAuthenticated(api.websites.exportUrl(websiteId, e.format), e.filename);
      toast.success(`${e.title} export downloaded`);
    } catch (err) {
      toast.error('Export failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <SectionHeading title="Export, import & clone" description="Move this website between workspaces, keep a backup, or start a variant." />
      <div className="space-y-4">
        <FieldGroup title="Export" description="Exports use the current draft. Secrets and form submissions are never included.">
          <ul className="-mx-4 -my-4 divide-y divide-border">
            {EXPORTS.map((e) => (
              <li key={e.format} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted [&_svg]:size-4 [&_svg]:stroke-[1.5]">{e.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">{e.title}</div>
                  <div className="text-xs text-fg-muted">{e.description}</div>
                </div>
                <RequirePermission permission="website.export" websiteId={websiteId}>
                  <Button size="sm" leadingIcon={<Download />} loading={busy === e.format} disabled={busy !== null} onClick={() => void download(e)}>
                    Download
                  </Button>
                </RequirePermission>
              </li>
            ))}
          </ul>
        </FieldGroup>

        <FieldGroup
          title="Clone"
          description="Create a copy of this website in the same organization."
          actions={
            <RequirePermission permission="website.export" websiteId={websiteId}>
              <Button size="sm" leadingIcon={<Copy />} onClick={() => setCloneOpen(true)}>
                Clone website
              </Button>
            </RequirePermission>
          }
        >
          <p className="text-sm text-fg-muted">Choose what to bring along. The copy starts as an unpublished draft with its own URL.</p>
        </FieldGroup>

        <ImportCard />
      </div>
      {website && <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} website={website} />}
    </div>
  );
}

type IncludeKey = 'pages' | 'theme' | 'forms' | 'collections' | 'media';
const INCLUDE: Array<{ key: IncludeKey; label: string; description: string }> = [
  { key: 'pages', label: 'Pages', description: 'All pages, header, footer and navigation' },
  { key: 'theme', label: 'Theme', description: 'Colors, typography and design tokens' },
  { key: 'forms', label: 'Forms', description: 'Form definitions and workflows' },
  { key: 'collections', label: 'Collections', description: 'CMS schemas and items' },
  { key: 'media', label: 'Media', description: 'Images and files used by the site' },
];

function CloneDialog({ open, onOpenChange, website }: { open: boolean; onOpenChange: (o: boolean) => void; website: Website }) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState(`${website.name} copy`);
  const [include, setInclude] = useState<Record<IncludeKey, boolean>>({ pages: true, theme: true, forms: true, collections: true, media: true });
  const clone = useMutation({
    mutationFn: () => api.websites.clone(website.id, { name: name.trim(), include }),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: qk.websites(website.organizationId) });
      toast.success('Website cloned', { description: created.name });
    },
    onError: (err) => toast.error('Could not clone website', { description: err instanceof Error ? err.message : undefined }),
  });
  const reset = () => {
    setName(`${website.name} copy`);
    clone.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent size="md">
        <DialogHeader title="Clone website" description={`Creates a new website from “${website.name}”.`} />
        {clone.data ? (
          <>
            <DialogBody>
              <Banner tone="success">
                <span className="font-medium">{clone.data.name}</span> is ready.
              </Banner>
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button size="sm" variant="primary" trailingIcon={<ArrowUpRight />} asChild>
                <Link href={`/w/${clone.data.id}`} onClick={() => onOpenChange(false)}>
                  Open {clone.data.name}
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) clone.mutate();
            }}
            className="contents"
          >
            <DialogBody className="space-y-4">
              <Field label="New website name" required>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <fieldset className="space-y-2.5">
                <legend className="mb-2 text-sm font-medium text-fg">Include</legend>
                {INCLUDE.map((i) => (
                  <Checkbox key={i.key} checked={include[i.key]} onCheckedChange={(v) => setInclude((s) => ({ ...s, [i.key]: v === true }))} label={i.label} description={i.description} />
                ))}
              </fieldset>
              <Banner tone="neutral" icon={<Info />}>
                Secrets and form submissions are never cloned. Domains and deployment settings stay with the original.
              </Banner>
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" type="submit" loading={clone.isPending} disabled={!name.trim()}>
                Clone website
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportCard() {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const { can, currentOrg } = useSession();
  const { organizationId, website } = useWebsite();
  const orgId = organizationId ?? currentOrg?.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [drag, setDrag] = useState(false);
  const canCreate = can('website.create');

  const imp = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file!);
      if (name.trim()) fd.append('name', name.trim());
      return api.websites.import(orgId!, fd);
    },
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: qk.websites(orgId!) });
      toast.success('Website imported', { description: created.name });
      router.push(`/w/${created.id}`);
    },
    onError: (err) => toast.error('Import failed', { description: err instanceof Error ? err.message : undefined }),
  });

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.(json|zip)$/i.test(f.name)) {
      toast.error('Choose a .json or .zip export');
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.(json|zip)$/i, '').replace(/[-_]+/g, ' '));
  };

  return (
    <FieldGroup title="Import" description={<>Importing creates a <span className="font-medium text-fg">new website</span>{currentOrg ? ` in ${currentOrg.name}` : ''}. {website ? `“${website.name}” is not changed.` : ''}</>}>
      {!canCreate ? (
        <p className="text-sm text-fg-muted">
          Requires the <code className="font-mono text-xs">website.create</code> permission.
        </p>
      ) : file ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
            <FileArchive className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-fg">{file.name}</div>
              <div className="text-xs text-fg-subtle">{formatBytes(file.size)}</div>
            </div>
            <IconButton label="Remove file" size="sm" variant="ghost" onClick={() => setFile(null)} disabled={imp.isPending}>
              <X />
            </IconButton>
          </div>
          <Field label="Website name" optional help="Defaults to the name in the export.">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={imp.isPending} />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" variant="primary" leadingIcon={<FileUp />} loading={imp.isPending} disabled={!orgId} onClick={() => imp.mutate()}>
              Import as new website
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-8 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            drag ? 'border-accent bg-accent-soft/40' : 'border-border-strong hover:border-fg-subtle',
          )}
        >
          <FileUp className="size-4 text-fg-muted" strokeWidth={1.5} />
          <span className="text-sm text-fg">Drop an export here, or click to choose</span>
          <span className="text-xs text-fg-muted">.json or .zip exported from Atrium</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept=".json,.zip,application/json,application/zip" className="hidden" onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }} />
    </FieldGroup>
  );
}
