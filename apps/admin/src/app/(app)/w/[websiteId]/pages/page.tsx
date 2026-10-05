import type { Metadata } from 'next';
import { PagesScreen } from '@/components/pages/pages-screen';

export const metadata: Metadata = { title: 'Pages' };

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <PagesScreen websiteId={websiteId} />;
}
