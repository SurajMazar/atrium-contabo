const REQUEST_ID = /^[A-Za-z0-9._:-]{8,64}$/;

/** A client-supplied X-Request-Id is used only when well-formed (no log injection, bounded size). */
export function safeRequestId(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && REQUEST_ID.test(s) ? s : undefined;
}

/** Paths are logged without query strings so tokens, tickets and preview passwords never reach log storage. */
export function stripQuery(url?: string): string | undefined {
  return url?.split('?')[0];
}
