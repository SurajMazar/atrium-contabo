'use client';

import { Skeleton } from '@atrium/ui';
import type { ReactNode } from 'react';
import { Page } from '@/components/common/page';
import { Forbidden } from '@/components/common/permission';
import { useSession } from '@/lib/session';

/** Gate for every `/admin/**` route: platform super admins only. */
export function SuperAdminGuard({ children }: { children: ReactNode }) {
  const { user, status } = useSession();
  if (status === 'loading') {
    return (
      <Page>
        <Skeleton className="mb-2 h-6 w-48" />
        <Skeleton className="mb-6 h-4 w-80" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!user?.isSuperAdmin) {
    return (
      <Page>
        <Forbidden>Platform administration is limited to Atrium super admins.</Forbidden>
      </Page>
    );
  }
  return <>{children}</>;
}
