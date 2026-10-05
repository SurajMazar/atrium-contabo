import type { Metadata } from 'next';
import { NewWebsite } from '@/components/create/new-website';

export const metadata: Metadata = { title: 'New website' };

export default async function NewWebsitePage({ searchParams }: { searchParams: Promise<{ method?: string }> }) {
  const { method } = await searchParams;
  return <NewWebsite initialMethod={method === 'template' || method === 'blank' || method === 'import' ? method : null} />;
}
