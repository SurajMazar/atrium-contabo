/** Routes reachable without a session. */
const PUBLIC_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password', '/invite', '/offline'];
/** Routes a signed-in user should bounce away from. */
export const GUEST_ONLY = ['/login', '/register', '/forgot-password', '/reset-password'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Safe in-app return URL (no protocol-relative or external redirects). */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
