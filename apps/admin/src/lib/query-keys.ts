/**
 * TanStack Query key factory shared by the admin and the builder.
 * Keys are hierarchical so `invalidateQueries({ queryKey: qk.website(id) })`
 * also invalidates everything nested under that website.
 */
type Q = Record<string, unknown> | undefined;

export const qk = {
  me: () => ['me'] as const,
  sessions: () => ['me', 'sessions'] as const,
  permissionsCatalog: () => ['permissions'] as const,

  // Organizations
  organizations: () => ['orgs'] as const,
  org: (orgId: string) => ['org', orgId] as const,
  orgUsage: (orgId: string) => ['org', orgId, 'usage'] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  invitations: (orgId: string) => ['org', orgId, 'invitations'] as const,
  roles: (orgId: string) => ['org', orgId, 'roles'] as const,
  auditLogs: (orgId: string, query?: Q) => ['org', orgId, 'audit', query ?? {}] as const,
  websites: (orgId: string) => ['org', orgId, 'websites'] as const,
  trash: (orgId: string) => ['org', orgId, 'trash'] as const,
  media: (orgId: string, query?: Q) => ['org', orgId, 'media', query ?? {}] as const,
  mediaAll: (orgId: string) => ['org', orgId, 'media'] as const,
  mediaFolders: (orgId: string, websiteId?: string) => ['org', orgId, 'media-folders', websiteId ?? null] as const,
  providers: (orgId: string, kind: string) => ['org', orgId, 'providers', kind] as const,
  drivers: (kind: string) => ['drivers', kind] as const,
  webhooks: (orgId: string) => ['org', orgId, 'webhooks'] as const,
  webhookDeliveries: (webhookId: string) => ['webhook', webhookId, 'deliveries'] as const,
  aiUsage: (orgId: string) => ['org', orgId, 'ai-usage'] as const,
  templates: (kind?: string, orgId?: string) => ['templates', kind ?? 'all', orgId ?? null] as const,
  template: (id: string) => ['template', id] as const,

  // Websites
  website: (id: string) => ['website', id] as const,
  dashboard: (id: string) => ['website', id, 'dashboard'] as const,
  draft: (id: string) => ['website', id, 'draft'] as const,
  activity: (id: string) => ['website', id, 'activity'] as const,
  pages: (id: string) => ['website', id, 'pages'] as const,
  page: (pageId: string) => ['page', pageId] as const,
  pageVersions: (pageId: string) => ['page', pageId, 'versions'] as const,
  pageSeo: (pageId: string) => ['page', pageId, 'seo'] as const,
  versions: (id: string) => ['website', id, 'versions'] as const,
  compare: (id: string, from: string, to: string) => ['website', id, 'compare', from, to] as const,
  previewTokens: (id: string) => ['website', id, 'preview-tokens'] as const,
  globalSections: (id: string) => ['website', id, 'global-sections'] as const,
  collections: (id: string) => ['website', id, 'collections'] as const,
  collection: (cid: string) => ['collection', cid] as const,
  collectionItems: (cid: string, query?: Q) => ['collection', cid, 'items', query ?? {}] as const,
  collectionItemsAll: (cid: string) => ['collection', cid, 'items'] as const,
  forms: (id: string) => ['website', id, 'forms'] as const,
  form: (formId: string) => ['form', formId] as const,
  submissions: (id: string, query?: Q) => ['website', id, 'submissions', query ?? {}] as const,
  submissionsAll: (id: string) => ['website', id, 'submissions'] as const,
  submission: (subId: string) => ['submission', subId] as const,
  seo: (id: string) => ['website', id, 'seo'] as const,
  redirects: (id: string) => ['website', id, 'redirects'] as const,
  brokenLinks: (id: string) => ['website', id, 'links'] as const,
  analytics: (id: string, query?: Q) => ['website', id, 'analytics', query ?? {}] as const,
  domains: (id: string) => ['website', id, 'domains'] as const,
  deployments: (id: string) => ['website', id, 'deployments'] as const,
  deployment: (depId: string) => ['deployment', depId] as const,
  aiHistory: (id: string) => ['website', id, 'ai-history'] as const,
  aiGeneration: (genId: string) => ['ai-generation', genId] as const,
  aiModels: () => ['ai-models'] as const,

  // Registry (builder)
  registryComponents: () => ['registry', 'components'] as const,
  registryAnimations: () => ['registry', 'animations'] as const,
  registryThemes: () => ['registry', 'themes'] as const,

  // Super admin
  admin: (section: string, query?: Q) => ['admin', section, query ?? {}] as const,
};
