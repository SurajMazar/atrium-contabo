'use client';

import { Button, EmptyState } from '@atrium/ui';
import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { Page } from '@/components/common/page';
import { useSession } from '@/lib/session';

/** Validates org membership for `/org/[orgId]/*` and makes it the current org. */
export function OrgBoundary({ orgId, children }: { orgId: string; children: ReactNode }) {
  const { memberships, currentOrg, setCurrentOrg, user } = useSession();
  const member = memberships.some((m) => m.organization.id === orgId);
  useEffect(() => {
    if (member && currentOrg?.id !== orgId) setCurrentOrg(orgId);
  }, [member, currentOrg?.id, orgId, setCurrentOrg]);
  if (!member && !user?.isSuperAdmin) {
    return (
      <Page>
        <EmptyState
          icon={<Building2 />}
          title="Organization not found"
          description="You’re not a member of this organization, or it no longer exists."
          action={
            <Button asChild size="sm">
              <Link href="/">Back to websites</Link>
            </Button>
          }
        />
      </Page>
    );
  }
  return <>{children}</>;
}
