'use client';

import { cn } from '@atrium/ui';
import { LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/shell/brand';
import { useBranding } from '@/lib/branding';
import { DEFAULT_PRODUCT_NAME } from '@/lib/branding-core';

export { AtriumMark } from '@/components/shell/brand';

export interface AuthFrameProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Use the white-label login headline/subheadline when configured (sign-in screen). */
  brandHeadline?: boolean;
}

/**
 * Auth screens (sign in, register, password reset, invites). Single column by
 * default; when the brand sets a login image, a two-column layout with the
 * form on the left and the image on the right.
 */
export function AuthFrame({ title, description, children, footer, brandHeadline }: AuthFrameProps) {
  const { branding, productName } = useBranding();
  const headline = brandHeadline && branding.loginHeadline ? branding.loginHeadline : title;
  const sub = brandHeadline && branding.loginSubheadline ? branding.loginSubheadline : description;
  const image = branding.loginImageUrl;
  const poweredBy = productName !== DEFAULT_PRODUCT_NAME && !branding.hidePoweredBy;

  const form = (
    <div className="w-full max-w-[360px]">
      <h1 className="text-xl font-semibold tracking-tight text-fg text-balance">{headline}</h1>
      {sub && <p className="mt-1.5 text-sm text-fg-muted text-pretty">{sub}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 border-t border-border pt-4 text-sm text-fg-muted">{footer}</div>}
    </div>
  );

  const meta = (branding.supportUrl || poweredBy) && (
    <div className="flex items-center gap-4 text-xs text-fg-subtle">
      {branding.supportUrl && (
        <a href={branding.supportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-sm outline-none hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring">
          <LifeBuoy className="size-3.5" strokeWidth={1.5} />
          Help &amp; support
        </a>
      )}
      {poweredBy && <span>Powered by Atrium</span>}
    </div>
  );

  const logo = (
    <Link href="/" className="inline-flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={productName}>
      <BrandLogo size="md" />
    </Link>
  );

  if (image) {
    return (
      <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(440px,1fr)_minmax(0,1.15fr)]">
        <div className="flex min-h-dvh flex-col px-6 py-5 sm:px-10">
          <header className="flex h-9 items-center">{logo}</header>
          <main className="flex flex-1 items-center justify-center py-10">{form}</main>
          {meta && <footer className="flex h-9 items-center">{meta}</footer>}
        </div>
        <div className="relative hidden p-3 pl-0 lg:block">
          <div className="relative size-full overflow-hidden rounded-xl bg-surface-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center px-6">{logo}</header>
      <main className={cn('flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]')}>{form}</main>
      {meta && <footer className="flex h-12 items-center justify-center px-6">{meta}</footer>}
    </div>
  );
}
