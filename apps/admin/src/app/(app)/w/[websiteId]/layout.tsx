import type { ReactNode } from 'react';
import { WebsiteBoundary } from '@/components/website/website-boundary';

export default async function WebsiteLayout({ children, params }: { children: ReactNode; params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <WebsiteBoundary websiteId={websiteId}>{children}</WebsiteBoundary>;
}
