import type { Metadata } from 'next';
import { WebhooksScreen } from '@/components/webhooks/webhooks-screen';

export const metadata: Metadata = { title: 'Webhooks' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <WebhooksScreen orgId={orgId} />;
}
