import type { Metadata } from 'next';
import { DomainsScreen } from '@/components/domains/domains-screen';

export const metadata: Metadata = { title: 'Domains' };

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <DomainsScreen websiteId={websiteId} />;
}
