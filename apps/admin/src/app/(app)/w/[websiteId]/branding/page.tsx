import type { Metadata } from 'next';
import { WebsiteBrandingScreen } from '@/components/branding/org-branding-screen';

export const metadata: Metadata = { title: 'Dashboard branding' };

export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <WebsiteBrandingScreen websiteId={websiteId} />;
}
