/** Routes reachable without a session. */
const PUBLIC_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password', '/invite', '/offline'];
/** Routes a signed-in user should bounce away from. */
export const GUEST_ONLY = ['/login', '/register', '/forgot-password', '/reset-password'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Safe in-app return URL. Rejects anything that is not a same-origin path once a URL parser
 * has seen it: protocol-relative (`//x`), backslash tricks (`/\\x`), and control characters
 * that parsers strip (`/%09/example.com` → `//example.com`).
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || next.length > 2000 || !next.startsWith('/')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next) || next.startsWith('//')) return fallback;
  try {
    const base = 'https://atrium.invalid';
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
