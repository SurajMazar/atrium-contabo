/** Hostname helpers mirroring the API's normalisation and validation. */

export const HOSTNAME_RE = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;

export function normalizeHostname(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export function hostnameError(host: string): string | null {
  if (!host) return 'Enter a domain';
  if (!HOSTNAME_RE.test(host)) return 'Enter a valid domain like example.com or www.example.com';
  return null;
}

/** Same heuristic as the API: two labels = apex (root) domain. */
export function isApex(host: string) {
  return host.split('.').length === 2;
}

/** The apex/www counterpart we recommend adding alongside `host`, if any. */
export function counterpart(host: string): string | null {
  if (isApex(host)) return `www.${host}`;
  if (host.startsWith('www.') && host.split('.').length === 3) return host.slice(4);
  return null;
}
