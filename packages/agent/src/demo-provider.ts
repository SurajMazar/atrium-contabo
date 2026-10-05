import type { SiteOperation } from '@atrium/builder-core';
import { THEME_PRESETS } from '@atrium/design-tokens';
import type { AIProvider, AiChatRequest, AiContentPart, StructuredRequest } from '@atrium/providers';
import type { NodeInput, WebsiteInput } from '@atrium/schema';
import { BLUEPRINTS } from '@atrium/templates';

/**
 * Offline demo provider. It never calls a model: it answers the agent's
 * structured requests from Atrium's own blueprints and handles common edit
 * requests with deterministic operations. Everything still flows through the
 * real pipeline (validation, repair, normalization, persistence), which makes
 * it useful for local development, demos and tutorials without an API key.
 * Enable with AI_DEMO=1 (or connect the `demo` driver).
 */
const PLAN_FIELD_TYPES = new Set(['text', 'email', 'phone', 'number', 'textarea', 'select', 'radio', 'checkbox', 'date', 'consent']);
const COLLECTION_FIELD_TYPES = new Set(['text', 'textarea', 'richtext', 'number', 'boolean', 'date', 'image', 'gallery', 'select', 'url']);
const STRUCTURED_DATA = new Set(['Organization', 'LocalBusiness', 'Hotel', 'Resort', 'Restaurant', 'EventVenue', 'Event', 'FAQPage', 'Service', 'Product', 'Article']);

function pickBlueprint(text: string) {
  const typeLine = /Type:\s*(.+)/i.exec(text)?.[1] ?? '';
  const t = `${typeLine} ${typeLine} ${text}`.toLowerCase();
  const by = (key: string) => BLUEPRINTS.find((b) => b.key === key)!;
  if (/hotel|resort|lodge/.test(typeLine.toLowerCase())) return by('hospitality-resort');
  if (/wedding|venue|banquet|event space/.test(t)) return by('wedding-venue');
  if (/restaurant|bistro|cafe|café|dining|kitchen/.test(t) && !/resort|hotel/.test(t)) return by('restaurant');
  if (/resort|hotel|lodge|retreat|villa|stay|rooms/.test(t)) return by('hospitality-resort');
  if (/agency|studio|creative|design/.test(t)) return by('creative-agency');
  if (/saas|software|app|platform|startup/.test(t)) return by('saas');
  if (/portfolio|photograph|artist/.test(t)) return by('portfolio');
  if (/real estate|property|properties|homes/.test(t)) return by('real-estate');
  return by('corporate');
}

const line = (text: string, label: string) => new RegExp(`${label}:\\s*(.+)`, 'i').exec(text)?.[1]?.trim();

function presetKeyFor(theme: { name?: string } | undefined): string {
  const hit = Object.entries(THEME_PRESETS).find(([, t]) => t.name === theme?.name);
  return hit?.[0] ?? 'editorial-warm';
}

function cleanSections(nodes: NodeInput[], formSlugs: Map<string, string>): NodeInput[] {
  return nodes
    .filter((n) => n.type !== 'global-section')
    .map((n) => {
      const props = { ...(n.props ?? {}) };
      if (typeof props.formId === 'string') {
        props.formSlug = formSlugs.get(props.formId) ?? props.formId;
        delete props.formId;
      }
      return { ...n, id: undefined, props, children: n.children ? cleanSections(n.children, formSlugs) : undefined };
    });
}

