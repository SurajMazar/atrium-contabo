'use client';

import { PermissionPage } from '@/components/common/permission';
import { useWebsite } from '@/lib/website-context';
import { MediaManager } from './media-manager';

export function WebsiteMedia() {
  const { websiteId, organizationId } = useWebsite();
  if (!organizationId) return null;
  return (
    <PermissionPage permission="media.read" websiteId={websiteId}>
      <MediaManager organizationId={organizationId} websiteId={websiteId} />
    </PermissionPage>
  );
}
