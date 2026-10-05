import { walkNodes, type Node, type PageDocument, type WebsiteDefinition } from '@atrium/schema';

export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface SeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  weight: number;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(textOf).join(' ');
  return '';
}

interface ImageRef {
  nodeId: string;
  src: string;
  alt?: string;
}

/** Collect images (objects with `src` + image-like extension or under image keys). */
export function collectImages(nodes: Node[]): ImageRef[] {
  const out: ImageRef[] = [];
  const visit = (v: unknown, nodeId: string, key?: string) => {
    if (Array.isArray(v)) v.forEach((x) => visit(x, nodeId, key));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.src === 'string' && !(typeof o.mimeType === 'string' && o.mimeType.startsWith('video')) && key !== 'video' && key !== 'backgroundVideo') {
        out.push({ nodeId, src: o.src, alt: typeof o.alt === 'string' ? o.alt : undefined });
      }
      for (const [k, x] of Object.entries(o)) if (k !== 'src') visit(x, nodeId, k);
    }
  };
  walkNodes(nodes, (n) => visit(n.props, n.id));
  return out;
}

export function countHeadings(nodes: Node[]): { h1: number; total: number } {
  let h1 = 0;
  let total = 0;
  walkNodes(nodes, (n) => {
    const lvl = (n.props.level ?? n.props.headingLevel) as string | undefined;
    if (n.type === 'hero' && (n.props.headingLevel ?? 'h1') === 'h1') h1++;
    if (lvl === 'h1' && n.type !== 'hero') h1++;
    if (typeof lvl === 'string' || n.type === 'hero') total++;
  });
  return { h1, total };
}

export interface SeoReport {
  score: number;
  checks: SeoCheck[];
}

export function analyzePageSeo(page: PageDocument, def: WebsiteDefinition): SeoReport {
  const site = def.settings.seo;
  const checks: SeoCheck[] = [];
  const title = page.seo.title ?? page.title;
  const titleLen = title.length;
  checks.push({ id: 'title', label: 'Title configured', weight: 15, status: page.seo.title ? (titleLen >= 15 && titleLen <= 65 ? 'pass' : 'warn') : 'warn', detail: page.seo.title ? (titleLen > 65 ? `Title is ${titleLen} characters; keep under 65` : titleLen < 15 ? 'Title is short' : undefined) : 'Using the page name as title; set a descriptive meta title' });
  const desc = page.seo.description ?? '';
  checks.push({ id: 'description', label: 'Meta description', weight: 15, status: !desc ? 'fail' : desc.length < 70 ? 'warn' : desc.length > 170 ? 'warn' : 'pass', detail: !desc ? 'Missing meta description' : desc.length < 70 ? 'Description too short (aim for 120–160 characters)' : desc.length > 170 ? 'Description too long' : undefined });
  checks.push({ id: 'canonical', label: 'Canonical URL', weight: 5, status: page.seo.canonical || site.canonicalBase ? 'pass' : 'warn', detail: page.seo.canonical || site.canonicalBase ? undefined : 'Set a canonical base URL in site SEO settings' });
  checks.push({ id: 'og-image', label: 'OpenGraph image', weight: 10, status: page.seo.ogImage || site.ogImage ? 'pass' : 'warn' });
  const { h1 } = countHeadings(page.sections);
  checks.push({ id: 'h1', label: 'Single H1 present', weight: 15, status: h1 === 1 ? 'pass' : h1 === 0 ? 'fail' : 'warn', detail: h1 === 0 ? 'No H1 heading on the page' : h1 > 1 ? `${h1} H1 headings found` : undefined });
  const imgs = collectImages(page.sections);
  const missingAlt = imgs.filter((i) => !i.alt?.trim());
  checks.push({ id: 'alt', label: 'Image ALT coverage', weight: 15, status: missingAlt.length === 0 ? 'pass' : missingAlt.length / Math.max(imgs.length, 1) > 0.3 ? 'fail' : 'warn', detail: missingAlt.length ? `${missingAlt.length} of ${imgs.length} images missing ALT text` : undefined });
  const words = textOf(page.sections.map((s) => s.props)).split(/\s+/).filter(Boolean).length;
  checks.push({ id: 'content', label: 'Content depth', weight: 10, status: words >= 250 ? 'pass' : words >= 100 ? 'warn' : 'fail', detail: `${words} words` });
  const hasSd = (page.seo.structuredData?.length ?? 0) > 0 || site.structuredData.length > 0;
  checks.push({ id: 'structured-data', label: 'Structured data', weight: 10, status: hasSd ? 'pass' : 'warn', detail: hasSd ? undefined : 'Missing structured data (e.g. LocalBusiness, Hotel, FAQ)' });
  const robots = page.seo.robots ?? site.robots;
  checks.push({ id: 'indexing', label: 'Indexable', weight: 5, status: robots.index ? 'pass' : 'warn', detail: robots.index ? undefined : 'Page is set to noindex' });

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const got = checks.reduce((a, c) => a + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight * 0.5 : 0), 0);
  return { score: Math.round((got / total) * 100), checks };
}
