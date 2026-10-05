import type { ComponentRegistry } from '@atrium/component-registry';
import { walkNodes, type WebsiteDefinition } from '@atrium/schema';
import { findRedirectLoops, scanBrokenLinks } from './links';
import { analyzePageSeo, collectImages } from './seo';

export interface BuildCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  details: string[];
}

export interface BuildReport {
  ok: boolean;
  checks: BuildCheck[];
  errors: number;
  warnings: number;
}

export interface ValidateContext {
  domains?: Array<{ hostname: string; verified: boolean; isPrimary: boolean }>;
  /** Form ids that have a notification route configured outside the schema (e.g. default recipients). */
  formsWithDefaultRecipients?: string[];
}

/** Pre-publish validation. `fail` checks block publishing; `warn` checks do not. */
export function validateWebsite(def: WebsiteDefinition, registry: ComponentRegistry, ctx: ValidateContext = {}): BuildReport {
  const checks: BuildCheck[] = [];
  const push = (id: string, label: string, details: string[], level: 'warn' | 'fail' = 'fail') =>
    checks.push({ id, label, details, status: details.length ? level : 'pass' });

  // Components
  const componentIssues: string[] = [];
  const formIds = new Set(def.forms.map((f) => f.id));
  const collectionSlugs = new Set(def.collections.map((c) => c.slug));
  const refIssues: string[] = [];
  const trees: Array<[string, typeof def.header[]]> = [['Header', [def.header]], ['Footer', [def.footer]], ...def.pages.map((p) => [p.title, p.sections] as [string, typeof def.header[]])];
  for (const [label, nodes] of trees) {
    for (const issue of registry.validate(nodes)) componentIssues.push(`${label}: ${issue.type} — ${issue.message}`);
    walkNodes(nodes, (n) => {
      const formId = n.props.formId as string | undefined;
      if (formId && !formIds.has(formId)) refIssues.push(`${label}: ${n.type} references a missing form`);
      if (n.binding && !collectionSlugs.has(n.binding.collection)) refIssues.push(`${label}: ${n.type} is bound to missing collection "${n.binding.collection}"`);
      if (n.type === 'global-section' && n.ref && !def.globalSections.some((g) => g.id === n.ref)) refIssues.push(`${label}: missing global section`);
    });
  }
  push('components', 'No missing components', componentIssues);
  push('references', 'Forms, collections and global sections resolve', refIssues);

  // Navigation & links
  const broken = scanBrokenLinks(def);
  const navBroken = broken.filter((b) => b.pageId.startsWith('menu:'));
  const pageBroken = broken.filter((b) => !b.pageId.startsWith('menu:'));
  const pageTitle = (id: string) => def.pages.find((p) => p.id === id)?.title ?? id;
  push('navigation', 'Navigation valid', navBroken.map((b) => `${b.pageId.slice(5)} menu: ${b.reason}`));
  push('links', 'Internal links valid', pageBroken.map((b) => `${pageTitle(b.pageId)}: ${b.reason}`), 'warn');

  // Homepage & slugs
  const homes = def.pages.filter((p) => p.isHomepage);
  push('homepage', 'Homepage configured', homes.length === 1 ? [] : [homes.length ? 'More than one homepage' : 'No homepage set']);

  // Forms
  const formIssues: string[] = [];
  for (const f of def.forms) {
    if (!f.fields.some((x) => !['heading', 'paragraph', 'hidden'].includes(x.type))) formIssues.push(`${f.name} has no input fields`);
    const notifies = f.rules.some((r) => r.enabled && [...r.then, ...r.otherwise].some((a) => a.type === 'email' || a.type === 'sms' || a.type === 'webhook'));
    if (!notifies && !ctx.formsWithDefaultRecipients?.includes(f.id)) formIssues.push(`${f.name} has no notification recipient`);
    for (const fl of f.fields) {
      if (fl.validation?.pattern) {
        try {
          new RegExp(fl.validation.pattern);
        } catch {
          formIssues.push(`${f.name}: field "${fl.label}" has an invalid pattern`);
        }
      }
    }
  }
  push('forms', 'Forms valid', formIssues, 'warn');

  // SEO
  const seoIssues: string[] = [];
  if (!def.settings.seo.siteTitle) seoIssues.push('Site title is missing');
  for (const p of def.pages.filter((x) => x.status !== 'archived')) {
    const r = analyzePageSeo(p, def);
    for (const c of r.checks) if (c.status === 'fail' && ['description', 'h1'].includes(c.id)) seoIssues.push(`${p.title}: ${c.detail ?? c.label}`);
  }
  push('seo', 'Required SEO configured', seoIssues, 'warn');

  // Media
  const missingAlt = def.pages.flatMap((p) => collectImages(p.sections)).filter((i) => !i.alt?.trim()).length;
  const badSrc = def.pages.flatMap((p) => collectImages(p.sections)).filter((i) => !/^(https?:\/\/|\/|data:image\/)/.test(i.src)).length;
  push('media', 'Media references valid', badSrc ? [`${badSrc} images have invalid sources`] : []);
  push('alt', 'Images have ALT text', missingAlt ? [`${missingAlt} images missing ALT text`] : [], 'warn');

  // Redirects
  push('redirects', 'No redirect loops', findRedirectLoops(def.redirects).map((l) => l.join(' → ')));

  // Domains
  if (ctx.domains) {
    const unverified = ctx.domains.filter((d) => !d.verified).map((d) => `${d.hostname} is not verified`);
    push('domains', 'Domain configuration valid', unverified, 'warn');
  }

  const errors = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return { ok: errors === 0, checks, errors, warnings };
}
