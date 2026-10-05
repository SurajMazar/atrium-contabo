import { DEFAULT_BREAKPOINT_WIDTHS, type Breakpoint } from '@atrium/schema';

export type DeviceId = 'desktop' | 'laptop' | 'tablet' | 'mobile' | 'custom';

export interface DeviceSpec {
  id: Exclude<DeviceId, 'custom'>;
  label: string;
  width: number;
  breakpoint: Breakpoint;
  icon: 'monitor' | 'laptop' | 'tablet' | 'smartphone';
  shortcut: string;
}

export const DEVICES: DeviceSpec[] = [
  { id: 'desktop', label: 'Desktop', width: 1440, breakpoint: 'base', icon: 'monitor', shortcut: '1' },
  { id: 'laptop', label: 'Laptop', width: 1280, breakpoint: 'laptop', icon: 'laptop', shortcut: '2' },
  { id: 'tablet', label: 'Tablet', width: 834, breakpoint: 'tablet', icon: 'tablet', shortcut: '3' },
  { id: 'mobile', label: 'Mobile', width: 390, breakpoint: 'mobile', icon: 'smartphone', shortcut: '4' },
];

export const BREAKPOINT_LABEL: Record<Breakpoint, string> = { base: 'Desktop', laptop: 'Laptop', tablet: 'Tablet', mobile: 'Mobile' };

/** Map an arbitrary frame width to the breakpoint whose media query applies (desktop-first). */
export function breakpointForWidth(width: number): Breakpoint {
  if (width <= DEFAULT_BREAKPOINT_WIDTHS.mobile) return 'mobile';
  if (width <= DEFAULT_BREAKPOINT_WIDTHS.tablet) return 'tablet';
  if (width <= DEFAULT_BREAKPOINT_WIDTHS.laptop) return 'laptop';
  return 'base';
}

export function deviceWidth(device: DeviceId, customWidth: number): number {
  if (device === 'custom') return Math.max(320, Math.min(2560, customWidth));
  return DEVICES.find((d) => d.id === device)!.width;
}
