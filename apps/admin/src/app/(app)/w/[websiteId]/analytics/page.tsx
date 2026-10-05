import type { Metadata } from 'next';
import { AnalyticsScreen } from '@/components/analytics/analytics-screen';

export const metadata: Metadata = { title: 'Analytics' };

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <AnalyticsScreen websiteId={websiteId} />;
}
