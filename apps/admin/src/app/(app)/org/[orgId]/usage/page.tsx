import type { Metadata } from 'next';
import { UsageScreen } from '@/components/usage/usage-screen';

export const metadata: Metadata = { title: 'Usage & billing' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <UsageScreen orgId={orgId} />;
}
