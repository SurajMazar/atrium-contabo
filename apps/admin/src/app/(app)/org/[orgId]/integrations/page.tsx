import type { Metadata } from 'next';
import { Suspense } from 'react';
import { IntegrationsScreen } from '@/components/integrations/integrations-screen';

export const metadata: Metadata = { title: 'Integrations' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return (
    <Suspense>
      <IntegrationsScreen orgId={orgId} />
    </Suspense>
  );
}
