'use client';

import { Breadcrumbs, cn, IconButton, Sheet, SheetContent, Spinner, Tooltip, type Crumb } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { Command, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { CommandMenu } from './command-menu';
import { useShell } from './crumbs';
import { adminNav, orgNav, websiteNav } from './nav-config';
import { Sidebar, websiteIdFromPath } from './sidebar';

function useRouteCrumbs(): Crumb[] {
  const pathname = usePathname();
  const api = useApi();
  const { currentOrg } = useSession();
  const extra = useShell((s) => s.extra);
  const wid = websiteIdFromPath(pathname);
  const site = useQuery({ queryKey: qk.website(wid ?? ''), queryFn: () => api.websites.get(wid!), enabled: !!wid, staleTime: 60_000 });
  const siteName = site.data?.name;
  return useMemo(() => {
    const crumbs: Crumb[] = [];
    if (wid) {
      crumbs.push({ label: 'Websites', href: '/' });
      crumbs.push({ label: siteName ?? 'Website', href: `/w/${wid}` });
      const section = websiteNav(wid).find((n) => !n.exact && (pathname === n.href || pathname.startsWith(`${n.href}/`)));
      if (section) crumbs.push({ label: section.label, href: section.href });
    } else if (pathname.startsWith('/org/')) {
      crumbs.push({ label: currentOrg?.name ?? 'Organization', href: '/' });
      const orgId = pathname.split('/')[2] ?? '';
      const section = orgNav(orgId).find((n) => pathname.startsWith(n.href));
      if (section) crumbs.push({ label: section.label, href: section.href });
    } else if (pathname.startsWith('/admin')) {
      crumbs.push({ label: 'Super admin', href: '/admin' });
      const section = adminNav.find((n) => !n.exact && pathname.startsWith(n.href));
      if (section) crumbs.push({ label: section.label, href: section.href });
    } else if (pathname.startsWith('/account')) {
      crumbs.push({ label: 'Account', href: '/account' });
    } else if (pathname.startsWith('/w/new')) {
      crumbs.push({ label: 'Websites', href: '/' }, { label: 'New website', href: '/w/new' });
      if (pathname.startsWith('/w/new/ai')) crumbs.push({ label: 'Generate with AI' });
    } else {
      crumbs.push({ label: currentOrg?.name ?? 'Websites' });
    }
    return [...crumbs, ...extra];
  }, [pathname, wid, siteName, currentOrg, extra]);
}

export function AppShell({ children, topbarActions }: { children: ReactNode; topbarActions?: ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const mobileOpen = useShell((s) => s.mobileNavOpen);
  const setMobileOpen = useShell((s) => s.setMobileNavOpen);
  const setPaletteOpen = useShell((s) => s.setPaletteOpen);
  const crumbs = useRouteCrumbs();

  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen]);

  if (status !== 'authenticated') {
    return (
      <div className="flex h-dvh items-center justify-center text-fg-muted">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[80] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-popover">
        Skip to content
      </a>
      <aside className="hidden w-60 shrink-0 border-r border-border lg:block">
        <Sidebar />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" size="sm" title="Navigation" className="w-72 max-w-[85vw]" bodyClassName="p-0">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg/95 px-3 sm:px-4">
          <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu />
          </IconButton>
          <Breadcrumbs
            items={crumbs}
            className="min-w-0 flex-1"
            renderLink={(c, cls) => (
              <Link href={c.href!} className={cls}>
                {c.label}
              </Link>
            )}
          />
          <div className="flex items-center gap-1">
            {topbarActions}
            <Tooltip content="Command palette" shortcut="⌘K">
              <IconButton label="Open command palette" onClick={() => setPaletteOpen(true)}>
                <Command />
              </IconButton>
            </Tooltip>
          </div>
        </header>
        <main id="main" className={cn('min-h-0 flex-1 overflow-y-auto')} tabIndex={-1}>
          {children}
        </main>
      </div>
      <CommandMenu />
    </div>
  );
}
