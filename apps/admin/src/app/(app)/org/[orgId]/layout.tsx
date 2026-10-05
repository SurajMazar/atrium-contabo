import type { ReactNode } from 'react';
import { OrgBoundary } from '@/components/org/org-boundary';

export default async function OrgLayout({ children, params }: { children: ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <OrgBoundary orgId={orgId}>{children}</OrgBoundary>;
}
