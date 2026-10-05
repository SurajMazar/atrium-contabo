'use client';

import { AtriumApiError } from '@atrium/sdk';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@atrium/ui';
import { ArrowLeft, Database } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Page } from '@/components/common/page';
import { SetCrumbs } from '@/components/shell/crumbs';
import { useWebsite } from '@/lib/website-context';
import { CollectionSettings } from './collection-settings';
import { ItemsView } from './items-view';
import { SchemaEditor } from './schema-editor';
import { setUrlParam } from './url-state';
import { useCmsPermissions, useCollection, useCollections } from './use-cms';

export type CollectionTab = 'items' | 'schema' | 'settings';

export function CollectionScreen({ collectionId, initialTab, initialItemId }: { collectionId: string; initialTab: CollectionTab; initialItemId?: string }) {
  const { websiteId } = useWebsite();
  const { canManage, canEdit } = useCmsPermissions(websiteId);
  const q = useCollection(collectionId, websiteId);
  const list = useCollections(websiteId);
  const [tab, setTab] = useState<CollectionTab>(initialTab);
  const [schemaDirty, setSchemaDirty] = useState(false);

  const changeTab = useCallback((t: string) => {
    const next = t as CollectionTab;
    setTab(next);
    setUrlParam('tab', next === 'items' ? null : next);
  }, []);

  const base = `/w/${websiteId}/cms`;
  const c = q.data;

  if (q.isError && !c) {
    const notFound = q.error instanceof AtriumApiError && (q.error.status === 404 || q.error.status === 403);
    return (
      <Page>
        {notFound ? (
          <EmptyState
            icon={<Database />}
            title="Collection not found"
            description="It may have been deleted, or you may not have access to it."
            action={
              <Button size="sm" leadingIcon={<ArrowLeft />} asChild>
                <Link href={base}>All collections</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState description={q.error.message} onRetry={() => void q.refetch()} />
        )}
      </Page>
    );
  }

  if (!c) {
    return (
      <Page width="wide">
        <div className="mb-6 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="mb-6 h-9 w-64" />
        <div className="rounded-lg border border-border bg-surface">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0">
              <Skeleton className="size-4" />
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="ml-auto h-3.5 w-16" />
            </div>
          ))}
        </div>
      </Page>
    );
  }

  const collections = list.data ?? [c];
  const singular = c.singularName || c.name;

  return (
    <Page width="wide">
      <SetCrumbs items={[{ label: c.name, href: `${base}/${c.id}` }]} />
      <PageHeader
        title={c.name}
        description={c.description || undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span className="font-mono">{c.slug}</span>
            {c.routePrefix && (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono">/{c.routePrefix}/:slug</span>
              </>
            )}
            {!canManage && !canEdit && <Badge tone="outline" size="xs">Read only</Badge>}
          </div>
        }
      />
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="items" count={c.itemCount}>
            Items
          </TabsTrigger>
          <TabsTrigger value="schema" count={c.fields.length}>
            Schema
            {schemaDirty && <span className="size-1.5 rounded-full bg-warning" aria-label="Unsaved changes" />}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="outline-none">
          <ItemsView websiteId={websiteId} collection={c} collections={collections} canEdit={canEdit} canManage={canManage} singular={singular} initialItemId={initialItemId} onOpenSchema={() => changeTab('schema')} />
        </TabsContent>
        <TabsContent value="schema" className="outline-none" forceMount hidden={tab !== 'schema'}>
          <SchemaEditor websiteId={websiteId} collection={c} collections={collections} canManage={canManage} active={tab === 'schema'} onDirtyChange={setSchemaDirty} />
        </TabsContent>
        <TabsContent value="settings" className="outline-none">
          <CollectionSettings websiteId={websiteId} collection={c} collections={collections} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
