'use client';

import { AtriumApiError } from '@atrium/sdk';
import { Button, EmptyState, ErrorState } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { Globe, Lock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { Page } from '@/components/common/page';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { WebsiteContextProvider } from '@/lib/website-context';

/** Loads the website (into `qk.website(id)`), syncs the current org and provides `useWebsite()`. */
export function WebsiteBoundary({ websiteId, children }: { websiteId: string; children: ReactNode }) {
  const api = useApi();
  const { currentOrg, setCurrentOrg, memberships } = useSession();
  const q = useQuery({ queryKey: qk.website(websiteId), queryFn: () => api.websites.get(websiteId), staleTime: 60_000 });

  useEffect(() => {
    const orgId = q.data?.organizationId;
    if (orgId && orgId !== currentOrg?.id && memberships.some((m) => m.organization.id === orgId)) setCurrentOrg(orgId);
  }, [q.data?.organizationId, currentOrg?.id, memberships, setCurrentOrg]);

  if (q.isError) {
    const err = q.error;
    if (err instanceof AtriumApiError && (err.status === 404 || err.status === 403)) {
      return (
        <Page>
          <EmptyState
            icon={err.status === 404 ? <Globe /> : <Lock />}
            title={err.status === 404 ? 'Website not found' : 'You don’t have access to this website'}
            description={err.status === 404 ? 'It may have been deleted, or the link is wrong.' : 'Ask an organization admin to give you access.'}
            action={
              <Button asChild size="sm">
                <Link href="/">Back to websites</Link>
              </Button>
            }
          />
        </Page>
      );
    }
    return (
      <Page>
        <ErrorState description={err.message} onRetry={() => void q.refetch()} />
      </Page>
    );
  }

  if (q.isPending) {
    return <PageSkeleton />;
  }

  return <WebsiteContextProvider value={{ websiteId, website: q.data, organizationId: q.data?.organizationId, isLoading: q.isPending }}>{children}</WebsiteContextProvider>;
}
