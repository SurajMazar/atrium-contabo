'use client';

import { Button, Spinner } from '@atrium/ui';
import { X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/shell/brand';
import { UserMenu } from '@/components/shell/user-menu';
import { useSession } from '@/lib/session';

/** Minimal chrome for focused creation flows (onboarding, new website, AI generation). */
export function FocusShell({ children }: { children: ReactNode }) {
  const { status, memberships } = useSession();
  if (status !== 'authenticated') {
    return (
      <div className="flex h-dvh items-center justify-center text-fg-muted">
        <Spinner className="size-5" />
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg px-4">
        <Link href="/" className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandLogo size="sm" />
        </Link>
        <div className="flex-1" />
        <div className="w-44">
          <UserMenu />
        </div>
        {memberships.length > 0 && (
          <Button asChild variant="ghost" size="sm" leadingIcon={<X />}>
            <Link href="/">Close</Link>
          </Button>
        )}
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
