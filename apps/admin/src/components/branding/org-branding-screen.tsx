'use client';

import { mergeBranding } from '@atrium/schema';
import { PermissionPage } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { BrandingEditor } from './branding-editor';

/** /org/[orgId]/branding — organization white-label overrides. */
export function OrgBrandingScreen({ orgId }: { orgId: string }) {
  const api = useApi();
  const { can } = useSession();
  return (
    <PermissionPage permission="organization.update">
      <BrandingEditor
        scope="organization"
        queryKey={['branding-editor', 'organization', orgId]}
        load={async () => {
          const r = await api.branding.get(orgId);
          return { value: r.organization ?? {}, inherited: mergeBranding(r.platform) };
        }}
        save={(b) => api.branding.saveOrganization(orgId, b)}
        mediaOrgId={orgId}
        canEdit={can('organization.update')}
      />
    </PermissionPage>
  );
}

/** /w/[websiteId]/branding — dashboard branding for one website, over the organization's. */
export function WebsiteBrandingScreen({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const { can } = useSession();
  const { organizationId } = useWebsite();
  return (
    <PermissionPage permission="website.read" websiteId={websiteId}>
      <BrandingEditor
        scope="website"
        queryKey={['branding-editor', 'website', websiteId]}
        load={async () => {
          const r = await api.branding.website(websiteId);
          return { value: r.website ?? {}, inherited: r.inherited };
        }}
        save={(b) => api.branding.saveWebsite(websiteId, b)}
        mediaOrgId={organizationId ?? null}
        canEdit={can('website.update', websiteId)}
        editPermission="website.update"
      />
    </PermissionPage>
  );
}

/** /admin/branding — platform defaults (super admins). */
export function PlatformBrandingScreen() {
  const api = useApi();
  const { currentOrg } = useSession();
  return (
    <BrandingEditor
      scope="platform"
      queryKey={['branding-editor', 'platform']}
      load={async () => {
        const r = await api.branding.get();
        return { value: r.platform ?? {}, inherited: mergeBranding() };
      }}
      save={(b) => api.branding.savePlatform(b)}
      mediaOrgId={currentOrg?.id ?? null}
      canEdit
    />
  );
}
