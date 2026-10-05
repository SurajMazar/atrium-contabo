import { CODE_COMPONENT_TYPES, missingRequirements, siteChangeRequirements, type SiteOperation } from '@atrium/builder-core';
import { walkNodes, type FormDefinition, type Node, type WebsiteDefinition } from '@atrium/schema';

/**
 * AI least privilege.
 *
 * Model output is untrusted (prompt injection via site content, jailbreaks, plain
 * mistakes). Independently of who asked, the AI may never perform changes in the
 * restricted classes below; additionally a proposal never contains a change the
 * *caller* could not apply by hand. Enforced per operation while the agent works
 * (rejections are reported back to the model and surfaced as warnings) and again
 * on the whole proposal / at apply time.
 */
export type AiEditMode = 'edit' | 'page' | 'section';

export interface AiPolicy {
  mode: AiEditMode;
  /** Section mode: the only page that may change. */
  targetPageId?: string;
  /** Caller permissions (`*` = all). Omit to skip caller filtering (e.g. tests, trusted jobs). */
  granted?: ReadonlySet<string>;
}

/** Permissions the AI never exercises, whatever the caller holds. */
export const AI_DENIED_PERMISSIONS = new Set(['code.manage', 'redirect.manage', 'form.delete', 'page.delete', 'page.publish']);

/** Operations the AI may never emit. */
export const AI_DENIED_OPS = new Set(['setRedirects', 'setCustomCss', 'deletePage', 'deleteForm']);

const NODE_OPS = ['addNode', 'updateNode', 'setProp', 'setStyle', 'replaceNode', 'moveNode', 'removeNode', 'duplicateNode'];

/** Tools offered to the model per mode (mirrors the per-mode checks below). */
export const AI_MODE_OPS: Record<AiEditMode, readonly string[]> = {
  edit: [...NODE_OPS, 'createPage', 'updatePage', 'duplicatePage', 'updateTheme', 'updateSettings', 'setMenu', 'createForm', 'updateForm'],
  page: [...NODE_OPS, 'createPage', 'updatePage', 'setMenu'],
  section: ['addNode', 'updateNode', 'setProp', 'setStyle', 'moveNode', 'duplicateNode'],
};

/** Settings keys the AI may not touch (scripts, tracking, consent). */
export const AI_DENIED_SETTINGS = ['scripts', 'analytics', 'cookieConsent', 'integrations'] as const;
/** Form settings that change where data goes or how submissions are protected. */
const SENSITIVE_FORM_SETTINGS = ['redirectUrl', 'captcha', 'storeSubmissions', 'honeypot', 'rateLimitPerMinute'] as const;

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))) : val));
}
const same = (a: unknown, b: unknown) => a === b || stable(a) === stable(b);

function inputHasCode(n: unknown, depth = 0): boolean {
  if (!n || typeof n !== 'object' || depth > 40) return false;
  const node = n as { type?: unknown; children?: unknown; customCss?: unknown };
  if (typeof node.type === 'string' && CODE_COMPONENT_TYPES.has(node.type)) return true;
  return Array.isArray(node.children) && node.children.some((c) => inputHasCode(c, depth + 1));
}
function inputHasCss(n: unknown, depth = 0): boolean {
  if (!n || typeof n !== 'object' || depth > 40) return false;
  const node = n as { customCss?: unknown; children?: unknown };
  if (typeof node.customCss === 'string' && node.customCss.trim()) return true;
  return Array.isArray(node.children) && node.children.some((c) => inputHasCss(c, depth + 1));
}

/**
 * Cheap pre-apply check on the operation itself. Returns the rejection reason or undefined.
 * `createdPageIds`: pages created earlier in this proposal (page mode may edit only those).
 */
