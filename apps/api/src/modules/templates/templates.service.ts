import { Injectable } from '@nestjs/common';
import { findNode } from '@atrium/builder-core';
import { THEME_PRESETS } from '@atrium/design-tokens';
import { WebsiteInputSchema, type NodeInput, type PageInput, type WebsiteInput } from '@atrium/schema';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { badRequest, notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { loadDraft } from '@atrium/site-store';

/** Shape of the code-defined template library in @atrium/templates. */
interface BlueprintInput {
  businessName: string;
  tagline?: string;
  description?: string;
  location?: string;
  phone?: string;
  email?: string;
  address?: string;
  social?: Record<string, string>;
  themePreset?: string;
}
interface Blueprint {
  key: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  thumbnail?: string;
  build(input: BlueprintInput): WebsiteInput;
}
interface NamedTemplate<T> {
  key?: string;
  id?: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  thumbnail?: string;
  node?: T;
  page?: T;
  data?: T;
  definition?: WebsiteInput;
}
interface TemplatesLib {
  BLUEPRINTS?: Blueprint[];
  DEMO_SITES?: Array<NamedTemplate<WebsiteInput>> | Record<string, WebsiteInput | NamedTemplate<WebsiteInput>>;
  SECTION_TEMPLATES?: Array<NamedTemplate<NodeInput>>;
  PAGE_TEMPLATES?: Array<NamedTemplate<PageInput>>;
}
/** @atrium/templates is optional at runtime (code templates); DB templates always work. */
function loadLib(): TemplatesLib {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@atrium/templates') as TemplatesLib;
  } catch {
    return {};
  }
}
const lib = loadLib();

type Kind = 'SITE' | 'PAGE' | 'SECTION' | 'COMPONENT_PRESET' | 'THEME';

export interface TemplateDto {
  id: string;
  key: string | null;
  kind: Kind;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  isBlueprint: boolean;
  organizationId: string | null;
  data?: unknown;
}

