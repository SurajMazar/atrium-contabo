import type { Metadata } from 'next';
import { OrgSettingsScreen } from '@/components/org/org-settings';

export const metadata: Metadata = { title: 'Organization settings' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <OrgSettingsScreen orgId={orgId} />;
}