export function aiOperationViolation(raw: SiteOperation, policy: AiPolicy, createdPageIds: ReadonlySet<string> = new Set()): string | undefined {
  const op = raw as SiteOperation & Record<string, unknown>;
  const name = typeof op?.op === 'string' ? op.op : '';
  if (AI_DENIED_OPS.has(name)) return `"${name}" is restricted and cannot be performed by AI — make this change manually`;
  if (!AI_MODE_OPS[policy.mode].includes(name)) return `"${name || 'unknown'}" is not available for this task (${policy.mode} mode)`;
  const pageId = typeof op.pageId === 'string' ? op.pageId : undefined;
  if (pageId?.startsWith('global:')) return 'global sections cannot be edited by AI';
  if (NODE_OPS.includes(name)) {
    if (policy.mode === 'section' && pageId !== policy.targetPageId) return 'this task may only change the selected page';
    if (policy.mode === 'page' && !(pageId && createdPageIds.has(pageId))) return 'this task may only edit the page it creates';
  }
  if (name === 'updatePage' && policy.mode === 'page' && !(pageId && createdPageIds.has(pageId))) return 'this task may only edit the page it creates';
  if ((name === 'addNode' || name === 'replaceNode') && inputHasCode(op.node)) return 'embed / custom HTML blocks cannot be added by AI';
  if ((name === 'addNode' || name === 'replaceNode') && inputHasCss(op.node)) return 'custom CSS cannot be set by AI';
  if (name === 'updateNode' && op.customCss !== undefined) return 'custom CSS cannot be set by AI';
  if (name === 'createPage') {
    const page = (op.page ?? {}) as { sections?: unknown[]; customCss?: unknown; scripts?: unknown; status?: unknown; publishAt?: unknown };
    if ((page.sections ?? []).some((s) => inputHasCode(s))) return 'embed / custom HTML blocks cannot be added by AI';
    if ((page.sections ?? []).some((s) => inputHasCss(s)) || page.customCss) return 'custom CSS cannot be set by AI';
    if (page.scripts) return 'page scripts cannot be set by AI';
    if ((page.status !== undefined && page.status !== 'draft') || page.publishAt) return 'AI-created pages must stay drafts';
  }
  if (name === 'updatePage') {
    const patch = (op.patch ?? {}) as Record<string, unknown>;
    if (patch.customCss !== undefined) return 'custom CSS cannot be set by AI';
    if (patch.status !== undefined || patch.publishAt !== undefined) return 'publishing state cannot be changed by AI';
  }
  if (name === 'updateSettings') {
    const patch = (op.patch ?? {}) as Record<string, unknown>;
    const bad = AI_DENIED_SETTINGS.filter((k) => k in patch);
    if (bad.length) return `site ${bad.join(', ')} settings (scripts / tracking / consent) cannot be changed by AI`;
  }
  if (name === 'createForm') {
    const form = (op.form ?? {}) as { rules?: unknown[]; settings?: Record<string, unknown> };
    if (form.rules?.length) return 'AI may create forms but not their notification rules, recipients, webhooks or autoresponders — set those up manually';
    if (form.settings && SENSITIVE_FORM_SETTINGS.some((k) => form.settings![k] !== undefined && k !== 'honeypot')) return 'form delivery and protection settings cannot be set by AI';
  }
  if (name === 'updateForm') {
    const patch = (op.patch ?? {}) as { rules?: unknown; settings?: Record<string, unknown> };
    if (patch.rules !== undefined) return 'form rules (notifications, recipients, webhooks, SMS, autoresponders) cannot be changed by AI';
    if (patch.settings && SENSITIVE_FORM_SETTINGS.some((k) => k in patch.settings!)) return 'form delivery and protection settings cannot be changed by AI';
  }
  return undefined;
}

function nodeCss(def: WebsiteDefinition): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (roots: Node[], scope: string) => walkNodes(roots, (n) => void (n.customCss ? out.set(`${scope}:${n.id}`, n.customCss) : undefined));
  visit([def.header, def.footer], 'site');
  def.globalSections.forEach((g) => visit([g.node], `g:${g.id}`));
  def.pages.forEach((p) => visit(p.sections, p.id));
  return out;
}

