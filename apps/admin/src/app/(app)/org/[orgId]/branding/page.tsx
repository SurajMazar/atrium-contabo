import type { Metadata } from 'next';
import { OrgBrandingScreen } from '@/components/branding/org-branding-screen';

export const metadata: Metadata = { title: 'Branding' };

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <OrgBrandingScreen orgId={orgId} />;
}
