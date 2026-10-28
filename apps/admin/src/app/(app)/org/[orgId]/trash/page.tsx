import type { Metadata } from 'next';
import { TrashScreen } from '@/components/trash/trash-screen';

export const metadata: Metadata = { title: 'Trash' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <TrashScreen orgId={orgId} />;
}
