'use client';

import type { List } from '@atrium/sdk';
import { Button, Input, Skeleton, TableContainer } from '@atrium/ui';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { qk } from '@/lib/query-keys';

/** Query-key prefix for invalidating every variant of an admin section. */
export const adminPrefix = (section: string) => ['admin', section] as const;

export type AdminPages<T> = InfiniteData<List<T>, string | undefined>;

/** Cursor-paginated admin list (organizations, users, websites, audit logs). */
export function useAdminList<T>(section: string, query: Record<string, string | undefined>, fetcher: (q: Record<string, string | undefined> & { cursor?: string }) => Promise<List<T>>) {
  const clean = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
  const q = useInfiniteQuery({
    queryKey: qk.admin(section, clean),
    queryFn: ({ pageParam }) => fetcher({ ...clean, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => (Array.isArray(p.items) ? p.items : [])) ?? [], [q.data]);
  return { ...q, items, key: qk.admin(section, clean) };
}

export function AdminSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <Input size="sm" prefix={<Search />} placeholder={placeholder} aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="w-72 max-w-full" />;
}

export function LoadMore({ hasNext, loading, onLoad }: { hasNext: boolean; loading: boolean; onLoad: () => void }) {
  if (!hasNext) return null;
  return (
    <div className="mt-3 flex justify-center">
      <Button size="sm" variant="ghost" loading={loading} onClick={onLoad}>
        Load more
      </Button>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <TableContainer>
      <div className="flex h-8 items-center gap-6 border-b border-border bg-surface-2/60 px-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex h-10 items-center gap-6 px-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={c === 0 ? 'h-4 w-40' : 'h-4 w-16'} />
            ))}
          </div>
        ))}
      </div>
    </TableContainer>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    text = String(value);
  }
  return <pre className="max-h-72 overflow-auto rounded-md border border-border bg-surface-2/40 p-3 font-mono text-xs leading-5 text-fg">{text}</pre>;
}
