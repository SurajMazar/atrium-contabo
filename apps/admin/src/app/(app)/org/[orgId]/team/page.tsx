import type { Metadata } from 'next';
import { TeamScreen } from '@/components/team/team-screen';

export const metadata: Metadata = { title: 'Team' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <TeamScreen orgId={orgId} />;
}
