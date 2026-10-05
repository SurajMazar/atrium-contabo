'use client';

import { PageHeader, Skeleton } from '@atrium/ui';
import { useEffect } from 'react';
import { Page } from '@/components/common/page';
import { useSession } from '@/lib/session';
import { AppearanceSection } from './appearance-section';
import { MfaSection } from './mfa-section';
import { PasswordSection } from './password-section';
import { ProfileSection } from './profile-section';
import { SessionsSection } from './sessions-section';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'password', label: 'Password' },
  { id: 'security', label: 'Two-factor' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'appearance', label: 'Appearance' },
];

export function AccountScreen() {
  const { user, status } = useSession();

  // Sections render client-side, so scroll to the hash target once they exist.
  useEffect(() => {
    if (!user) return;
    const go = () => {
      const id = window.location.hash.slice(1);
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, [user]);

  return (
    <Page width="narrow">
      <PageHeader title="Account" description="Your personal profile and sign-in security. These settings apply across all organizations.">
        <nav aria-label="Account sections" className="-ml-2 flex flex-wrap gap-0.5">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-md px-2 py-1 text-xs font-medium text-fg-muted outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring">
              {s.label}
            </a>
          ))}
        </nav>
      </PageHeader>
      {!user || status !== 'authenticated' ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-56" />
              </div>
              <div className="space-y-3 p-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <ProfileSection user={user} />
          <PasswordSection />
          <MfaSection user={user} />
          <SessionsSection />
          <AppearanceSection />
        </div>
      )}
    </Page>
  );
}
