import { walkNodes, type FormAction, type FormDefinition, type Node, type PageDocument, type WebsiteDefinition } from '@atrium/schema';
import { CODE_COMPONENT_TYPES } from './change-authz';

export interface ChangeSummary {
  kind: 'added' | 'removed' | 'modified';
  scope: 'page' | 'section' | 'node' | 'theme' | 'settings' | 'navigation' | 'form' | 'header' | 'footer';
  id: string;
  label: string;
  pageId?: string;
  /**
   * Finer-grained area inside `scope` (kept separate so existing scope switches stay exhaustive):
   * scripts, analytics, cookieConsent, seo, customCss, redirects, globalSection, formRules,
   * formSettings, status, layout, pageScripts, embed.
   */
  area?: string;
  /** Field-level description of what changed, e.g. "draft → published" or "to: a@b.co". */
  detail?: string;
  /** Change affects code, tracking, data delivery, routing or publishing — needs explicit confirmation. */
  sensitive?: boolean;
}

function index(nodes: Node[]) {
  const m = new Map<string, Node>();
  walkNodes(nodes, (n) => void m.set(n.id, n));
  return m;
}

const label = (n: Node) => n.name ?? (typeof n.props.heading === 'string' ? `${n.type}: ${n.props.heading}` : typeof n.props.text === 'string' ? `${n.type}: ${String(n.props.text).slice(0, 40)}` : n.type);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Host of an absolute URL, "(relative)" for paths, or the clipped raw value. */
function host(u: string | undefined): string {
  if (!u) return '';
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#\s]*@)?([^/?#\s:]+)/i.exec(u.trim());
  if (m) return m[1]!.toLowerCase();
  if (u.startsWith('/')) return '(relative)';
  return clip(u, 60);
}

function describeAction(a: FormAction): string {
  switch (a.type) {
    case 'email':
      return `email to ${[...a.to, ...(a.cc ?? []), ...(a.bcc ?? [])].join(', ')}`;
    case 'sms':
      return `SMS to ${a.to.join(', ')}`;
    case 'webhook':
      return `webhook ${a.url ? host(a.url) : (a.webhookId ?? '')}`.trim();
    case 'autoresponder':
      return `autoresponder to field "${a.emailField}"`;
    default:
      return a.type;
  }
}

function deliveryOf(f: FormDefinition): string[] {
  return (f.rules ?? []).flatMap((r) => [...r.then, ...(r.otherwise ?? [])].map((a) => `${r.enabled === false ? '(disabled) ' : ''}${describeAction(a)}`));
}

function pageDiff(out: ChangeSummary[], prev: PageDocument, p: PageDocument) {
  const id = p.id;
  if (prev.title !== p.title || prev.slug !== p.slug || !same(prev.seo, p.seo)) {
    const parts = [prev.title !== p.title && `title “${clip(prev.title, 40)}” → “${clip(p.title, 40)}”`, prev.slug !== p.slug && `URL /${prev.slug} → /${p.slug}`, !same(prev.seo, p.seo) && 'SEO'].filter(Boolean);
    out.push({ kind: 'modified', scope: 'page', id, label: p.title, detail: parts.join(', ') });
  }
  if (prev.status !== p.status || prev.publishAt !== p.publishAt) {
    out.push({ kind: 'modified', scope: 'page', id, label: p.title, area: 'status', detail: `${prev.status} → ${p.status}${p.publishAt ? ` at ${p.publishAt}` : ''}`, sensitive: true });
  }
  if (prev.isHomepage !== p.isHomepage) out.push({ kind: 'modified', scope: 'page', id, label: p.title, area: 'status', detail: p.isHomepage ? 'set as homepage' : 'no longer the homepage', sensitive: true });
  if (!same(prev.layout, p.layout)) out.push({ kind: 'modified', scope: 'page', id, label: p.title, area: 'layout', detail: `header ${p.layout?.header ?? 'default'}, footer ${p.layout?.footer ?? 'default'}` });
  if ((prev.customCss ?? '') !== (p.customCss ?? '')) out.push({ kind: p.customCss ? (prev.customCss ? 'modified' : 'added') : 'removed', scope: 'page', id, label: `${p.title}: custom CSS`, area: 'customCss', sensitive: true });
  for (const slot of ['head', 'body'] as const) {
    const a = prev.scripts?.[slot]?.trim() ?? '';
    const b = p.scripts?.[slot]?.trim() ?? '';
    if (a !== b) out.push({ kind: b ? (a ? 'modified' : 'added') : 'removed', scope: 'page', id, label: `${p.title}: ${slot} code`, area: 'pageScripts', detail: b ? clip(b, 80) : undefined, sensitive: true });
  }
}

