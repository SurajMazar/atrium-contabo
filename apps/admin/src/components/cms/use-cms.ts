'use client';

import type { Collection } from '@atrium/sdk';
import { infiniteQueryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

export function useCollections(websiteId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.collections(websiteId), queryFn: () => api.collections.list(websiteId), staleTime: 15_000 });
}

/** Single collection; seeded from the website's collection list when cached. */
export function useCollection(cid: string, websiteId?: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.collection(cid),
    queryFn: () => api.collections.get(cid),
    placeholderData: () => (websiteId ? qc.getQueryData<Collection[]>(qk.collections(websiteId))?.find((c) => c.id === cid) : undefined),
  });
}

export function useCmsPermissions(websiteId: string) {
  const { can } = useSession();
  return { canManage: can('collection.manage', websiteId), canEdit: can('collection.content', websiteId) };
}

export const ITEMS_PAGE_SIZE = 50;

/** Shared infinite-query options for a collection's item list (table + prefetch). */
export function itemsQueryOptions(api: ReturnType<typeof useApi>, cid: string, filters: { search: string; status: string }) {
  return infiniteQueryOptions({
    queryKey: qk.collectionItems(cid, filters),
    queryFn: ({ pageParam }) =>
      api.collections.items(cid, { search: filters.search || undefined, status: filters.status === 'all' ? undefined : filters.status, cursor: pageParam, limit: ITEMS_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Write an updated collection into both the detail and the website list caches. */
export function useSetCollectionCache(websiteId: string) {
  const qc = useQueryClient();
  return (c: Collection) => {
    qc.setQueryData<Collection>(qk.collection(c.id), (prev) => ({ ...prev, ...c, itemCount: c.itemCount ?? prev?.itemCount }));
    qc.setQueryData<Collection[]>(qk.collections(websiteId), (list) => list?.map((x) => (x.id === c.id ? { ...x, ...c, itemCount: c.itemCount ?? x.itemCount } : x)));
  };
}
