'use client';

import type { ChangeSummary, WebsiteVersion } from '@atrium/sdk';
import { Badge, Card, CardHeader, cn, EmptyState, ErrorState, Select, SkeletonRows } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, GitCompare, Minus, PenLine, Plus } from 'lucide-react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export const DRAFT = 'draft';

const kinds: Array<{ kind: ChangeSummary['kind']; label: string; icon: React.ReactNode; tone: string }> = [
  { kind: 'added', label: 'Added', icon: <Plus />, tone: 'text-success' },
  { kind: 'modified', label: 'Modified', icon: <PenLine />, tone: 'text-warning' },
  { kind: 'removed', label: 'Removed', icon: <Minus />, tone: 'text-danger' },
];

const scopeLabel: Record<ChangeSummary['scope'], string> = {
  page: 'Page',
  section: 'Section',
  node: 'Element',
  theme: 'Theme',
  settings: 'Settings',
  navigation: 'Navigation',
  form: 'Form',
  header: 'Header',
  footer: 'Footer',
};

export function versionLabel(v: WebsiteVersion) {
  return `v${v.number}${v.message ? ` · ${v.message}` : ''}`;
}

export function CompareVersions({
  websiteId,
  versions,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  websiteId: string;
  versions: WebsiteVersion[];
  from: string | null;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  const api = useApi();
  const ready = !!from && from !== to;
  const q = useQuery({
    queryKey: qk.compare(websiteId, from ?? '', to),
    queryFn: () => api.websites.compareVersions(websiteId, from!, to),
    enabled: ready,
    staleTime: to === DRAFT ? 10_000 : Infinity,
  });

  const options = versions.map((v) => ({ value: v.id, label: <span className="truncate">{versionLabel(v)}</span>, description: v.isPublished ? 'Live' : undefined }));
  const toOptions = [{ value: DRAFT, label: 'Current draft' }, ...options];
  const changes = q.data ?? [];

  return (
    <Card id="compare">
      <CardHeader title="Compare" description="See what changed between two versions, or between a version and the current draft." />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Select size="sm" className="w-56" aria-label="Compare from" placeholder="Pick a version" value={from ?? undefined} onValueChange={onFromChange} options={options} />
        <ArrowRight className="size-4 text-fg-subtle" strokeWidth={1.5} aria-hidden />
        <Select size="sm" className="w-56" aria-label="Compare to" value={to} onValueChange={onToChange} options={toOptions} />
        {q.isSuccess && (
          <span className="ml-auto text-xs text-fg-muted">
            {changes.length === 0 ? 'No differences' : `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`}
          </span>
        )}
      </div>
      {!ready ? (
        <EmptyState compact icon={<GitCompare />} title={from && from === to ? 'Pick two different versions' : 'Pick a version to compare'} description="Comparisons use the same summary as AI change previews." />
      ) : q.isPending ? (
        <SkeletonRows rows={4} />
      ) : q.isError ? (
        <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
      ) : changes.length === 0 ? (
        <EmptyState compact title="These versions are identical" description="Nothing changed in pages, theme, navigation, forms or settings." />
      ) : (
        <div className="grid gap-px bg-border md:grid-cols-3">
          {kinds.map((k) => {
            const items = changes.filter((c) => c.kind === k.kind);
            return (
              <section key={k.kind} className="bg-surface px-4 py-3" aria-label={k.label}>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <span className={cn('[&_svg]:size-3.5 [&_svg]:stroke-[2]', k.tone)}>{k.icon}</span>
                  {k.label}
                  <span className="tabular-nums text-fg-subtle">{items.length}</span>
                </h4>
                {items.length === 0 ? (
                  <p className="text-xs text-fg-subtle">None</p>
                ) : (
                  <ul className="space-y-1">
                    {items.slice(0, 50).map((c) => (
                      <li key={`${c.scope}-${c.id}-${c.kind}`} className="flex min-w-0 items-center gap-2 text-sm">
                        <Badge tone="outline" size="xs" className="w-[68px] justify-center">
                          {scopeLabel[c.scope] ?? c.scope}
                        </Badge>
                        <span className="min-w-0 truncate text-fg" title={c.label}>
                          {c.label}
                        </span>
                      </li>
                    ))}
                    {items.length > 50 && <li className="text-xs text-fg-subtle">+{items.length - 50} more</li>}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
