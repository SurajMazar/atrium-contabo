import type { Metadata } from 'next';
import { CollectionScreen, type CollectionTab } from '@/components/cms/collection-screen';

export const metadata: Metadata = { title: 'Collection' };

const TABS: CollectionTab[] = ['items', 'schema', 'settings'];

export default async function Page({ params, searchParams }: { params: Promise<{ websiteId: string; collectionId: string }>; searchParams: Promise<{ tab?: string | string[]; item?: string | string[] }> }) {
  const { collectionId } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === 'string' && (TABS as string[]).includes(sp.tab) ? (sp.tab as CollectionTab) : 'items';
  const item = typeof sp.item === 'string' ? sp.item : undefined;
  return <CollectionScreen key={collectionId} collectionId={collectionId} initialTab={tab} initialItemId={item} />;
}
