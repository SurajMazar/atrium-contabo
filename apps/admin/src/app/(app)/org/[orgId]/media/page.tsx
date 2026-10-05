import type { Metadata } from 'next';
import { MediaManager } from '@/components/media/media-manager';

export const metadata: Metadata = { title: 'Media library' };

export default async function OrgMediaPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <MediaManager organizationId={orgId} />;
}
