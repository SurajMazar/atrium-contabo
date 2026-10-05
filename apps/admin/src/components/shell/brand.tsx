'use client';

import { cn } from '@atrium/ui';
import { useBranding } from '@/lib/branding';

/** Default Atrium mark (used when no white-label icon/logo is configured). */
export function AtriumMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="112" className="fill-fg" />
      <path d="M168 384V248a88 88 0 0 1 176 0v136" fill="none" className="stroke-bg" strokeWidth="40" strokeLinecap="square" />
      <path d="M228 384v-96a28 28 0 0 1 56 0v96" fill="none" className="stroke-accent" strokeWidth="24" />
    </svg>
  );
}

/** Square app icon: white-label icon when set, else the Atrium mark. */
export function BrandIcon({ className = 'size-6' }: { className?: string }) {
  const { branding } = useBranding();
  if (branding.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={branding.iconUrl} alt="" className={cn('shrink-0 rounded-sm object-contain', className)} />;
  }
  return <AtriumMark className={cn('shrink-0', className)} />;
}

/**
 * Product lockup: the configured logo (light/dark variant) or icon + product
 * name. `size` sets the logo height (sm 20px, md 24px, lg 28px).
 */
export function BrandLogo({ size = 'md', className, showName = true }: { size?: 'sm' | 'md' | 'lg'; className?: string; showName?: boolean }) {
  const { logoUrl, productName } = useBranding();
  const h = size === 'sm' ? 'h-5' : size === 'md' ? 'h-6' : 'h-7';
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={productName} className={cn(h, 'w-auto max-w-[160px] shrink-0 object-contain object-left', className)} />;
  }
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <BrandIcon className={size === 'sm' ? 'size-5' : size === 'md' ? 'size-6' : 'size-7'} />
      {showName && <span className={cn('truncate font-semibold tracking-tight text-fg', size === 'lg' ? 'text-base' : 'text-sm')}>{productName}</span>}
    </span>
  );
}
