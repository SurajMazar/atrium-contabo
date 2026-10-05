import { applyOperation, diffWebsites, findNode, type ChangeSummary, type SiteOperation } from '@atrium/builder-core';
import type { ComponentRegistry } from '@atrium/component-registry';
import type { AiContentPart, AiMessage, AiToolDefinition } from '@atrium/providers';
import type { Node, WebsiteDefinition } from '@atrium/schema';
import { produce } from 'immer';
import { animationIndex, componentGuide, componentIndex } from './guide';
import { imageCatalogText, resolveLibraryImages } from './images';
import { Llm } from './llm';
import { DESIGN_PRINCIPLES } from './prompts';

export interface EditProposal {
  summary: string;
  operations: SiteOperation[];
  changes: ChangeSummary[];
  warnings: string[];
  after: WebsiteDefinition;
}

const MAX_TURNS = 14;

function compactNode(n: Node, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = { id: n.id, type: n.type };
  if (n.variant) out.variant = n.variant;
  if (n.name) out.name = n.name;
  if (n.anchor) out.anchor = n.anchor;
  if (n.animation) out.animation = n.animation.preset;
  if (n.hidden) out.hidden = true;
  out.props = JSON.parse(JSON.stringify(n.props, (_k, v) => (typeof v === 'string' && v.length > 280 ? `${v.slice(0, 280)}…` : v)));
  if (n.style) out.style = n.style;
  if (n.children?.length) out.children = depth > 3 ? `${n.children.length} children` : n.children.map((c) => compactNode(c, depth + 1));
  return out;
}

export function siteOverview(def: WebsiteDefinition) {
  return {
    name: def.settings.name,
    business: { name: def.settings.business.name, type: def.settings.business.type, description: def.settings.business.description },
    theme: { preset: def.theme.name, colors: def.theme.colors, headingFont: def.theme.typography.heading.family, bodyFont: def.theme.typography.body.family, motion: def.theme.motion.intensity, radius: def.theme.radius, buttons: def.theme.buttons },
    pages: def.pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug, isHomepage: p.isHomepage, status: p.status, sections: p.sections.map((s) => ({ id: s.id, type: s.type, variant: s.variant, heading: (s.props.heading ?? s.props.text ?? undefined) as string | undefined })) })),
    navigation: def.navigation.menus,
    header: { type: def.header.type, variant: def.header.variant },
    footer: { type: def.footer.type, variant: def.footer.variant },
    forms: def.forms.map((f) => ({ id: f.id, name: f.name, slug: f.slug, fields: f.fields.map((x) => x.name) })),
    collections: def.collections.map((c) => ({ slug: c.slug, fields: c.fields.map((f) => f.key), items: c.items.length })),
  };
}

const TOOLS: AiToolDefinition[] = [
  { name: 'get_site', description: 'Overview of the website: pages with section ids, theme tokens, navigation, forms, collections.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_page', description: 'Full section tree (ids, types, variants, props, styles) of one page. Use "header"/"footer" for site chrome.', inputSchema: { type: 'object', properties: { pageId: { type: 'string' } }, required: ['pageId'], additionalProperties: false } },
  { name: 'get_components', description: 'Detailed prop reference for specific component types before adding or editing them.', inputSchema: { type: 'object', properties: { types: { type: 'array', items: { type: 'string' } } }, required: ['types'], additionalProperties: false } },
  {
    name: 'apply_operations',
    description:
      'Apply builder operations to the working copy. Each operation is validated against the schema and component registry; failures are reported back so you can correct them. Operations: addNode{pageId,parentId|null,index?,node}, updateNode{pageId,nodeId,props?,style?,variant?,animation?|null,name?,hidden?,anchor?}, setProp{pageId,nodeId,path,value}, setStyle{pageId,nodeId,key,breakpoint,value}, replaceNode{pageId,nodeId,node}, moveNode{pageId,nodeId,parentId,index}, removeNode{pageId,nodeId}, duplicateNode{pageId,nodeId}, createPage{page:{title,slug,sections,seo}}, updatePage{pageId,patch}, deletePage{pageId}, duplicatePage{pageId}, updateTheme{patch}, updateSettings{patch}, setMenu{menu,items}, createForm{form}, updateForm{formId,patch}, setRedirects{redirects}. A node is {type, variant?, props, animation?, anchor?, children?}.',
    inputSchema: { type: 'object', properties: { operations: { type: 'array', items: { type: 'object', properties: { op: { type: 'string' } }, required: ['op'] } } }, required: ['operations'] },
  },
  { name: 'finish', description: 'Call once when the requested change is complete. Summarize what changed for the user in one or two sentences.', inputSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false } },
];

/**
 * The editing agent works on an in-memory copy through validated operations
 * only — it can't touch the database, other tenants, or anything outside the
 * builder API. The caller persists the returned operations after confirmation.
 */
