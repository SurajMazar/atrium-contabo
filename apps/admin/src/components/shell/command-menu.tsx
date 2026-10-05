'use client';

import { AtriumApiError } from '@atrium/sdk';
import { CommandGroup, CommandItem, CommandPalette, CommandSeparator, toast } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { FilePlus, FileText, Globe, ImageIcon, LogOut, Moon, Plus, Rocket, Search, Settings, Sparkles, Sun, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { useShell } from './crumbs';
import { orgNav, websiteNav } from './nav-config';
import { websiteIdFromPath } from './sidebar';

/** Global ⌘K command palette. */
export function CommandMenu() {
  const open = useShell((s) => s.paletteOpen);
  const setOpen = useShell((s) => s.setPaletteOpen);
  const router = useRouter();
  const pathname = usePathname();
  const api = useApi();
  const { currentOrg, can, signOut } = useSession();
  const { resolved, setTheme } = useTheme();
  const websiteId = websiteIdFromPath(pathname);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useShell.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const websites = useQuery({
    queryKey: qk.websites(currentOrg?.id ?? ''),
    queryFn: () => api.websites.list(currentOrg!.id),
    enabled: open && !!currentOrg,
  });
  const pages = useQuery({
    queryKey: qk.pages(websiteId ?? ''),
    queryFn: () => api.pages.list(websiteId!),
    enabled: open && !!websiteId,
  });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const publish = async () => {
    if (!websiteId) return;
    setOpen(false);
    const t = toast.loading('Publishing…');
    try {
      const r = await api.websites.publish(websiteId, { message: 'Published from command palette' });
      toast.success(`Published version ${r.version.number}`, { id: t });
    } catch (e) {
      const msg = e instanceof AtriumApiError && e.isValidation ? 'Publish blocked by validation errors. Open Deployments for details.' : e instanceof Error ? e.message : 'Publish failed';
      toast.error(msg, { id: t, action: { label: 'Details', onClick: () => router.push(`/w/${websiteId}/deployments`) } });
    }
  };

  return (
    <CommandPalette open={open} onOpenChange={setOpen} search={search} onSearchChange={setSearch} placeholder={websiteId ? 'Search pages, sections and actions…' : 'Search websites and actions…'}>
      {websiteId && (
        <CommandGroup heading="Actions">
          {can('page.create', websiteId) && (
            <CommandItem icon={<FilePlus />} onSelect={() => go(`/w/${websiteId}/pages?new=1`)}>
              Create page
            </CommandItem>
          )}
          {can('page.update', websiteId) && (
            <CommandItem icon={<FileText />} onSelect={() => go(`/w/${websiteId}/editor`)}>
              Open editor
            </CommandItem>
          )}
          {can('page.publish', websiteId) && (
            <CommandItem icon={<Rocket />} onSelect={() => void publish()}>
              Publish website
            </CommandItem>
          )}
          {can('ai.use', websiteId) && (
            <CommandItem icon={<Sparkles />} onSelect={() => go(`/w/${websiteId}/editor?ai=1`)}>
              Ask AI to edit this site
            </CommandItem>
          )}
          <CommandItem icon={<ImageIcon />} onSelect={() => go(`/w/${websiteId}/media`)}>
            Open media
          </CommandItem>
          <CommandItem icon={<Search />} onSelect={() => go(`/w/${websiteId}/seo`)}>
            Open SEO
          </CommandItem>
          <CommandItem icon={<Settings />} onSelect={() => go(`/w/${websiteId}/settings`)}>
            Website settings
          </CommandItem>
        </CommandGroup>
      )}
      {websiteId && (pages.data?.length ?? 0) > 0 && (
        <CommandGroup heading="Pages">
          {pages.data!.map((p) => (
            <CommandItem key={p.id} value={`page ${p.title} /${p.slug}`} icon={<FileText />} hint={`/${p.slug}`} onSelect={() => go(`/w/${websiteId}/editor?page=${p.id}`)}>
              {p.title}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {websiteId && (
        <CommandGroup heading="Go to">
          {websiteNav(websiteId)
            .filter((n) => !n.permission || can(n.permission, websiteId))
            .map((n) => (
              <CommandItem key={n.href} value={`go ${n.label}`} icon={<n.icon />} onSelect={() => go(n.href)}>
                {n.label}
              </CommandItem>
            ))}
        </CommandGroup>
      )}
      {(websites.data?.length ?? 0) > 0 && (
        <CommandGroup heading="Websites">
          {websites.data!.map((w) => (
            <CommandItem key={w.id} value={`website ${w.name} ${w.slug}`} icon={<Globe />} hint={w.primaryDomain ?? undefined} onSelect={() => go(`/w/${w.id}`)}>
              {w.name}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      <CommandSeparator />
      <CommandGroup heading="General">
        {can('website.create') && (
          <CommandItem icon={<Plus />} onSelect={() => go('/w/new')}>
            Create website
          </CommandItem>
        )}
        {can('ai.use') && (
          <CommandItem icon={<Sparkles />} onSelect={() => go('/w/new/ai')}>
            Generate a website with AI
          </CommandItem>
        )}
        {currentOrg &&
          orgNav(currentOrg.id)
            .filter((n) => !n.permission || can(n.permission))
            .map((n) => (
              <CommandItem key={n.href} value={`org ${n.label}`} icon={<n.icon />} onSelect={() => go(n.href)}>
                {n.label}
              </CommandItem>
            ))}
        <CommandItem icon={<User />} onSelect={() => go('/account')}>
          Account settings
        </CommandItem>
        <CommandItem
          icon={resolved === 'dark' ? <Sun /> : <Moon />}
          onSelect={() => {
            setTheme(resolved === 'dark' ? 'light' : 'dark');
            setOpen(false);
          }}
        >
          Switch to {resolved === 'dark' ? 'light' : 'dark'} theme
        </CommandItem>
        <CommandItem
          icon={<LogOut />}
          onSelect={async () => {
            setOpen(false);
            await signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </CommandItem>
      </CommandGroup>
    </CommandPalette>
  );
}
