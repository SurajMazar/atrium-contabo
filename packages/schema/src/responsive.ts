import { z } from 'zod';

/**
 * Desktop-first cascading breakpoints. `base` applies everywhere; each smaller
 * breakpoint inherits from the next larger one unless it overrides the value.
 */
export const BREAKPOINTS = ['base', 'laptop', 'tablet', 'mobile'] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

export const DEFAULT_BREAKPOINT_WIDTHS: Record<Exclude<Breakpoint, 'base'>, number> = {
  laptop: 1279,
  tablet: 991,
  mobile: 767,
};

export type ResponsiveObject<T> = { base?: T; laptop?: T; tablet?: T; mobile?: T };
export type Responsive<T> = T | ResponsiveObject<T>;

export function responsive<T extends z.ZodType>(schema: T) {
  const obj = z
    .object({
      base: schema.optional(),
      laptop: schema.optional(),
      tablet: schema.optional(),
      mobile: schema.optional(),
    })
    .strict();
  return z.union([obj, schema]);
}

export function isResponsiveObject<T>(value: Responsive<T> | undefined): value is ResponsiveObject<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => (BREAKPOINTS as readonly string[]).includes(k));
}

/** Resolve the effective value at a breakpoint using desktop-first cascade. */
export function resolveResponsive<T>(value: Responsive<T> | undefined, bp: Breakpoint): T | undefined {
  if (value === undefined) return undefined;
  if (!isResponsiveObject(value)) return value as T;
  const order = BREAKPOINTS.slice(0, BREAKPOINTS.indexOf(bp) + 1).reverse();
  for (const key of order) {
    const v = value[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Set a value at one breakpoint without disturbing others. */
export function setResponsive<T>(value: Responsive<T> | undefined, bp: Breakpoint, next: T | undefined): Responsive<T> | undefined {
  const obj: ResponsiveObject<T> = isResponsiveObject(value)
    ? { ...value }
    : value === undefined
      ? {}
      : { base: value as T };
  if (next === undefined) delete obj[bp];
  else obj[bp] = next;
  const keys = Object.keys(obj) as Breakpoint[];
  if (keys.length === 0) return undefined;
  if (keys.length === 1 && keys[0] === 'base') return obj.base;
  return obj;
}
