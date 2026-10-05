import type { Metadata } from 'next';
import { WebsiteDashboard } from '@/components/dashboard/website-dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <WebsiteDashboard websiteId={websiteId} />;
}