function textOf(req: AiChatRequest): string {
  return req.messages
    .filter((m) => m.role === 'user')
    .flatMap((m) => m.content)
    .filter((c): c is Extract<AiContentPart, { type: 'text' }> => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

export function createDemoProvider(): AIProvider {
  let site: WebsiteInput | null = null;
  const usage = { inputTokens: 0, outputTokens: 0 };

  const ensureSite = (prompt: string) => {
    if (!site) {
      const bp = pickBlueprint(prompt);
      site = bp.build({
        businessName: line(prompt, 'Business name') ?? 'New Business',
        description: line(prompt, 'Description'),
        location: line(prompt, 'Location'),
        email: /email\s+(\S+@\S+)/i.exec(prompt)?.[1],
        phone: /phone\s+([+\d][\d\s-]{5,})/i.exec(prompt)?.[1]?.trim(),
      });
    }
    return site;
  };

  const structured = (name: string, prompt: string): unknown => {
    if (name === 'site_plan') {
      const s = ensureSite(prompt);
      const formSlug = new Map(s.forms?.map((f) => [f.id ?? f.slug, f.slug]) ?? []);
      void formSlug;
      const settings = s.settings as { name: string; business: { tagline?: string; description?: string } };
      const pages = (s.pages ?? []).filter((p) => (p.kind ?? 'page') === 'page').slice(0, 9);
      return {
        siteName: settings.name,
        tagline: settings.business.tagline ?? settings.name,
        description: settings.business.description ?? `${settings.name}.`,
        voice: 'warm, specific, unhurried',
        locale: 'en',
        themePreset: presetKeyFor(s.theme as { name?: string }),
        palette: {},
        fonts: {},
        motion: (s.theme as { motion?: { intensity?: string } }).motion?.intensity ?? 'subtle',
        headerVariant: (s.header as NodeInput | undefined)?.variant ?? 'classic',
        footerVariant: (s.footer as NodeInput | undefined)?.variant ?? 'columns',
        primaryCta: { label: 'Enquire', slug: pages.find((p) => /contact|enquire/.test(p.slug))?.slug ?? 'contact' },
        pages: pages.map((p) => {
          const sections = ((p.sections ?? []) as NodeInput[]).filter((x) => x.type !== 'global-section').slice(0, 12).map((x) => ({ type: x.type, variant: x.variant, purpose: String((x.props as Record<string, unknown> | undefined)?.heading ?? x.type) }));
          while (sections.length < 2) sections.push({ type: 'section', variant: undefined, purpose: 'supporting content' });
          return { title: p.title, slug: p.isHomepage ? '' : p.slug, purpose: p.seo?.description ?? p.title, sections };
        }),
        navigation: ((s.navigation?.menus?.primary ?? []) as Array<{ label: string; link?: unknown }>).slice(0, 8).map((n) => ({ label: n.label, slug: typeof n.link === 'string' ? n.link.replace(/^\//, '') : '' })),
        forms: (s.forms ?? []).slice(0, 4).map((f) => ({
          name: f.name, slug: f.slug, purpose: f.name, submitLabel: f.settings?.submitLabel ?? 'Send', successMessage: f.settings?.successMessage ?? 'Thank you — we will be in touch shortly.',
          fields: (f.fields as Array<{ type: string; name: string; label: string; required?: boolean; options?: Array<{ label: string }>; width?: string }>).filter((x) => PLAN_FIELD_TYPES.has(x.type)).slice(0, 14).map((x) => ({ name: x.name, label: x.label, type: x.type, required: !!x.required, options: x.options?.map((o) => o.label), width: x.width === 'half' ? 'half' : 'full' })),
        })),
        collections: (s.collections ?? []).slice(0, 3).map((c) => ({
          slug: c.slug, name: c.name, singularName: c.singularName ?? c.name,
          fields: c.fields.filter((f) => COLLECTION_FIELD_TYPES.has(f.type)).slice(0, 12).map((f) => ({ key: f.key, label: f.label, type: f.type })),
          itemCount: Math.min(12, c.items?.length ?? 0),
        })),
        structuredData: ((s.settings as { seo?: { structuredData?: Array<{ type: string }> } }).seo?.structuredData ?? []).map((x) => x.type).filter((t) => STRUCTURED_DATA.has(t)).slice(0, 4),
      };
    }
    if (name === 'page_content') {
      const s = ensureSite(prompt);
      const m = /Write the "(.+?)" page \(\/(.*?)\)/.exec(prompt);
      const page = (s.pages ?? []).find((p) => (m?.[2] === '' ? p.isHomepage : p.slug === m?.[2])) ?? s.pages![0]!;
      const formSlugs = new Map((s.forms ?? []).map((f) => [f.id ?? f.slug, f.slug]));
      const sections = cleanSections((page.sections ?? []) as NodeInput[], formSlugs);
      return { seo: { title: page.seo?.title ?? page.title, description: page.seo?.description ?? `${page.title}.` }, sections: sections.length ? sections : [{ type: 'section', props: {} }] };
    }
    if (name === 'collection_items') {
      const s = ensureSite(prompt);
      const m = /items for the "(.+?)" collection/.exec(prompt);
      const c = (s.collections ?? []).find((x) => x.name === m?.[1]) ?? s.collections?.[0];
      return { items: (c?.items ?? []).slice(0, 12).map((i) => ({ slug: i.slug, data: i.data })) };
    }
    if (name === 'seo_recommendations') {
      return {
        recommendations: [
          { field: 'title', current: line(prompt, 'Current meta title') ?? null, suggested: `${line(prompt, 'Page')?.split(' (')[0] ?? 'Home'} — ${line(prompt, 'Site')?.split(' — ')[0] ?? ''}`.slice(0, 60), reason: 'Lead with the page topic and keep the brand at the end, under 60 characters.' },
          { field: 'description', current: line(prompt, 'Current description') ?? null, suggested: 'Plan your stay with mountain views, a quiet spa and seasonal dining. Book direct for the best rates and flexible dates.', reason: 'A 120–160 character description with a clear benefit and call to action improves click-through.' },
          { field: 'structuredData', current: null, suggested: 'Add LocalBusiness (or Hotel) and FAQPage structured data', reason: 'Rich results need structured data that matches visible content.' },
        ],
      };
    }
    throw new Error(`Demo provider cannot answer "${name}"`);
  };

  const editOps = (req: AiChatRequest): { ops: SiteOperation[]; summary: string } => {
    const text = textOf(req);
    const request = (/Request:\s*([\s\S]+)$/.exec(text)?.[1] ?? text).toLowerCase();
    const pageId = /\(id (pg_[a-z0-9]+)/.exec(text)?.[1];
    const selected = /selected this node:\n(\{.*\})/.exec(text)?.[1];
    const sel = selected ? (JSON.parse(selected) as { id: string; type: string; props?: Record<string, unknown> }) : undefined;
    const ops: SiteOperation[] = [];
    const notes: string[] = [];
    if (/dark/.test(request)) {
      const dark = THEME_PRESETS['midnight-luxe']!;
      ops.push({ op: 'updateTheme', patch: { colorScheme: 'dark', colors: dark.colors as unknown as Record<string, unknown> } });
      notes.push('switched to a darker palette');
    }
    if (/square|sharp corner/.test(request)) {
      ops.push({ op: 'updateTheme', patch: { radius: { sm: '0', md: '0', lg: '0', xl: '0' }, buttons: { radius: '0' } } });
      notes.push('squared off buttons and corners');
    }
    if (/subtle|calmer|less (motion|animation)/.test(request)) {
      ops.push({ op: 'updateTheme', patch: { motion: { intensity: 'subtle' } } });
      notes.push('made animations more subtle');
    }
    if (/luxur|elegant|premium/.test(request) && sel && pageId) {
      const heading = String(sel.props?.heading ?? sel.props?.text ?? 'A quieter kind of luxury').replace(/\*/g, '');
      const words = heading.split(' ');
      const emphasized = words.length > 2 ? `${words.slice(0, -1).join(' ')} *${words.at(-1)}*` : `*${heading}*`;
      ops.push({ op: 'updateNode', pageId, nodeId: sel.id, props: sel.type === 'hero' ? { heading: emphasized, eyebrow: 'Private · Lakeside · Since 1998' } : { [sel.props?.heading !== undefined ? 'heading' : 'text']: emphasized }, ...(sel.type === 'hero' ? { variant: 'cinematic', animation: { preset: 'cinematic-reveal' } } : {}) });
      notes.push('gave the selected section a more editorial, luxurious treatment');
    }
    const addable: Array<[RegExp, string]> = [[/testimonial|review/, 'testimonials'], [/faq|question/, 'faq'], [/gallery|photo/, 'gallery'], [/pricing|package/, 'pricing'], [/stat|number/, 'stats'], [/(cta|call to action)/, 'cta']];
    for (const [re, type] of addable) {
      if (re.test(request) && /add|create|insert|include/.test(request) && pageId) {
        ops.push({ op: 'addNode', pageId, parentId: null, node: { type, props: {}, animation: { preset: 'fade-up' } } });
        notes.push(`added a ${type} section`);
      }
    }
    if (/(create|add|make).*(page)/.test(request) && !ops.length) {
      const title = /(?:create|add|make)(?: an?)? ([a-z ]+?) page/.exec(request)?.[1]?.trim().replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'About';
      ops.push({ op: 'createPage', page: { title, slug: title.toLowerCase().replace(/\s+/g, '-'), seo: { title, description: `${title} — learn more about us, our story and what makes us different.` }, sections: [{ type: 'hero', variant: 'editorial', props: { heading: title, subheading: 'The people, places and principles behind everything we do.' } }, { type: 'text-section', props: {} }, { type: 'cta', props: {} }] } });
      notes.push(`created a ${title} page`);
    }
    if (!ops.length && sel && pageId) {
      ops.push({ op: 'updateNode', pageId, nodeId: sel.id, animation: { preset: 'fade-up' } });
      notes.push('added a gentle fade-up entrance to the selected section');
    }
    const summary = notes.length ? `${notes.join(', ').replace(/^./, (c) => c.toUpperCase())}.` : 'No changes were needed.';
    return { ops, summary };
  };

  return {
    driver: 'demo',
    models: [{ id: 'atrium-demo', label: 'Atrium demo (offline)', inputPrice: 0, outputPrice: 0, default: true }],
    async chat(req) {
      const toolResults = req.messages.filter((m) => m.role === 'user').flatMap((m) => m.content).filter((c) => c.type === 'tool_result').length;
      await new Promise((r) => setTimeout(r, 900));
      if (toolResults === 0) {
        const { ops } = editOps(req);
        return { content: [{ type: 'text', text: 'Reviewing the page and applying the change.' }, { type: 'tool_call', id: 'demo-1', name: 'apply_operations', input: { operations: ops } }], stopReason: 'tool_use', usage, model: 'atrium-demo', provider: 'demo' };
      }
      return { content: [{ type: 'tool_call', id: 'demo-2', name: 'finish', input: { summary: editOps(req).summary } }], stopReason: 'tool_use', usage, model: 'atrium-demo', provider: 'demo' };
    },
    async *stream() {},
    async generateText(req) {
      const src = /Text:\n([\s\S]+)$/.exec(req.prompt)?.[1]?.trim() ?? req.prompt;
      const instr = req.prompt.toLowerCase();
      let text = src;
      if (instr.includes('half as long')) text = src.split(/(?<=[.!?])\s+/)[0] ?? src;
      else if (instr.includes('luxurious')) text = src.replace(/\bgood\b/gi, 'exceptional').replace(/\bnice\b/gi, 'quietly beautiful').replace(/^/, 'Unhurried and intimate — ');
      else if (instr.includes('professional')) text = src.replace(/!+/g, '.').replace(/\bwe're\b/gi, 'we are');
      else if (instr.includes('expand')) text = `${src} Every detail is considered, from the first welcome to the last morning view.`;
      await new Promise((r) => setTimeout(r, 600));
      return { text, usage, model: 'atrium-demo' };
    },
    async generateStructuredData<T>(req: StructuredRequest<T>) {
      await new Promise((r) => setTimeout(r, req.schemaName === 'site_plan' ? 1600 : 1100));
      return { data: req.parse(structured(req.schemaName, req.prompt)), usage, model: 'atrium-demo' };
    },
    estimateCost: () => 0,
    async test() {
      return { ok: true, message: 'Demo provider is always available (offline).' };
    },
  };
}

export const isDemoMode = () => process.env.AI_DEMO === '1' || process.env.AI_DEFAULT_PROVIDER === 'demo';
