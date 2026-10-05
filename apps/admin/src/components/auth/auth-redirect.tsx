'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { GUEST_ONLY, isPublicPath, safeNext } from '@/lib/auth-paths';
import { useSession } from '@/lib/session';

export { isPublicPath, safeNext } from '@/lib/auth-paths';

/**
 * Global auth gate: unauthenticated users on private routes go to
 * /login?next=<current url>; authenticated users on guest-only pages go to `next`.
 */
export function AuthRedirect() {
  const { status } = useSession();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' && !isPublicPath(pathname)) {
      const qs = search.toString();
      const next = `${pathname}${qs ? `?${qs}` : ''}`;
      router.replace(next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
    } else if (status === 'authenticated' && GUEST_ONLY.some((p) => pathname === p)) {
      router.replace(safeNext(search.get('next'), pathname === '/register' ? '/onboarding' : '/'));
    }
  }, [status, pathname, search, router]);

  return null;
}
