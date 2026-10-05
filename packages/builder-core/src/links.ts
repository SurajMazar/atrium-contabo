import { pagePath, walkNodes, type LinkValue, type Node, type WebsiteDefinition } from '@atrium/schema';

export interface FoundLink {
  pageId: string;
  nodeId?: string;
  path: string;
  link: LinkValue;
}

const LINK_KEYS = new Set(['link', 'href', 'url']);

function looksLikeLink(v: unknown): v is LinkValue {
  if (typeof v === 'string') return /^(\/|#|https?:|mailto:|tel:)/.test(v);
  return !!v && typeof v === 'object' && 'type' in (v as object) && ['page', 'url', 'anchor', 'email', 'tel', 'whatsapp', 'collection-item'].includes((v as { type: string }).type);
}

function collectFromValue(value: unknown, path: string, out: Array<{ path: string; link: LinkValue }>, keyHint?: string) {
  if (keyHint && LINK_KEYS.has(keyHint) && looksLikeLink(value)) {
    out.push({ path, link: value });
    return;
  }
  if (Array.isArray(value)) value.forEach((v, i) => collectFromValue(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) collectFromValue(v, path ? `${path}.${k}` : k, out, k);
}

export function collectLinks(def: WebsiteDefinition): FoundLink[] {
  const out: FoundLink[] = [];
  const scan = (pageId: string, nodes: Node[]) =>
    walkNodes(nodes, (n) => {
      const found: Array<{ path: string; link: LinkValue }> = [];
      collectFromValue(n.props, '', found);
      found.forEach((f) => out.push({ pageId, nodeId: n.id, path: f.path, link: f.link }));
    });
  def.pages.forEach((p) => scan(p.id, p.sections));
  scan('header', [def.header]);
  scan('footer', [def.footer]);
  const navScan = (items: WebsiteDefinition['navigation']['menus'][string], menu: string) =>
    items.forEach((it, i) => {
      if (it.link) out.push({ pageId: `menu:${menu}`, path: `${menu}[${i}]`, link: it.link });
      if (it.children) navScan(it.children, menu);
    });
  Object.entries(def.navigation.menus).forEach(([m, items]) => navScan(items, m));
  return out;
}

export interface BrokenLink extends FoundLink {
  reason: string;
}

/** Find internal links to missing pages and anchors that don't exist on the target page. */
export function scanBrokenLinks(def: WebsiteDefinition): BrokenLink[] {
  const byId = new Map(def.pages.map((p) => [p.id, p]));
  const paths = new Map(def.pages.map((p) => [pagePath(p.slug), p]));
  const collectionPrefixes = def.collections.map((c) => c.routePrefix ?? c.slug).map((p) => `/${p.replace(/^\//, '')}/`);
  const redirects = new Set(def.redirects.filter((r) => r.enabled).map((r) => r.source));
  const anchorsOf = (pageId: string) => {
    const page = byId.get(pageId);
    const set = new Set<string>();
    if (page) walkNodes(page.sections, (n) => void (n.anchor && set.add(n.anchor)));
    return set;
  };
  const broken: BrokenLink[] = [];
  for (const l of collectLinks(def)) {
    const link = l.link;
    if (typeof link === 'string') {
      if (link.startsWith('#')) {
        const anchor = link.slice(1);
        if (!anchor) continue;
        const pageId = l.pageId.startsWith('menu:') || l.pageId === 'header' || l.pageId === 'footer' ? def.pages.find((p) => p.isHomepage)?.id : l.pageId;
        if (pageId && !anchorsOf(pageId).has(anchor)) broken.push({ ...l, reason: `Anchor #${anchor} not found on page` });
      } else if (link.startsWith('/')) {
        const [path, anchor] = link.split('#') as [string, string | undefined];
        const clean = path.length > 1 ? path.replace(/\/$/, '') : path;
        const target = paths.get(clean);
        if (!target) {
          if (redirects.has(clean) || collectionPrefixes.some((pre) => clean.startsWith(pre)) || clean.startsWith('/api/')) continue;
          broken.push({ ...l, reason: `No page at ${clean}` });
        } else if (anchor && !anchorsOf(target.id).has(anchor)) broken.push({ ...l, reason: `Anchor #${anchor} not found on ${clean}` });
      }
    } else if (link.type === 'page') {
      if (!byId.has(link.pageId)) broken.push({ ...l, reason: 'Linked page was deleted' });
      else if (link.anchor && !anchorsOf(link.pageId).has(link.anchor)) broken.push({ ...l, reason: `Anchor #${link.anchor} not found` });
    } else if (link.type === 'anchor') {
      const pageId = l.pageId.startsWith('menu:') ? def.pages.find((p) => p.isHomepage)?.id : l.pageId;
      if (pageId && byId.has(pageId) && !anchorsOf(pageId).has(link.anchor)) broken.push({ ...l, reason: `Anchor #${link.anchor} not found` });
    }
  }
  return broken;
}

/** Detect redirect loops (A → B → A). */
export function findRedirectLoops(redirects: WebsiteDefinition['redirects']): string[][] {
  const map = new Map(redirects.filter((r) => r.enabled).map((r) => [r.source, r.destination]));
  const loops: string[][] = [];
  for (const start of map.keys()) {
    const seen = [start];
    let cur = map.get(start);
    while (cur && cur.startsWith('/')) {
      if (cur === start) {
        loops.push([...seen, cur]);
        break;
      }
      if (seen.includes(cur)) break;
      seen.push(cur);
      cur = map.get(cur);
    }
  }
  return loops;
}
