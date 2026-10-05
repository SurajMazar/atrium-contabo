import type { Metadata } from 'next';
import { FormsScreen } from '@/components/forms/forms-screen';

export const metadata: Metadata = { title: 'Forms' };

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <FormsScreen websiteId={websiteId} />;
}