function nodeEntries(out: ChangeSummary[], before: Node[], after: Node[], pageId: string | undefined, scopeOf: (id: string, inAfter: boolean) => ChangeSummary['scope']) {
  const bi = index(before);
  const ai = index(after);
  for (const [nid, n] of ai) {
    const old = bi.get(nid);
    const code = CODE_COMPONENT_TYPES.has(n.type);
    const extra = (code ? { area: 'embed', sensitive: true, detail: 'embed / custom HTML' } : {}) as Partial<ChangeSummary>;
    if (!old) out.push({ kind: 'added', scope: scopeOf(nid, true), id: nid, label: label(n), pageId, ...extra });
    else if (!same({ ...old, children: undefined }, { ...n, children: undefined })) out.push({ kind: 'modified', scope: scopeOf(nid, true), id: nid, label: label(n), pageId, ...extra });
    if (old && (old.customCss ?? '') !== (n.customCss ?? '')) out.push({ kind: n.customCss ? (old.customCss ? 'modified' : 'added') : 'removed', scope: scopeOf(nid, true), id: nid, label: `${label(n)}: custom CSS`, pageId, area: 'customCss', sensitive: true });
    else if (!old && n.customCss) out.push({ kind: 'added', scope: scopeOf(nid, true), id: nid, label: `${label(n)}: custom CSS`, pageId, area: 'customCss', sensitive: true });
  }
  for (const [nid, n] of bi) if (!ai.has(nid)) out.push({ kind: 'removed', scope: scopeOf(nid, false), id: nid, label: label(n), pageId, ...(CODE_COMPONENT_TYPES.has(n.type) ? { area: 'embed', sensitive: true } : {}) });
}

const embedsOf = (root: Node) => [...index([root]).values()].filter((n) => CODE_COMPONENT_TYPES.has(n.type)).map((n) => ({ type: n.type, variant: n.variant, props: n.props }));

function settingsDiff(out: ChangeSummary[], before: WebsiteDefinition, after: WebsiteDefinition) {
  const { scripts: sa = [], analytics: aa, cookieConsent: ca, seo: seoA, ...restA } = before.settings;
  const { scripts: sb = [], analytics: ab, cookieConsent: cb, seo: seoB, ...restB } = after.settings;
  const scriptsA = new Map(sa.map((s) => [s.id, s]));
  const describe = (s: (typeof sb)[number]) => `${s.placement}, ${s.src ? `src ${host(s.src)}` : 'inline code'}${s.enabled === false ? ', disabled' : ''}`;
  for (const s of sb) {
    const prev = scriptsA.get(s.id);
    if (!prev) out.push({ kind: 'added', scope: 'settings', id: `script:${s.id}`, label: `Script: ${clip(s.name, 60)}`, area: 'scripts', detail: describe(s), sensitive: true });
    else if (!same(prev, s)) out.push({ kind: 'modified', scope: 'settings', id: `script:${s.id}`, label: `Script: ${clip(s.name, 60)}`, area: 'scripts', detail: describe(s), sensitive: true });
  }
  for (const s of sa) if (!sb.some((x) => x.id === s.id)) out.push({ kind: 'removed', scope: 'settings', id: `script:${s.id}`, label: `Script: ${clip(s.name, 60)}`, area: 'scripts', sensitive: true });
  const keys = new Set([...Object.keys(aa ?? {}), ...Object.keys(ab ?? {})]);
  for (const k of keys) {
    const x = (aa as Record<string, unknown> | undefined)?.[k];
    const y = (ab as Record<string, unknown> | undefined)?.[k];
    if (!same(x, y)) out.push({ kind: y === undefined ? 'removed' : x === undefined ? 'added' : 'modified', scope: 'settings', id: `analytics:${k}`, label: `Analytics: ${k}`, area: 'analytics', detail: y === undefined ? undefined : clip(String(y), 80), sensitive: true });
  }
  if (!same(ca, cb)) out.push({ kind: 'modified', scope: 'settings', id: 'cookieConsent', label: 'Cookie consent', area: 'cookieConsent', sensitive: true });
  if (!same(seoA, seoB)) out.push({ kind: 'modified', scope: 'settings', id: 'seo', label: 'Site SEO settings', area: 'seo' });
  if (!same(restA, restB)) out.push({ kind: 'modified', scope: 'settings', id: 'settings', label: 'Site settings' });
}

