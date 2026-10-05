'use client';

import Link from 'next/link';
import { BrandIcon } from '@/components/shell/brand';
import { useBranding } from '@/lib/branding';

export default function NotFound() {
  const { productName } = useBranding();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <BrandIcon className="size-8" />
      <p className="mt-2 font-mono text-xs text-fg-subtle">404</p>
      <h1 className="text-lg font-semibold text-fg">This page doesn’t exist</h1>
      <p className="max-w-sm text-sm text-fg-muted">The link may be broken, or the page may have been moved or deleted.</p>
      <Link href="/" className="mt-2 inline-flex h-(--ui-ctl-md) items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg shadow-xs outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring">
        Back to {productName}
      </Link>
    </div>
  );
}
