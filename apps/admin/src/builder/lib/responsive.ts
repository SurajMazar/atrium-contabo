import { BREAKPOINTS, isResponsiveObject, resolveResponsive, type Breakpoint, type Responsive } from '@atrium/schema';

/** Value explicitly set at this breakpoint (not inherited). */
export function ownValue<T>(value: Responsive<T> | undefined, bp: Breakpoint): T | undefined {
  if (value === undefined) return undefined;
  if (isResponsiveObject(value)) return value[bp];
  return bp === 'base' ? (value as T) : undefined;
}

/** Value inherited from larger breakpoints (ignores the breakpoint's own value). */
export function inheritedValue<T>(value: Responsive<T> | undefined, bp: Breakpoint): T | undefined {
  const idx = BREAKPOINTS.indexOf(bp);
  if (idx <= 0) return undefined;
  return resolveResponsive(value, BREAKPOINTS[idx - 1]!);
}

export function effectiveValue<T>(value: Responsive<T> | undefined, bp: Breakpoint): T | undefined {
  return resolveResponsive(value, bp);
}

export type OverrideState = 'set' | 'inherited' | 'none';

/**
 * `set`       — value defined at this breakpoint (base or an override),
 * `inherited` — no own value, but a larger breakpoint provides one,
 * `none`      — unset everywhere relevant.
 */
export function overrideState<T>(value: Responsive<T> | undefined, bp: Breakpoint): OverrideState {
  if (ownValue(value, bp) !== undefined) return 'set';
  return inheritedValue(value, bp) !== undefined ? 'inherited' : 'none';
}

/** Breakpoints (other than base) that override the value — shown as dots in the inspector. */
export function overriddenBreakpoints<T>(value: Responsive<T> | undefined): Breakpoint[] {
  if (!isResponsiveObject(value)) return [];
  return BREAKPOINTS.filter((b) => b !== 'base' && value[b] !== undefined);
}

/** Split a CSS box shorthand (`8px 16px`) into [top, right, bottom, left]. */
export function parseBox(value: string | undefined): [string, string, string, string] {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean);
  const [a = '', b = a, c = a, d = b] = parts;
  return [a, b, c, d];
}

/** Join four sides back into the shortest shorthand; empty sides become `0`. */
export function formatBox(sides: [string, string, string, string]): string | undefined {
  if (sides.every((s) => !s.trim())) return undefined;
  const [t, r, b, l] = sides.map((s) => s.trim() || '0') as [string, string, string, string];
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}
