'use client';

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { BrokenLinks, useBrokenLinks } from './broken-links';
import { RedirectsEditor } from './redirects-editor';
import { SeoOverview } from './seo-overview';
import { SiteSeoForm } from './site-seo-form';

const TABS = ['overview', 'defaults', 'redirects', 'links'] as const;
type Tab = (typeof TABS)[number];

export function SeoScreen({ websiteId, initialTab }: { websiteId: string; initialTab?: string }) {
  return (
    <PermissionPage permission="page.read" websiteId={websiteId}>
      <SeoScreenInner websiteId={websiteId} initialTab={initialTab} />
    </PermissionPage>
  );
}

function SeoScreenInner({ websiteId, initialTab }: { websiteId: string; initialTab?: string }) {
  const api = useApi();
  const start: Tab = (TABS as readonly string[]).includes(initialTab ?? '') ? (initialTab as Tab) : 'overview';
  const [tab, setTab] = useState<Tab>(start);
  // Keep visited tabs mounted so unsaved edits survive tab switches.
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([start]));
  const redirects = useQuery({ queryKey: qk.redirects(websiteId), queryFn: () => api.websites.redirects(websiteId) });
  const links = useBrokenLinks(websiteId);

  const onTab = (v: string) => {
    const t = v as Tab;
    setTab(t);
    setVisited((s) => (s.has(t) ? s : new Set(s).add(t)));
    try {
      const url = new URL(window.location.href);
      if (t === 'overview') url.searchParams.delete('tab');
      else url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore */
    }
  };

  const linkCount = Array.isArray(links.data) ? links.data.length : undefined;

  return (
    <Page width="wide">
      <PageHeader title="SEO" description="Search visibility per page, site-wide defaults, redirects and link health." />
      <Tabs value={tab} onValueChange={onTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="defaults">Site defaults</TabsTrigger>
          <TabsTrigger value="redirects" count={Array.isArray(redirects.data) ? redirects.data.length : undefined}>
            Redirects
          </TabsTrigger>
          <TabsTrigger value="links" count={linkCount ? linkCount : undefined}>
            Broken links
          </TabsTrigger>
        </TabsList>
        {TABS.map((t) =>
          visited.has(t) ? (
            <TabsContent key={t} value={t} forceMount className="outline-none data-[state=inactive]:hidden">
              {t === 'overview' ? <SeoOverview websiteId={websiteId} /> : t === 'defaults' ? <SiteSeoForm websiteId={websiteId} /> : t === 'redirects' ? <RedirectsEditor websiteId={websiteId} /> : <BrokenLinks websiteId={websiteId} />}
            </TabsContent>
          ) : null,
        )}
      </Tabs>
    </Page>
  );
}
