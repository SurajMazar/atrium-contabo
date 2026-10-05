import { cn } from '@atrium/ui';
import type { ReactNode } from 'react';

/** Standard content container for admin screens. */
export function Page({ children, className, width = 'default' }: { children: ReactNode; className?: string; width?: 'narrow' | 'default' | 'wide' | 'full' }) {
  const max = width === 'narrow' ? 'max-w-3xl' : width === 'default' ? 'max-w-6xl' : width === 'wide' ? 'max-w-[1400px]' : 'max-w-none';
  return <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:px-8', max, className)}>{children}</div>;
}
