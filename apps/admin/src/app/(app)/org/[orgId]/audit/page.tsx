import type { Metadata } from 'next';
import { AuditScreen } from '@/components/audit/audit-screen';

export const metadata: Metadata = { title: 'Audit log' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <AuditScreen orgId={orgId} />;
}
