import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge class names; later Tailwind utilities win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Shared focus ring for interactive controls. */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0';

/**
 * Control heights driven by CSS variables so white-label density can switch
 * them (compact: 24/28/32/36px). Every input, select, button and segmented
 * control of the same size shares one height.
 */
export const controlHeight = {
  xs: 'h-(--ui-ctl-xs)',
  sm: 'h-(--ui-ctl-sm)',
  md: 'h-(--ui-ctl-md)',
  lg: 'h-(--ui-ctl-lg)',
} as const;
export const controlSize = {
  xs: 'size-(--ui-ctl-xs)',
  sm: 'size-(--ui-ctl-sm)',
  md: 'size-(--ui-ctl-md)',
  lg: 'size-(--ui-ctl-lg)',
} as const;
export type ControlSize = keyof typeof controlHeight;

/** Shared field chrome for text-like inputs. */
export const fieldBase =
  'w-full rounded-md border border-border bg-surface text-fg placeholder:text-fg-subtle transition-colors ' +
  'hover:border-border-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-muted disabled:hover:border-border aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30';