function demoSites(): Array<{ key: string; name: string; description?: string; category?: string; tags?: string[]; thumbnail?: string; definition: WebsiteInput }> {
  const raw = lib.DEMO_SITES;
  if (!raw) return [];
  const entries = Array.isArray(raw) ? raw.map((d, i) => [d.key ?? d.id ?? String(i), d] as const) : Object.entries(raw);
  return entries.map(([key, v]) => {
    const t = v as NamedTemplate<WebsiteInput> & Partial<WebsiteInput>;
    const definition = (t.definition ?? (t as { website?: WebsiteInput }).website ?? t.data ?? (t.settings ? (t as unknown as WebsiteInput) : undefined)) as WebsiteInput;
    return { key, name: t.name ?? (definition?.settings as { name?: string })?.name ?? key, description: t.description, category: t.category, tags: t.tags, thumbnail: t.thumbnail, definition };
  });
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private codeTemplates(kind?: Kind): TemplateDto[] {
    const out: TemplateDto[] = [];
    const base = { organizationId: null, thumbnailUrl: null, description: null, category: null, tags: [] as string[], isBlueprint: false };
    if (!kind || kind === 'SITE') {
      for (const b of lib.BLUEPRINTS ?? []) out.push({ ...base, id: `bp:${b.key}`, key: b.key, kind: 'SITE', name: b.name, description: b.description, category: b.category ?? null, tags: b.tags ?? [], thumbnailUrl: b.thumbnail ?? null, isBlueprint: true });
      for (const d of demoSites()) out.push({ ...base, id: `demo:${d.key}`, key: `demo:${d.key}`, kind: 'SITE', name: d.name, description: d.description ?? 'Complete demo website', category: d.category ?? 'Demo', tags: d.tags ?? ['demo'], thumbnailUrl: d.thumbnail ?? null });
    }
    if (!kind || kind === 'PAGE') (lib.PAGE_TEMPLATES ?? []).forEach((t, i) => out.push({ ...base, id: `page:${t.key ?? t.id ?? i}`, key: t.key ?? null, kind: 'PAGE', name: t.name, description: t.description ?? null, category: t.category ?? null, tags: t.tags ?? [], thumbnailUrl: t.thumbnail ?? null, data: t.page ?? t.data }));
    if (!kind || kind === 'SECTION') (lib.SECTION_TEMPLATES ?? []).forEach((t, i) => out.push({ ...base, id: `section:${t.key ?? t.id ?? i}`, key: t.key ?? null, kind: 'SECTION', name: t.name, description: t.description ?? null, category: t.category ?? null, tags: t.tags ?? [], thumbnailUrl: t.thumbnail ?? null, data: t.node ?? t.data }));
    if (!kind || kind === 'THEME') for (const [key, tokens] of Object.entries(THEME_PRESETS)) out.push({ ...base, id: `theme:${key}`, key, kind: 'THEME', name: tokens.name, category: 'Theme', data: tokens });
    return out;
  }

  private dbDto(t: { id: string; key: string | null; kind: Kind; name: string; description: string | null; category: string | null; tags: string[]; thumbnailUrl: string | null; isBlueprint: boolean; organizationId: string | null; data?: unknown }, withData: boolean): TemplateDto {
    return { id: t.id, key: t.key, kind: t.kind, name: t.name, description: t.description, category: t.category, tags: t.tags, thumbnailUrl: t.thumbnailUrl, isBlueprint: t.isBlueprint, organizationId: t.organizationId, ...(withData ? { data: t.data } : {}) };
  }

  async list(kind: Kind | undefined, organizationIds: string[]) {
    const rows = await this.prisma.client.template.findMany({ where: { kind, OR: [{ organizationId: null }, { organizationId: { in: organizationIds } }] }, orderBy: { createdAt: 'desc' } });
    const withData = kind === 'SECTION' || kind === 'PAGE';
    return [...rows.map((r) => this.dbDto(r, withData)), ...this.codeTemplates(kind).map((t) => (withData || t.kind === 'THEME' ? t : { ...t, data: undefined }))];
  }

  async get(id: string, organizationIds: string[]): Promise<TemplateDto> {
    const code = this.codeTemplates().find((t) => t.id === id);
    if (code) {
      if (code.kind === 'SITE') return { ...code, data: await this.siteInput(code.key!.startsWith('demo:') ? code.key! : `bp:${code.key}`, { businessName: code.name }, null) };
      return code;
    }
    const row = await this.prisma.client.template.findUnique({ where: { id } });
    if (!row || (row.organizationId && !organizationIds.includes(row.organizationId))) throw notFound('Template');
    return this.dbDto(row, true);
  }

  /** Resolve a site template key into a WebsiteInput ready for normalization. */
  async siteInput(key: string, input: BlueprintInput, orgId: string | null): Promise<WebsiteInput> {
    const bare = key.replace(/^bp:/, '');
    if (key.startsWith('demo:')) {
      const demo = demoSites().find((d) => `demo:${d.key}` === key || d.key === key.slice(5));
      if (!demo) throw notFound('Demo site');
      return structuredClone(demo.definition);
    }
    const bp = (lib.BLUEPRINTS ?? []).find((b) => b.key === bare);
    if (bp) return bp.build(input);
    const row = await this.prisma.client.template.findFirst({ where: { OR: [{ id: key }, { key }], kind: 'SITE', ...(orgId ? { OR: [{ organizationId: null }, { organizationId: orgId }] } : {}) } });
    if (!row) throw notFound('Template');
    return this.parseImport(row.data);
  }

  /** Accept a WebsiteInput/WebsiteDefinition or a SiteSnapshot envelope. */
  parseImport(raw: unknown): WebsiteInput {
    const candidate = raw && typeof raw === 'object' && 'definition' in (raw as object) ? (raw as { definition: unknown }).definition : raw;
    const res = WebsiteInputSchema.safeParse(candidate);
    if (!res.success) throw validation('This file is not a valid Atrium website export', res.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })));
    return res.data as WebsiteInput;
  }

  async create(orgId: string, body: { kind: Kind; name: string; description?: string; category?: string; data?: unknown; from?: { websiteId: string; pageId?: string; nodeId?: string } }, user: AuthUser) {
    let data = body.data;
    if (body.from) {
      const site = await this.prisma.client.website.findFirst({ where: { id: body.from.websiteId, organizationId: orgId, deletedAt: null } });
      if (!site) throw notFound('Website');
      const { definition } = await loadDraft(this.prisma.client, site.id);
      if (body.kind === 'SITE') data = definition;
      else if (body.kind === 'THEME') data = definition.theme;
      else {
        const page = definition.pages.find((p) => p.id === body.from!.pageId);
        if (!page) throw notFound('Page');
        if (body.kind === 'PAGE') data = { ...page, id: undefined, isHomepage: false };
        else {
          const loc = body.from.nodeId ? findNode(page.sections, body.from.nodeId) : null;
          if (!loc) throw notFound('Section');
          data = loc.node;
        }
      }
    }
    if (data === undefined) throw badRequest('Provide template data or a source');
    const row = await this.prisma.client.template.create({ data: { organizationId: orgId, kind: body.kind, name: body.name, description: body.description, category: body.category, data: JSON.parse(JSON.stringify(data)), createdById: user.id } });
    await this.audit.log({ organizationId: orgId, actor: user, action: 'template.created', resourceType: 'template', resourceId: row.id, summary: `${user.name} saved template ${row.name}` });
    return this.dbDto(row, true);
  }

  async remove(id: string) {
    await this.prisma.client.template.delete({ where: { id } });
  }
}
