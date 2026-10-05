/**
 * Small, dependency-free IPv4/IPv6 parser + classifier used by the outbound network guard.
 *
 * Only canonical textual forms are accepted here (dotted-quad IPv4, RFC 4291 IPv6 incl. an
 * embedded IPv4 tail). Legacy IPv4 spellings (`0x7f000001`, `2130706433`, `0177.0.0.1`) are
 * normalized by the WHATWG URL parser before they reach us, and DNS results are always
 * canonical — anything else is "not an IP" and therefore goes through DNS resolution, whose
 * results are classified again.
 */

export type IpVersion = 4 | 6;

export interface IpClassification {
  version: IpVersion;
  /** True only for globally routable unicast addresses. */
  public: boolean;
  /** Why the address is not public (e.g. `loopback`, `private`, `ipv4-mapped:loopback`). */
  reason?: string;
  /** IPv4 address embedded in an IPv6 transition form (mapped, NAT64, 6to4, SIIT). */
  embeddedV4?: string;
}

const V4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const V4_RE = new RegExp(`^${V4_OCTET}\\.${V4_OCTET}\\.${V4_OCTET}\\.${V4_OCTET}$`);

/** Strict dotted-quad parser (no leading zeros, no shorthand). */
export function parseIPv4(input: string): [number, number, number, number] | undefined {
  const m = V4_RE.exec(input.trim());
  if (!m) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/** Parse IPv6 text (optionally bracketed, optional `%zone`) into eight 16-bit groups. */
export function parseIPv6(input: string): number[] | undefined {
  let s = input.trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  const pct = s.indexOf('%');
  if (pct >= 0) s = s.slice(0, pct);
  if (!s.includes(':') || !/^[0-9a-fA-F:.]+$/.test(s)) return undefined;
  // Embedded IPv4 tail (`::ffff:127.0.0.1`) → two hex groups.
  const lastColon = s.lastIndexOf(':');
  const last = s.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = parseIPv4(last);
    if (!v4) return undefined;
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return undefined;
  const groups = (part: string): number[] => (part === '' ? [] : part.split(':').map((g) => (/^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : Number.NaN)));
  const head = groups(halves[0]!);
  const tail = halves.length === 2 ? groups(halves[1]!) : [];
  if ([...head, ...tail].some((n) => Number.isNaN(n))) return undefined;
  if (halves.length === 1) return head.length === 8 ? head : undefined;
  const fill = 8 - head.length - tail.length;
  if (fill < 1) return undefined;
  return [...head, ...new Array<number>(fill).fill(0), ...tail];
}

export function ipVersion(input: string): IpVersion | 0 {
  if (parseIPv4(input)) return 4;
  if (parseIPv6(input)) return 6;
  return 0;
}

const toU32 = (o: readonly number[]) => ((o[0]! << 24) | (o[1]! << 16) | (o[2]! << 8) | o[3]!) >>> 0;

/** Non-public IPv4 ranges: [network, prefix length, reason]. */
const V4_BLOCKED: Array<[string, number, string]> = [
  ['0.0.0.0', 8, 'this-network'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'shared-cgnat'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'ietf-protocol'],
  ['192.0.2.0', 24, 'documentation'],
  ['192.88.99.0', 24, '6to4-relay'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'benchmarking'],
  ['198.51.100.0', 24, 'documentation'],
  ['203.0.113.0', 24, 'documentation'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'], // includes 255.255.255.255 (broadcast)
];
const V4_BLOCKED_U32 = V4_BLOCKED.map(([net, bits, reason]) => ({ net: toU32(parseIPv4(net)!), bits, reason }));

function inV4Range(ip: number, net: number, bits: number): boolean {
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ip & mask) >>> 0 === (net & mask) >>> 0;
}

function classifyV4Octets(o: readonly number[]): IpClassification {
  const n = toU32(o);
  for (const r of V4_BLOCKED_U32) if (inV4Range(n, r.net, r.bits)) return { version: 4, public: false, reason: r.reason };
  return { version: 4, public: true };
}

const v4FromGroups = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

function classifyV6Groups(g: readonly number[]): IpClassification {
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  const embedded = (hi: number, lo: number, kind: string): IpClassification => {
    const o = v4FromGroups(hi, lo);
    const inner = classifyV4Octets(o);
    const embeddedV4 = o.join('.');
    return inner.public ? { version: 6, public: true, embeddedV4 } : { version: 6, public: false, reason: `${kind}:${inner.reason}`, embeddedV4 };
  };
  if (zero(0, 8)) return { version: 6, public: false, reason: 'unspecified' };
  if (zero(0, 7) && g[7] === 1) return { version: 6, public: false, reason: 'loopback' };
  // ::ffff:a.b.c.d — IPv4-mapped
  if (zero(0, 5) && g[5] === 0xffff) return embedded(g[6]!, g[7]!, 'ipv4-mapped');
  // ::a.b.c.d — deprecated IPv4-compatible (::/96)
  if (zero(0, 6)) return { version: 6, public: false, reason: 'ipv4-compatible' };
  // ::ffff:0:a.b.c.d — SIIT IPv4-translated
  if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return embedded(g[6]!, g[7]!, 'ipv4-translated');
  // 64:ff9b::/96 — well-known NAT64 prefix
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return embedded(g[6]!, g[7]!, 'nat64');
  // 64:ff9b:1::/48 — local-use NAT64
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return { version: 6, public: false, reason: 'nat64-local' };
  // 2002::/16 — 6to4, IPv4 in groups 1..2
  if (g[0] === 0x2002) return embedded(g[1]!, g[2]!, '6to4');
  // 2001::/32 — Teredo (embedded addresses are obfuscated; refuse outright)
  if (g[0] === 0x2001 && g[1] === 0) return { version: 6, public: false, reason: 'teredo' };
  if (g[0] === 0x2001 && g[1] === 0xdb8) return { version: 6, public: false, reason: 'documentation' };
  if (g[0] === 0x3fff && g[1]! < 0x1000) return { version: 6, public: false, reason: 'documentation' };
  if (g[0] === 0x100 && zero(1, 4)) return { version: 6, public: false, reason: 'discard' };
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00) return { version: 6, public: false, reason: 'unique-local' };
  if ((first & 0xffc0) === 0xfe80) return { version: 6, public: false, reason: 'link-local' };
  if ((first & 0xffc0) === 0xfec0) return { version: 6, public: false, reason: 'site-local' };
  if ((first & 0xff00) === 0xff00) return { version: 6, public: false, reason: 'multicast' };
  // Only 2000::/3 is allocated global unicast.
  if ((first & 0xe000) !== 0x2000) return { version: 6, public: false, reason: 'reserved' };
  return { version: 6, public: true };
}

/** Classify an IP literal; `undefined` when the input is not a canonical IPv4/IPv6 address. */
export function classifyIp(input: string): IpClassification | undefined {
  const v4 = parseIPv4(input);
  if (v4) return classifyV4Octets(v4);
  const v6 = parseIPv6(input);
  if (v6) return classifyV6Groups(v6);
  return undefined;
}

/** True only for globally routable unicast addresses (false for anything unparsable). */
export function isPublicIp(input: string): boolean {
  return classifyIp(input)?.public === true;
}
