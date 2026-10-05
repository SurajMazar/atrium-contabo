import type { Metadata } from 'next';
import { VersionsScreen } from '@/components/versions/versions-screen';

export const metadata: Metadata = { title: 'Versions' };

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <VersionsScreen websiteId={websiteId} />;
}
