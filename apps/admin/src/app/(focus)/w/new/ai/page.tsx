import type { Metadata } from 'next';
import { AiCreate } from '@/components/create/ai-create';

export const metadata: Metadata = { title: 'Generate a website' };

export default async function AiCreatePage({ searchParams }: { searchParams: Promise<{ generation?: string; website?: string }> }) {
  const { generation, website } = await searchParams;
  return <AiCreate generationId={generation ?? null} websiteId={website ?? null} />;
}
