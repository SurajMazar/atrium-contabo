import type { Metadata } from 'next';
import { RolesScreen } from '@/components/roles/roles-screen';

export const metadata: Metadata = { title: 'Roles' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <RolesScreen orgId={orgId} />;
}
