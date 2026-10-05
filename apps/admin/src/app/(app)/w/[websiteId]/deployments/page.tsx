import type { Metadata } from 'next';
import { DeploymentsScreen } from '@/components/deployments/deployments-screen';

export const metadata: Metadata = { title: 'Deployments' };

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <DeploymentsScreen websiteId={websiteId} />;
}
