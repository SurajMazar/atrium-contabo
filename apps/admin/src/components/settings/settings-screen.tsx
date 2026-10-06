'use client';

import { cn, ConfirmDialog, PageHeader } from '@atrium/ui';
import { AlertTriangle, ArrowLeftRight, BarChart3, Building2, Code2, Cookie, Gauge, Lock, Paintbrush, Palette, Settings2, Share2, type LucideIcon } from 'lucide-react';
import { useCallback, useState, type ComponentType } from 'react';
import { Page } from '@/components/common/page';
import { PermissionPage } from '@/components/common/permission';
import { useSession } from '@/lib/session';
import { useWebsite } from '@/lib/website-context';
import { DirtyContext, useBeforeUnload } from './save-bar';
import { AnalyticsSettingsSection } from './section-analytics';
import { BrandingSection } from './section-branding';
import { BusinessSection } from './section-business';
import { CookiesSection } from './section-cookies';
import { CssSection } from './section-css';
import { DangerSection } from './section-danger';
import { GeneralSection } from './section-general';
import { PerformanceSection } from './section-performance';
import { ScriptsSection } from './section-scripts';
import { SocialSection } from './section-social';
import { TransferSection } from './section-transfer';

interface SectionDef {
  id: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType<{ websiteId: string }>;
  /** Shows a lock when the user lacks this permission. */
  permission?: string;
  tone?: 'danger';
}

const GROUPS: Array<{ label: string; items: SectionDef[] }> = [
  {
    label: 'Site',
    items: [
      { id: 'general', label: 'General', icon: Settings2, component: GeneralSection },
      { id: 'business', label: 'Business & contact', icon: Building2, component: BusinessSection },
      { id: 'social', label: 'Social links', icon: Share2, component: SocialSection },
      { id: 'branding', label: 'Branding', icon: Palette, component: BrandingSection },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { id: 'scripts', label: 'Scripts', icon: Code2, component: ScriptsSection, permission: 'code.manage' },
      { id: 'cookies', label: 'Cookie consent', icon: Cookie, component: CookiesSection },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, component: AnalyticsSettingsSection },
      { id: 'performance', label: 'Page loading', icon: Gauge, component: PerformanceSection },
      { id: 'css', label: 'Custom CSS', icon: Paintbrush, component: CssSection, permission: 'code.manage' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'transfer', label: 'Export & import', icon: ArrowLeftRight, component: TransferSection },
      { id: 'danger', label: 'Danger zone', icon: AlertTriangle, component: DangerSection, tone: 'danger' },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.items);
const resolve = (id: string | undefined) => ALL.find((s) => s.id === id)?.id ?? 'general';

export function SettingsScreen({ websiteId, initialSection }: { websiteId: string; initialSection?: string }) {
  return (
    <PermissionPage permission="website.read" websiteId={websiteId}>
      <SettingsInner websiteId={websiteId} initialSection={initialSection} />
    </PermissionPage>
  );
}

function SettingsInner({ websiteId, initialSection }: { websiteId: string; initialSection?: string }) {
  const { can } = useSession();
  const { website } = useWebsite();
  const [section, setSection] = useState(() => resolve(initialSection));
  const [seenProp, setSeenProp] = useState(initialSection);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  useBeforeUnload(dirty);

  const go = useCallback((id: string) => {
    setSection(id);
    setDirty(false);
    try {
      const url = new URL(window.location.href);
      if (id === 'general') url.searchParams.delete('section');
      else url.searchParams.set('section', id);
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore */
    }
  }, []);

  // Follow in-app links like `?section=cookies` that re-render this route.
  if (initialSection !== seenProp) {
    setSeenProp(initialSection);
    const next = resolve(initialSection);
    if (next !== section) {
      if (dirty) setPending(next);
      else setSection(next);
    }
  }

  const request = (id: string) => {
    if (id === section) return;
    if (dirty) setPending(id);
    else go(id);
  };

  const active = ALL.find((s) => s.id === section) ?? ALL[0]!;
  const Active = active.component;

  return (
    <Page width="default">
      <PageHeader title="Settings" description={website ? `Configuration for ${website.name}` : undefined} />
      <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
        <nav aria-label="Settings sections" className="md:sticky md:top-4 md:self-start">
          {/* Small screens: horizontal scroller */}
          <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] md:hidden">
            {ALL.map((s) => (
              <li key={s.id}>
                <NavButton item={s} active={s.id === section} locked={!!s.permission && !can(s.permission, websiteId)} onClick={() => request(s.id)} compact />
              </li>
            ))}
          </ul>
          <div className="hidden space-y-4 md:block">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="mb-1 px-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{g.label}</div>
                <ul className="space-y-px">
                  {g.items.map((s) => (
                    <li key={s.id}>
                      <NavButton item={s} active={s.id === section} locked={!!s.permission && !can(s.permission, websiteId)} onClick={() => request(s.id)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0">
          <DirtyContext.Provider value={setDirty}>
            <Active key={active.id} websiteId={websiteId} />
          </DirtyContext.Provider>
        </div>
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Discard unsaved changes?"
        description="You have changes in this section that haven’t been saved."
        confirmLabel="Discard changes"
        tone="danger"
        onConfirm={() => {
          if (pending) go(pending);
          setPending(null);
        }}
      />
    </Page>
  );
}

function NavButton({ item, active, locked, onClick, compact }: { item: SectionDef; active: boolean; locked: boolean; onClick: () => void; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'h-7 border border-border' : 'h-8',
        active ? 'bg-surface-3 font-medium text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        item.tone === 'danger' && !active && 'text-danger hover:text-danger',
      )}
    >
      <Icon className={cn('size-4 shrink-0', item.tone === 'danger' ? 'text-danger' : active ? 'text-fg' : 'text-fg-subtle')} strokeWidth={1.5} />
      <span className="flex-1 truncate">{item.label}</span>
      {locked && <Lock className="size-3 shrink-0 text-fg-subtle" strokeWidth={1.5} aria-label="Restricted" />}
    </button>
  );
}