function codeNodes(def: WebsiteDefinition): string[] {
  const out: string[] = [];
  const visit = (roots: Node[]) => walkNodes(roots, (n) => void (CODE_COMPONENT_TYPES.has(n.type) ? out.push(stable({ t: n.type, v: n.variant, p: n.props })) : undefined));
  visit([def.header, def.footer]);
  def.globalSections.forEach((g) => visit([g.node]));
  def.pages.forEach((p) => visit(p.sections));
  return out.sort();
}

function formDelivery(f: FormDefinition) {
  const s = (f.settings ?? {}) as Record<string, unknown>;
  return { rules: f.rules ?? [], ...Object.fromEntries(SENSITIVE_FORM_SETTINGS.map((k) => [k, s[k]])) };
}

/** Everything about a page except its section tree. */
const pageShell = (p: WebsiteDefinition['pages'][number]) => ({ ...p, sections: undefined });

/**
 * Diff-based check of `before → after` (one operation or a whole proposal).
 * Returns human-readable reasons; empty = allowed.
 */
export function aiChangeViolations(before: WebsiteDefinition, after: WebsiteDefinition, policy: AiPolicy): string[] {
  if (before === after) return [];
  const out = new Set<string>();
  const reqs = siteChangeRequirements(before, after);
  for (const r of reqs) {
    if (r.anyOf.some((p) => AI_DENIED_PERMISSIONS.has(p))) out.add(`AI may not ${r.reason}`);
    if (r.reason === 'change global sections') out.add('AI may not change global sections');
  }
  if (policy.granted) for (const r of missingRequirements(reqs, policy.granted)) out.add(`you do not have permission to ${r.reason}`);

  // settings that carry code / tracking / consent
  for (const k of AI_DENIED_SETTINGS) {
    if (!same((before.settings as Record<string, unknown>)[k], (after.settings as Record<string, unknown>)[k])) out.add(`AI may not change site ${k} settings`);
  }
  if ((before.customCss ?? '') !== (after.customCss ?? '')) out.add('AI may not change custom CSS');
  if (!same(codeNodes(before), codeNodes(after))) out.add('AI may not add, change or remove embed / custom HTML blocks');
  if (!same([...nodeCss(before)].sort(), [...nodeCss(after)].sort())) out.add('AI may not change custom CSS');

  // pages: custom code/CSS and publishing state
  const pagesB = new Map(before.pages.map((p) => [p.id, p]));
  for (const p of after.pages) {
    const prev = pagesB.get(p.id);
    if ((prev?.customCss ?? '') !== (p.customCss ?? '')) out.add('AI may not change page custom CSS');
    if (!same(prev?.scripts ?? {}, p.scripts ?? {})) out.add('AI may not change page scripts');
    if (prev ? prev.status !== p.status || prev.publishAt !== p.publishAt : p.status !== 'draft' || !!p.publishAt) out.add('AI may not publish, schedule or archive pages');
  }

  // forms: delivery (rules/recipients/webhooks/SMS/autoresponders) and protection
  const formsB = new Map(before.forms.map((f) => [f.id, f]));
  for (const f of after.forms) {
    const prev = formsB.get(f.id);
    if (prev ? !same(formDelivery(prev), formDelivery(f)) : (f.rules ?? []).length > 0 || !!(f.settings as { redirectUrl?: string } | undefined)?.redirectUrl) out.add('AI may not change form notifications, recipients, webhooks, SMS, autoresponders or delivery settings');
  }

  // mode scoping
  if (policy.mode === 'section') {
    const strip = (d: WebsiteDefinition) => ({ ...d, pages: d.pages.map((p) => (p.id === policy.targetPageId ? pageShell(p) : p)) });
    if (!same(strip(before), strip(after))) out.add('this task may only add or update sections on the selected page');
  } else if (policy.mode === 'page') {
    const keep = (d: WebsiteDefinition) => ({ ...d, navigation: undefined, pages: d.pages.filter((p) => pagesB.has(p.id)) });
    if (!same(keep(before), keep(after))) out.add('this task may only create a page and add it to the navigation');
  }
  return [...out];
}