export async function proposeEdit(opts: {
  llm: Llm;
  registry: ComponentRegistry;
  definition: WebsiteDefinition;
  prompt: string;
  pageId?: string;
  nodeId?: string;
  mode?: 'edit' | 'page' | 'section';
  insertIndex?: number;
}): Promise<EditProposal> {
  const { llm, registry } = opts;
  let working = opts.definition;
  const accepted: SiteOperation[] = [];
  const warnings: string[] = [];
  let summary = '';

  const page = opts.pageId ? working.pages.find((p) => p.id === opts.pageId) : working.pages.find((p) => p.isHomepage);
  const selected = page && opts.nodeId ? findNode(page.sections, opts.nodeId)?.node : undefined;
  const focus = [
    page && `The user is viewing page "${page.title}" (id ${page.id}, /${page.slug}).`,
    selected && `The user has selected this node:\n${JSON.stringify(compactNode(selected))}`,
    opts.mode === 'page' && 'Task type: create a new page consistent with the existing site (reuse its section patterns, tone, animation style and imagery), add it to the primary navigation, then finish.',
    opts.mode === 'section' && `Task type: add ONE new section to page ${page?.id}${opts.insertIndex !== undefined ? ` at index ${opts.insertIndex}` : ''}, choosing the most suitable registered component, then finish.`,
  ]
    .filter(Boolean)
    .join('\n');

  const system = `${DESIGN_PRINCIPLES}

You are editing an existing website through tools. Work like a careful designer:
1. Inspect what you need (get_site / get_page / get_components). The overview and current page are already provided below.
2. Make the smallest set of changes that fully satisfies the request, staying consistent with the site's theme, voice and section patterns.
3. Apply changes with apply_operations (batch related operations). If an operation fails, fix it and retry.
4. Call finish with a short summary. Do not ask the user questions; make sensible design decisions.
Global requests ("darker palette", "squared buttons", "subtler animations") usually mean updateTheme (colors, radius, buttons.radius, motion.intensity) rather than editing every node.

Section-level components:
${componentIndex(registry)}

Animation presets:
${animationIndex()}

Image library (use "library:<key>" as image src):
${imageCatalogText()}`;

  const messages: AiMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: `Site overview:\n${JSON.stringify(siteOverview(working))}\n\n${page ? `Current page sections:\n${JSON.stringify(page.sections.map((s) => compactNode(s)))}\n\n` : ''}${focus}\n\nRequest: ${opts.prompt}` },
      ],
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await llm.provider.chat({ model: llm.model, system, messages, tools: TOOLS, maxTokens: 16_000, cache: true });
    llm.track(res.usage, res.model);
    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter((c): c is Extract<AiContentPart, { type: 'tool_call' }> => c.type === 'tool_call');
    if (!calls.length) {
      summary ||= res.content.filter((c): c is Extract<AiContentPart, { type: 'text' }> => c.type === 'text').map((c) => c.text).join(' ').trim();
      break;
    }
    const results: AiContentPart[] = [];
    let finished = false;
    for (const call of calls) {
      const input = call.input ?? {};
      let out: unknown;
      let isError = false;
      try {
        switch (call.name) {
          case 'get_site':
            out = siteOverview(working);
            break;
          case 'get_page': {
            const id = String(input.pageId);
            if (id === 'header') out = compactNode(working.header);
            else if (id === 'footer') out = compactNode(working.footer);
            else {
              const p = working.pages.find((x) => x.id === id || x.slug === id.replace(/^\//, ''));
              if (!p) throw new Error(`No page ${id}`);
              out = { id: p.id, title: p.title, slug: p.slug, seo: p.seo, layout: p.layout, sections: p.sections.map((s) => compactNode(s)) };
            }
            break;
          }
          case 'get_components':
            out = componentGuide(registry, (input.types as string[]) ?? []);
            break;
          case 'apply_operations': {
            const ops = (Array.isArray(input.operations) ? input.operations : []) as SiteOperation[];
            const report: Array<Record<string, unknown>> = [];
            for (const raw of ops) {
              const op = resolveLibraryImages(raw);
              try {
                let r: ReturnType<typeof applyOperation> | undefined;
                working = produce(working, (d) => {
                  r = applyOperation(d, op, registry);
                });
                accepted.push(op);
                warnings.push(...(r?.warnings ?? []));
                report.push({ op: op.op, ok: true, createdId: r?.createdId, warnings: r?.warnings?.length ? r.warnings : undefined });
              } catch (err) {
                isError = true;
                report.push({ op: (op as { op?: string }).op, ok: false, error: (err as Error).message.slice(0, 600) });
              }
            }
            out = report;
            isError = report.every((r) => !r.ok) && report.length > 0;
            break;
          }
          case 'finish':
            summary = String(input.summary ?? '').trim();
            finished = true;
            out = 'ok';
            break;
          default:
            throw new Error(`Unknown tool ${call.name}`);
        }
      } catch (err) {
        isError = true;
        out = (err as Error).message;
      }
      results.push({ type: 'tool_result', toolCallId: call.id, content: typeof out === 'string' ? out : JSON.stringify(out), isError });
    }
    // all results for this turn go back in a single user message
    messages.push({ role: 'user', content: results });
    if (finished) break;
  }

  return { summary: summary || (accepted.length ? `Applied ${accepted.length} change${accepted.length === 1 ? '' : 's'}.` : 'No changes were needed.'), operations: accepted, changes: diffWebsites(opts.definition, working), warnings, after: working };
}
