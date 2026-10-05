'use client';

import type { WebsiteSummary } from '@atrium/sdk';
import { cn, Kbd } from '@atrium/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Globe, Plus, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useShell } from './crumbs';
import { adminNav, orgNav, websiteNav, type NavItem } from './nav-config';
import { OrgSwitcher } from './org-switcher';
import { UserMenu } from './user-menu';

export function websiteIdFromPath(pathname: string): string | null {
  const m = /^\/w\/([^/]+)/.exec(pathname);
  if (!m || m[1] === 'new') return null;
  return m[1] ?? null;
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname, onNavigate, prefetchFn }: { item: NavItem; pathname: string; onNavigate?: () => void; prefetchFn?: () => void }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      onMouseEnter={prefetchFn}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-7 items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-fg-muted hover:bg-surface-3/60 hover:text-fg',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-fg' : 'text-fg-subtle group-hover:text-fg-muted')} strokeWidth={1.5} />
      <span className="truncate">{item.label}</span>
      {item.external && <ExternalLink className="ml-auto size-3 text-fg-subtle opacity-0 group-hover:opacity-100" strokeWidth={1.5} />}
    </Link>
  );
}

function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between px-2 pt-2">
      <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{children}</span>
      {action}
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const api = useApi();
  const qc = useQueryClient();
  const { currentOrg, user, can } = useSession();
  const setPaletteOpen = useShell((s) => s.setPaletteOpen);
  const websiteId = websiteIdFromPath(pathname);
  const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const [filter, setFilter] = useState('');

  const websites = useQuery({
    queryKey: qk.websites(currentOrg?.id ?? ''),
    queryFn: () => api.websites.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const current = websites.data?.find((w) => w.id === websiteId);
  const filtered = useMemo(() => {
    const list = websites.data ?? [];
    const f = filter.trim().toLowerCase();
    return f ? list.filter((w) => w.name.toLowerCase().includes(f) || w.slug.includes(f)) : list;
  }, [websites.data, filter]);

  const prefetchSite = (w: WebsiteSummary) => {
    void qc.prefetchQuery({ queryKey: qk.dashboard(w.id), queryFn: () => api.websites.dashboard(w.id), staleTime: 30_000 });
  };

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-surface-2/60">
      <div className="space-y-1 px-2 pb-2 pt-2">
        <OrgSwitcher />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-7 w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-sm text-fg-subtle outline-none transition-colors hover:border-border-strong hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-3.5" strokeWidth={1.5} />
          <span className="flex-1 text-left">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {inAdmin ? (
          <>
            <NavLink item={{ label: 'Back to websites', href: '/', icon: ArrowLeft, exact: true }} pathname="" onNavigate={onNavigate} />
            <SectionLabel>Super admin</SectionLabel>
            <div className="space-y-px">
              {adminNav.map((it) => (
                <NavLink key={it.href} item={it} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </div>
          </>
        ) : websiteId ? (
          <>
            <Link
              href="/"
              onClick={onNavigate}
              className="mb-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-3.5" strokeWidth={1.5} />
              All websites
            </Link>
            <div className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-fg-muted">
                <Globe className="size-3.5" strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{current?.name ?? 'Website'}</div>
                <div className="truncate text-2xs text-fg-subtle">{current?.primaryDomain ?? current?.platformUrl?.replace(/^https?:\/\//, '') ?? ' '}</div>
              </div>
            </div>
            <div className="space-y-px">
              {websiteNav(websiteId)
                .filter((it) => !it.permission || can(it.permission, websiteId))
                .map((it) => (
                  <NavLink key={it.href} item={it} pathname={pathname} onNavigate={onNavigate} />
                ))}
            </div>
          </>
        ) : (
          <>
            <SectionLabel
              action={
                can('website.create') ? (
                  <Link href="/w/new" onClick={onNavigate} aria-label="Create website" className="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring">
                    <Plus className="size-3.5" strokeWidth={1.5} />
                  </Link>
                ) : undefined
              }
            >
              Websites
            </SectionLabel>
            {(websites.data?.length ?? 0) > 6 && (
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter websites"
                aria-label="Filter websites"
                className="mb-1 h-7 w-full rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-fg-subtle focus-visible:bg-surface focus-visible:ring-1 focus-visible:ring-border"
              />
            )}
            <div className="space-y-px">
              <NavLink item={{ label: 'All websites', href: '/', icon: Globe, exact: true }} pathname={pathname} onNavigate={onNavigate} />
              {websites.isPending && currentOrg
                ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="mx-2 my-2 h-3 w-3/4 animate-pulse rounded-sm bg-surface-3" />)
                : filtered.slice(0, 30).map((w) => (
                    <Link
                      key={w.id}
                      href={`/w/${w.id}`}
                      onClick={onNavigate}
                      onMouseEnter={() => prefetchSite(w)}
                      className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-fg-muted outline-none transition-colors hover:bg-surface-3/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={cn('size-1.5 shrink-0 rounded-full', w.status === 'PUBLISHED' ? 'bg-success' : 'bg-fg-subtle/60')} aria-hidden />
                      <span className="truncate">{w.name}</span>
                    </Link>
                  ))}
            </div>
          </>
        )}

        {!inAdmin && currentOrg && (
          <>
            <SectionLabel>Organization</SectionLabel>
            <div className="space-y-px">
              {orgNav(currentOrg.id)
                .filter((it) => !it.permission || can(it.permission))
                .map((it) => (
                  <NavLink key={it.href} item={it} pathname={pathname} onNavigate={onNavigate} />
                ))}
            </div>
          </>
        )}
        {!inAdmin && user?.isSuperAdmin && (
          <>
            <SectionLabel>Platform</SectionLabel>
            <NavLink item={{ label: 'Super admin', href: '/admin', icon: ShieldCheck }} pathname={pathname} onNavigate={onNavigate} />
          </>
        )}
      </div>

      <div className="border-t border-border p-2">
        <UserMenu />
      </div>
    </nav>
  );
}
