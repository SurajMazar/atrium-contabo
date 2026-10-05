'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { restorePageVersion, saveCheckpoint } from '../persistence/server';
import { useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { useUiStore } from '../store/ui';
import { Badge, Btn, Drawer, Empty } from '../ui/primitives';

/** Version history of the current page with restore + manual checkpoint. */
export function VersionHistoryDrawer() {
  const open = useUiStore((s) => s.historyOpen);
  const pageId = useDocumentStore((s) => s.pageId);
  const title = useDocumentStore((s) => s.definition?.pages.find((p) => p.id === s.pageId)?.title);
  const perms = usePerms();
  const qc = useQueryClient();
  const [restoring, setRestoring] = useState<string | null>(null);
  const versions = useQuery({ queryKey: qk.pageVersions(pageId ?? ''), queryFn: () => api.pages.versions(pageId!), enabled: open && !!pageId });

  return (
    <Drawer open={open} onOpenChange={(o) => useUiStore.setState({ historyOpen: o })} title={`Versions · ${title ?? ''}`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <p className="text-[11px] text-fg-subtle">Checkpoints are created with ⌘S, on publish and before restores.</p>
        <Btn
          size="xs"
          variant="secondary"
          disabled={!perms.edit}
          onClick={async () => {
            await saveCheckpoint();
            void qc.invalidateQueries({ queryKey: qk.pageVersions(pageId ?? '') });
          }}
        >
          Save version
        </Btn>
      </div>
      {versions.isLoading && (
        <p className="flex items-center gap-2 px-4 py-4 text-xs text-fg-muted">
          <Loader2 className="size-3.5 animate-spin" /> Loading versions…
        </p>
      )}
      {versions.isError && <p className="px-4 py-4 text-xs text-danger">Could not load versions.</p>}
      {versions.data && !versions.data.length && <Empty icon={<History className="size-6" />} title="No versions yet">Press ⌘S to save a named checkpoint.</Empty>}
      <ul className="divide-y divide-border">
        {versions.data?.map((v) => (
          <li key={v.id} className="group flex items-start gap-3 px-4 py-2.5">
            <span className="mt-0.5 font-mono text-[11px] text-fg-subtle">v{v.number}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{v.message || v.title}</p>
              <p className="text-[11px] text-fg-muted">
                {new Date(v.createdAt).toLocaleString()} {v.createdBy ? `· ${v.createdBy}` : ''}
              </p>
            </div>
            <Badge className="mt-0.5 capitalize">{v.source.toLowerCase()}</Badge>
            <Btn
              size="xs"
              variant="ghost"
              className="opacity-0 group-hover:opacity-100"
              disabled={!perms.edit || restoring !== null}
              icon={restoring === v.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
              onClick={async () => {
                if (!pageId) return;
                setRestoring(v.id);
                await restorePageVersion(pageId, v.id);
                setRestoring(null);
                void qc.invalidateQueries({ queryKey: qk.pageVersions(pageId) });
              }}
            >
              Restore
            </Btn>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