/** Human-readable summary of differences, used for AI change previews and version compare. */
export function diffWebsites(before: WebsiteDefinition, after: WebsiteDefinition): ChangeSummary[] {
  const out: ChangeSummary[] = [];
  const bPages = new Map(before.pages.map((p) => [p.id, p]));
  const aPages = new Map(after.pages.map((p) => [p.id, p]));
  for (const [id, p] of aPages) {
    const prev = bPages.get(id);
    if (!prev) {
      out.push({ kind: 'added', scope: 'page', id, label: p.title, detail: `/${p.slug}${p.status !== 'draft' ? ` (${p.status})` : ''}`, ...(p.status !== 'draft' ? { sensitive: true } : {}) });
      if (p.customCss) out.push({ kind: 'added', scope: 'page', id, label: `${p.title}: custom CSS`, area: 'customCss', sensitive: true });
      if (p.scripts?.head?.trim() || p.scripts?.body?.trim()) out.push({ kind: 'added', scope: 'page', id, label: `${p.title}: page code`, area: 'pageScripts', sensitive: true });
      walkNodes(p.sections, (n) => {
        if (CODE_COMPONENT_TYPES.has(n.type)) out.push({ kind: 'added', scope: 'node', id: n.id, label: label(n), pageId: id, area: 'embed', detail: 'embed / custom HTML', sensitive: true });
      });
      continue;
    }
    pageDiff(out, prev, p);
    const topIds = new Set(p.sections.map((s) => s.id));
    const prevTop = new Set(prev.sections.map((s) => s.id));
    nodeEntries(out, prev.sections, p.sections, id, (nid, inAfter) => ((inAfter ? topIds : prevTop).has(nid) ? 'section' : 'node'));
  }
  for (const [id, p] of bPages) if (!aPages.has(id)) out.push({ kind: 'removed', scope: 'page', id, label: p.title, detail: `/${p.slug}` });
  if (!same(before.theme, after.theme)) out.push({ kind: 'modified', scope: 'theme', id: 'theme', label: 'Theme & design tokens' });
  if (!same(before.settings, after.settings)) settingsDiff(out, before, after);
  if ((before.customCss ?? '') !== (after.customCss ?? '')) out.push({ kind: after.customCss ? (before.customCss ? 'modified' : 'added') : 'removed', scope: 'settings', id: 'customCss', label: 'Site custom CSS', area: 'customCss', sensitive: true });
  if (!same(before.navigation, after.navigation)) out.push({ kind: 'modified', scope: 'navigation', id: 'navigation', label: 'Navigation' });
  for (const slot of ['header', 'footer'] as const) {
    if (same(before[slot], after[slot])) continue;
    out.push({ kind: 'modified', scope: slot, id: slot, label: slot === 'header' ? 'Header' : 'Footer' });
    if (!same(embedsOf(before[slot]), embedsOf(after[slot]))) out.push({ kind: 'modified', scope: slot, id: `${slot}:embed`, label: `${slot === 'header' ? 'Header' : 'Footer'} embed / custom HTML`, area: 'embed', sensitive: true });
  }

  // global sections (shared across pages)
  const bGlobal = new Map(before.globalSections.map((g) => [g.id, g]));
  for (const g of after.globalSections) {
    const prev = bGlobal.get(g.id);
    if (!prev) out.push({ kind: 'added', scope: 'section', id: `global:${g.id}`, label: `Global section: ${g.name}`, area: 'globalSection', sensitive: true });
    else if (!same(prev, g)) out.push({ kind: 'modified', scope: 'section', id: `global:${g.id}`, label: `Global section: ${g.name}`, area: 'globalSection', sensitive: true });
  }
  for (const g of before.globalSections) if (!after.globalSections.some((x) => x.id === g.id)) out.push({ kind: 'removed', scope: 'section', id: `global:${g.id}`, label: `Global section: ${g.name}`, area: 'globalSection', sensitive: true });

  // redirects (routing; destinations shown)
  const key = (r: WebsiteDefinition['redirects'][number]) => r.id ?? r.source;
  const bRed = new Map(before.redirects.map((r) => [key(r), r]));
  for (const r of after.redirects) {
    const prev = bRed.get(key(r));
    const detail = `${r.statusCode ?? 301} → ${clip(r.destination, 100)}${/^[a-z][a-z0-9+.-]*:/i.test(r.destination) ? ` (${host(r.destination)})` : ''}${r.enabled === false ? ', disabled' : ''}`;
    if (!prev) out.push({ kind: 'added', scope: 'settings', id: `redirect:${key(r)}`, label: `Redirect ${clip(r.source, 60)}`, area: 'redirects', detail, sensitive: true });
    else if (!same(prev, r)) out.push({ kind: 'modified', scope: 'settings', id: `redirect:${key(r)}`, label: `Redirect ${clip(r.source, 60)}`, area: 'redirects', detail, sensitive: true });
  }
  for (const r of before.redirects) if (!after.redirects.some((x) => key(x) === key(r))) out.push({ kind: 'removed', scope: 'settings', id: `redirect:${key(r)}`, label: `Redirect ${clip(r.source, 60)}`, area: 'redirects', sensitive: true });

  // forms (+ where submissions are delivered)
  const bForms = new Map(before.forms.map((f) => [f.id, f]));
  for (const f of after.forms) {
    const prev = bForms.get(f.id);
    const delivery = deliveryOf(f);
    if (!prev) {
      out.push({ kind: 'added', scope: 'form', id: f.id, label: f.name });
      if (delivery.length) out.push({ kind: 'added', scope: 'form', id: `${f.id}:rules`, label: `${f.name}: notifications`, area: 'formRules', detail: delivery.join('; '), sensitive: true });
      continue;
    }
    if (same(prev, f)) continue;
    const { rules: ra, settings: sa, ...restA } = prev;
    const { rules: rb, settings: sb, ...restB } = f;
    if (!same(restA, restB)) out.push({ kind: 'modified', scope: 'form', id: f.id, label: f.name });
    if (!same(ra, rb)) out.push({ kind: 'modified', scope: 'form', id: `${f.id}:rules`, label: `${f.name}: notifications`, area: 'formRules', detail: delivery.length ? delivery.join('; ') : 'no notification rules', sensitive: true });
    if (!same(sa, sb)) {
      const sensitive = (['redirectUrl', 'captcha', 'storeSubmissions', 'honeypot', 'rateLimitPerMinute'] as const).filter((k) => !same(sa?.[k], sb?.[k]));
      out.push({ kind: 'modified', scope: 'form', id: `${f.id}:settings`, label: `${f.name}: settings`, area: 'formSettings', detail: sensitive.length ? `${sensitive.join(', ')}${sb?.redirectUrl && sensitive.includes('redirectUrl') ? ` (redirect to ${host(sb.redirectUrl)})` : ''}` : undefined, ...(sensitive.length ? { sensitive: true } : {}) });
    }
  }
  for (const f of before.forms) if (!after.forms.some((x) => x.id === f.id)) out.push({ kind: 'removed', scope: 'form', id: f.id, label: f.name, sensitive: true });
  return out;
}
