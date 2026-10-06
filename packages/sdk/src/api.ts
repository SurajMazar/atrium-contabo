import type { BuildReport, ChangeSummary, SeoReport, SiteOperation } from '@atrium/builder-core';
import type { AdminBranding, CollectionField, FormDefinition, Node, PageDocument, Redirect, ThemeTokens, WebsiteDefinition } from '@atrium/schema';
import { HttpClient, type AtriumClientOptions, type Query } from './client';
import type * as T from './types';

const q = (o: object = {}) => o as Query;

/** Typed client for every route in docs/API.md. */
export function createAtriumClient(opts: AtriumClientOptions) {
  const http = new HttpClient(opts);
  const enc = encodeURIComponent;

  const providerCrud = (plural: string) => ({
    list: (orgId: string, query: { websiteId?: string; kind?: string } = {}) => http.get<T.ProviderRecord[]>(`/organizations/${orgId}/${plural}`, q(query)),
    create: (orgId: string, body: T.ProviderInput) => http.post<T.ProviderRecord>(`/organizations/${orgId}/${plural}`, body),
    update: (id: string, body: Partial<T.ProviderInput>) => http.patch<T.ProviderRecord>(`/${plural}/${id}`, body),
    remove: (id: string) => http.delete(`/${plural}/${id}`),
    test: (id: string, body: { to?: string } = {}) => http.post<T.TestResult>(`/${plural}/${id}/test`, body),
  });

  return {
    http,
    auth: {
      register: (body: { name: string; email: string; password: string; organizationName?: string }) => http.post<T.AuthResult>('/auth/register', body),
      login: (body: { email: string; password: string }) => http.post<T.LoginResult>('/auth/login', body),
      verifyMfa: (body: { challengeToken: string; code: string }) => http.post<T.AuthResult>('/auth/mfa/verify', body),
      refresh: () => http.post<T.AuthResult>('/auth/refresh'),
      logout: () => http.post<void>('/auth/logout'),
      forgotPassword: (email: string) => http.post<void>('/auth/password/forgot', { email }),
      resetPassword: (token: string, password: string) => http.post<void>('/auth/password/reset', { token, password }),
      changePassword: (currentPassword: string, newPassword: string) => http.post<void>('/auth/password/change', { currentPassword, newPassword }),
      me: () => http.get<T.Me>('/auth/me'),
      updateMe: (body: Partial<Pick<T.User, 'name' | 'avatarUrl' | 'locale'>>) => http.patch<T.User>('/auth/me', body),
      sessions: () => http.get<{ items: T.SessionInfo[] }>('/auth/sessions'),
      revokeSession: (id: string) => http.delete(`/auth/sessions/${id}`),
      /** Step-up: pass the current password when the session is older than a few minutes (403 REAUTH_REQUIRED). */
      setupMfa: (currentPassword?: string) => http.post<{ secret: string; otpauthUrl: string; qrDataUrl: string }>('/auth/mfa/setup', currentPassword ? { currentPassword } : {}),
      enableMfa: (code: string) => http.post<{ recoveryCodes: string[] }>('/auth/mfa/enable', { code }),
      disableMfa: (code: string, currentPassword?: string) => http.post<void>('/auth/mfa/disable', currentPassword ? { code, currentPassword } : { code }),
    },
    organizations: {
      list: () => http.get<T.OrganizationSummary[]>('/organizations'),
      create: (name: string) => http.post<T.OrganizationSummary>('/organizations', { name }),
      get: (orgId: string) => http.get<T.OrganizationSummary & { createdAt: string }>(`/organizations/${orgId}`),
      update: (orgId: string, body: { name?: string }) => http.patch<T.OrganizationSummary>(`/organizations/${orgId}`, body),
      usage: (orgId: string) => http.get<T.OrgUsage>(`/organizations/${orgId}/usage`),
      members: (orgId: string) => http.get<T.Member[]>(`/organizations/${orgId}/members`),
      updateMember: (orgId: string, memberId: string, body: { roleId?: string; websiteIds?: string[] }) => http.patch<T.Member>(`/organizations/${orgId}/members/${memberId}`, body),
      removeMember: (orgId: string, memberId: string) => http.delete(`/organizations/${orgId}/members/${memberId}`),
      invitations: (orgId: string) => http.get<T.Invitation[]>(`/organizations/${orgId}/invitations`),
      invite: (orgId: string, body: { email: string; roleId: string }) => http.post<T.Invitation>(`/organizations/${orgId}/invitations`, body),
      revokeInvitation: (orgId: string, id: string) => http.delete(`/organizations/${orgId}/invitations/${id}`),
      acceptInvitation: (token: string) => http.post<{ organizationId: string }>('/invitations/accept', { token }),
      roles: (orgId: string) => http.get<T.Role[]>(`/organizations/${orgId}/roles`),
      createRole: (orgId: string, body: { name: string; description?: string; permissions: string[] }) => http.post<T.Role>(`/organizations/${orgId}/roles`, body),
      updateRole: (orgId: string, roleId: string, body: { name?: string; description?: string; permissions?: string[] }) => http.patch<T.Role>(`/organizations/${orgId}/roles/${roleId}`, body),
      deleteRole: (orgId: string, roleId: string) => http.delete(`/organizations/${orgId}/roles/${roleId}`),
      permissions: () => http.get<Array<{ key: string; description: string }>>('/permissions'),
      auditLogs: (orgId: string, query: { websiteId?: string; action?: string; cursor?: string; limit?: number } = {}) => http.get<T.List<T.AuditLogEntry>>(`/organizations/${orgId}/audit-logs`, q(query)),
    },
    websites: {
      list: (orgId: string) => http.get<T.WebsiteSummary[]>(`/organizations/${orgId}/websites`),
      create: (orgId: string, body: { name: string; slug?: string; source: T.WebsiteSource }) => http.post<T.Website>(`/organizations/${orgId}/websites`, body),
      import: (orgId: string, body: FormData | { definition: unknown; name?: string }) => http.post<T.Website>(`/organizations/${orgId}/websites/import`, body),
      get: (id: string) => http.get<T.Website>(`/websites/${id}`),
      update: (id: string, body: Partial<Pick<T.Website, 'name' | 'slug' | 'deploymentMode' | 'deploymentIntegrationId'>>) => http.patch<T.Website>(`/websites/${id}`, body),
      remove: (id: string) => http.delete(`/websites/${id}`),
      dashboard: (id: string) => http.get<T.Dashboard>(`/websites/${id}/dashboard`),
      draft: (id: string) => http.get<T.DraftResponse>(`/websites/${id}/draft`),
      saveSite: (id: string, body: { settings?: WebsiteDefinition['settings']; navigation?: WebsiteDefinition['navigation']; header?: Node; footer?: Node; customCss?: string; revision: number }) => http.put<{ revision: number }>(`/websites/${id}/draft/site`, body),
      saveTheme: (id: string, body: { tokens: ThemeTokens; presetKey?: string; revision: number }) => http.put<{ revision: number }>(`/websites/${id}/theme`, body),
      operations: (id: string, body: { operations: SiteOperation[]; label?: string }) => http.post<{ results: Array<{ createdId?: string; warnings: string[] }>; revisions: T.DraftRevisions }>(`/websites/${id}/operations`, body),
      clone: (id: string, body: { name: string; include: { pages?: boolean; theme?: boolean; forms?: boolean; collections?: boolean; media?: boolean } }) => http.post<T.Website>(`/websites/${id}/clone`, body),
      exportUrl: (id: string, format: 'json' | 'zip' | 'nextjs' = 'json') => http.url(`/websites/${id}/export`, { format }),
      export: (id: string, format: 'json' | 'zip' | 'nextjs' = 'json') => http.get<Response>(`/websites/${id}/export`, { format }, { raw: true }),
      activity: (id: string, query: { cursor?: string } = {}) => http.get<T.List<T.ActivityItem>>(`/websites/${id}/activity`, q(query)),
      validate: (id: string) => http.post<BuildReport>(`/websites/${id}/validate`),
      publish: (id: string, body: { message?: string } = {}) => http.post<{ version: { id: string; number: number }; report: BuildReport }>(`/websites/${id}/publish`, body),
      versions: (id: string) => http.get<T.WebsiteVersion[]>(`/websites/${id}/versions`),
      version: (id: string, versionId: string) => http.get<T.WebsiteVersion & { snapshot: unknown }>(`/websites/${id}/versions/${versionId}`),
      compareVersions: (id: string, from: string, to: string | 'draft') => http.get<ChangeSummary[]>(`/websites/${id}/versions/compare`, { from, to }),
      restoreVersion: (id: string, versionId: string) => http.post<void>(`/websites/${id}/versions/${versionId}/restore`),
      republishVersion: (id: string, versionId: string) => http.post<{ version: { id: string; number: number } }>(`/websites/${id}/versions/${versionId}/publish`),
      previewTokens: (id: string) => http.get<T.PreviewToken[]>(`/websites/${id}/preview-tokens`),
      createPreviewToken: (id: string, body: { expiresInHours?: number; password?: string; label?: string } = {}) => http.post<T.PreviewToken>(`/websites/${id}/preview-tokens`, body),
      revokePreviewToken: (id: string, tokenId: string) => http.delete(`/websites/${id}/preview-tokens/${tokenId}`),
      seo: (id: string) => http.get<Array<{ pageId: string; title: string; slug: string; report: SeoReport }>>(`/websites/${id}/seo`),
      redirects: (id: string) => http.get<Redirect[]>(`/websites/${id}/redirects`),
      saveRedirects: (id: string, redirects: Array<Omit<Redirect, 'id'> & { id?: string }>) => http.put<Redirect[]>(`/websites/${id}/redirects`, { redirects }),
      brokenLinks: (id: string) => http.get<Array<{ pageId: string; nodeId?: string; path: string; link: unknown; reason: string }>>(`/websites/${id}/links`),
      analytics: (id: string, query: { from?: string; to?: string } = {}) => http.get<T.Analytics>(`/websites/${id}/analytics`, q(query)),
    },
    pages: {
      list: (websiteId: string) => http.get<T.PageSummary[]>(`/websites/${websiteId}/pages`),
      create: (websiteId: string, body: { title: string; slug: string; kind?: string; templateId?: string; sections?: unknown[] }) => http.post<T.PageWithDocument>(`/websites/${websiteId}/pages`, body),
      get: (pageId: string) => http.get<T.PageWithDocument>(`/pages/${pageId}`),
      update: (pageId: string, body: { document?: PageDocument; title?: string; slug?: string; status?: string; publishAt?: string | null; revision: number }) => http.patch<{ revision: number; updatedAt: string }>(`/pages/${pageId}`, body),
      remove: (pageId: string) => http.delete(`/pages/${pageId}`),
      duplicate: (pageId: string, body: { title?: string; slug?: string } = {}) => http.post<T.PageWithDocument>(`/pages/${pageId}/duplicate`, body),
      setHomepage: (pageId: string) => http.post<void>(`/pages/${pageId}/homepage`),
      versions: (pageId: string) => http.get<T.PageVersion[]>(`/pages/${pageId}/versions`),
      version: (pageId: string, versionId: string) => http.get<T.PageVersion & { slug: string; document: PageDocument }>(`/pages/${pageId}/versions/${versionId}`),
      createVersion: (pageId: string, message: string) => http.post<T.PageVersion>(`/pages/${pageId}/versions`, { message }),
      restoreVersion: (pageId: string, versionId: string) => http.post<T.PageWithDocument>(`/pages/${pageId}/versions/${versionId}/restore`),
      lock: (pageId: string) => http.post<{ lockedById: string; lockedUntil: string }>(`/pages/${pageId}/lock`),
      unlock: (pageId: string) => http.delete(`/pages/${pageId}/lock`),
      seo: (pageId: string) => http.get<SeoReport>(`/pages/${pageId}/seo`),
    },
    templates: {
      list: (query: { kind?: T.Template['kind']; organizationId?: string } = {}) => http.get<T.Template[]>('/templates', q(query)),
      get: (id: string) => http.get<T.Template>(`/templates/${id}`),
      create: (orgId: string, body: { kind: T.Template['kind']; name: string; description?: string; category?: string; data?: unknown; from?: { websiteId: string; pageId?: string; nodeId?: string } }) => http.post<T.Template>(`/organizations/${orgId}/templates`, body),
      remove: (id: string) => http.delete(`/templates/${id}`),
    },
    globalSections: {
      list: (websiteId: string) => http.get<T.GlobalSectionDto[]>(`/websites/${websiteId}/global-sections`),
      create: (websiteId: string, body: { name: string; node: Node }) => http.post<T.GlobalSectionDto>(`/websites/${websiteId}/global-sections`, body),
      update: (id: string, body: { name?: string; node?: Node }) => http.patch<T.GlobalSectionDto>(`/global-sections/${id}`, body),
      remove: (id: string) => http.delete(`/global-sections/${id}`),
    },
    collections: {
      list: (websiteId: string) => http.get<T.Collection[]>(`/websites/${websiteId}/collections`),
      create: (websiteId: string, body: { slug: string; name: string; singularName?: string; fields: CollectionField[]; titleField?: string; routePrefix?: string; description?: string }) => http.post<T.Collection>(`/websites/${websiteId}/collections`, body),
      get: (cid: string) => http.get<T.Collection>(`/collections/${cid}`),
      update: (cid: string, body: Partial<Omit<T.Collection, 'id'>>) => http.patch<T.Collection>(`/collections/${cid}`, body),
      remove: (cid: string) => http.delete(`/collections/${cid}`),
      items: (cid: string, query: { search?: string; status?: string; cursor?: string; limit?: number } = {}) => http.get<T.List<T.CollectionItemDto>>(`/collections/${cid}/items`, q(query)),
      createItem: (cid: string, body: { slug?: string; status?: string; data: Record<string, unknown> }) => http.post<T.CollectionItemDto>(`/collections/${cid}/items`, body),
      getItem: (itemId: string) => http.get<T.CollectionItemDto>(`/collection-items/${itemId}`),
      updateItem: (itemId: string, body: { slug?: string; status?: string; data?: Record<string, unknown> }) => http.patch<T.CollectionItemDto>(`/collection-items/${itemId}`, body),
      removeItem: (itemId: string) => http.delete(`/collection-items/${itemId}`),
      reorder: (cid: string, ids: string[]) => http.post<void>(`/collections/${cid}/items/reorder`, { ids }),
    },
    media: {
      list: (orgId: string, query: { websiteId?: string; folderId?: string | null; search?: string; type?: 'image' | 'video' | 'document'; tag?: string; cursor?: string; limit?: number } = {}) => http.get<T.List<T.Media>>(`/organizations/${orgId}/media`, q(query)),
      upload: (orgId: string, file: Blob, meta: { filename?: string; folderId?: string; websiteId?: string; alt?: string; allowDuplicate?: boolean } = {}) => {
        const fd = new FormData();
        fd.append('file', file, meta.filename ?? (file as File).name ?? 'upload');
        for (const [k, v] of Object.entries(meta)) if (v !== undefined && k !== 'filename') fd.append(k, String(v));
        return http.post<T.Media>(`/organizations/${orgId}/media/upload`, fd);
      },
      update: (id: string, body: Partial<Pick<T.Media, 'filename' | 'alt' | 'title' | 'caption' | 'tags' | 'folderId'>>) => http.patch<T.Media>(`/media/${id}`, body),
      replace: (id: string, file: Blob) => {
        const fd = new FormData();
        fd.append('file', file);
        return http.post<T.Media>(`/media/${id}/replace`, fd);
      },
      remove: (id: string) => http.delete(`/media/${id}`),
      folders: (orgId: string, query: { websiteId?: string } = {}) => http.get<T.MediaFolder[]>(`/organizations/${orgId}/media-folders`, q(query)),
      createFolder: (orgId: string, body: { name: string; parentId?: string; websiteId?: string }) => http.post<T.MediaFolder>(`/organizations/${orgId}/media-folders`, body),
      updateFolder: (id: string, body: { name?: string; parentId?: string | null }) => http.patch<T.MediaFolder>(`/media-folders/${id}`, body),
      removeFolder: (id: string) => http.delete(`/media-folders/${id}`),
    },
    forms: {
      list: (websiteId: string) => http.get<T.FormDto[]>(`/websites/${websiteId}/forms`),
      create: (websiteId: string, body: Omit<FormDefinition, 'id'> & { id?: string }) => http.post<T.FormDto>(`/websites/${websiteId}/forms`, body),
      get: (formId: string) => http.get<T.FormDto>(`/forms/${formId}`),
      save: (formId: string, body: FormDefinition & { revision?: number }) => http.put<T.FormDto>(`/forms/${formId}`, body),
      remove: (formId: string) => http.delete(`/forms/${formId}`),
    },
    submissions: {
      list: (websiteId: string, query: { formId?: string; status?: string; search?: string; tag?: string; unread?: boolean; assignedTo?: string; from?: string; to?: string; cursor?: string; limit?: number } = {}) => http.get<T.List<T.SubmissionSummary>>(`/websites/${websiteId}/submissions`, q(query)),
      get: (id: string) => http.get<T.Submission>(`/submissions/${id}`),
      update: (id: string, body: { status?: T.SubmissionStatus; read?: boolean; tags?: string[]; assignedToId?: string | null }) => http.patch<T.Submission>(`/submissions/${id}`, body),
      addNote: (id: string, body: string) => http.post<T.Submission['notes'][number]>(`/submissions/${id}/notes`, { body }),
      remove: (id: string) => http.delete(`/submissions/${id}`),
      bulk: (websiteId: string, body: { ids: string[]; action: 'markRead' | 'markUnread' | 'archive' | 'status' | 'tag' | 'delete'; value?: unknown }) => http.post<{ updated: number }>(`/websites/${websiteId}/submissions/bulk`, body),
      exportUrl: (websiteId: string, query: { format: 'csv' | 'xlsx'; formId?: string; status?: string }) => http.url(`/websites/${websiteId}/submissions/export`, q(query)),
      export: (websiteId: string, query: { format: 'csv' | 'xlsx'; formId?: string; status?: string }) => http.get<Response>(`/websites/${websiteId}/submissions/export`, q(query), { raw: true }),
    },
    providers: {
      drivers: (kind?: T.ProviderKind) => http.get<T.DriverInfo[]>('/providers/drivers', q({ kind })),
      email: providerCrud('email-providers'),
      sms: providerCrud('sms-providers'),
      storage: providerCrud('storage-providers'),
      integrations: providerCrud('integrations'),
    },
    webhooks: {
      list: (orgId: string, query: { websiteId?: string } = {}) => http.get<T.Webhook[]>(`/organizations/${orgId}/webhooks`, q(query)),
      create: (orgId: string, body: { name: string; url: string; events: string[]; websiteId?: string }) => http.post<T.Webhook>(`/organizations/${orgId}/webhooks`, body),
      update: (id: string, body: Partial<Pick<T.Webhook, 'name' | 'url' | 'events' | 'enabled'>>) => http.patch<T.Webhook>(`/webhooks/${id}`, body),
      remove: (id: string) => http.delete(`/webhooks/${id}`),
      test: (id: string) => http.post<T.WebhookDelivery>(`/webhooks/${id}/test`),
      deliveries: (id: string, query: { cursor?: string } = {}) => http.get<T.List<T.WebhookDelivery>>(`/webhooks/${id}/deliveries`, q(query)),
      retryDelivery: (deliveryId: string) => http.post<T.WebhookDelivery>(`/webhook-deliveries/${deliveryId}/retry`),
    },
    domains: {
      list: (websiteId: string) => http.get<T.Domain[]>(`/websites/${websiteId}/domains`),
      add: (websiteId: string, hostname: string) => http.post<T.Domain>(`/websites/${websiteId}/domains`, { hostname }),
      update: (id: string, body: { isPrimary?: boolean; redirectToPrimary?: boolean }) => http.patch<T.Domain>(`/domains/${id}`, body),
      remove: (id: string) => http.delete(`/domains/${id}`),
      verify: (id: string) => http.post<T.Domain>(`/domains/${id}/verify`),
    },
    deployments: {
      list: (websiteId: string) => http.get<T.Deployment[]>(`/websites/${websiteId}/deployments`),
      create: (websiteId: string, body: { target: 'preview' | 'production'; versionId?: string }) => http.post<T.Deployment>(`/websites/${websiteId}/deployments`, body),
      get: (id: string) => http.get<T.Deployment>(`/deployments/${id}`),
      redeploy: (id: string) => http.post<T.Deployment>(`/deployments/${id}/redeploy`),
      rollback: (id: string) => http.post<T.Deployment>(`/deployments/${id}/rollback`),
      cancel: (id: string) => http.post<T.Deployment>(`/deployments/${id}/cancel`),
    },
    ai: {
      models: () => http.get<T.AiModels[]>('/ai/models'),
      generateSite: (orgId: string, body: { brief: T.SiteBrief; prompt?: string; provider?: string; model?: string }) => http.post<{ generationId: string; websiteId: string }>(`/organizations/${orgId}/ai/generate-site`, body),
      generation: (id: string) => http.get<T.AiGeneration>(`/ai/generations/${id}`),
      eventsUrl: (id: string) => http.url(`/ai/generations/${id}/events`),
      edit: (websiteId: string, body: { prompt: string; pageId?: string; nodeId?: string; provider?: string; model?: string }) => http.post<T.AiProposal>(`/websites/${websiteId}/ai/edit`, body),
      generatePage: (websiteId: string, body: { prompt: string }) => http.post<T.AiProposal>(`/websites/${websiteId}/ai/generate-page`, body),
      generateSection: (websiteId: string, body: { prompt: string; pageId: string; index?: number }) => http.post<T.AiProposal>(`/websites/${websiteId}/ai/generate-section`, body),
      /** Called after the user reviewed the proposal preview and clicked Apply — that click is the confirmation. */
      apply: (generationId: string, body: { confirm?: boolean } = { confirm: true }) => http.post<{ revisions: T.DraftRevisions }>(`/ai/generations/${generationId}/apply`, body),
      revert: (generationId: string) => http.post<{ revisions: T.DraftRevisions }>(`/ai/generations/${generationId}/revert`),
      rewrite: (websiteId: string, body: { text: string; mode: T.RewriteMode; locale?: string; context?: string }) => http.post<{ text: string }>(`/websites/${websiteId}/ai/rewrite`, body),
      seo: (websiteId: string, pageId: string) => http.post<{ recommendations: Array<{ field: string; current: string | null; suggested: string; reason: string }> }>(`/websites/${websiteId}/ai/seo`, { pageId }),
      history: (websiteId: string) => http.get<T.AiGenerationSummary[]>(`/websites/${websiteId}/ai/generations`),
      usage: (orgId: string) => http.get<{ period: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number; limit: Record<string, number> }>(`/organizations/${orgId}/ai/usage`),
      /** Whether AI works for this organization and where the key comes from (organization, platform, demo). */
      status: (orgId: string) => http.get<T.AiStatus>(`/organizations/${orgId}/ai/status`),
    },
    registry: {
      components: () => http.get<T.RegistryComponent[]>('/registry/components'),
      componentSchema: (type: string) => http.get<Record<string, unknown>>(`/registry/components/${enc(type)}/schema`),
      animations: () => http.get<Array<{ id: string; name: string; description: string; category: string; bestFor: string[] }>>('/registry/animations'),
      themes: () => http.get<Array<{ key: string; tokens: ThemeTokens }>>('/registry/themes'),
    },
    admin: {
      overview: () => http.get<Record<string, unknown>>('/admin/overview'),
      organizations: (query: { search?: string; cursor?: string } = {}) => http.get<T.List<Record<string, unknown>>>('/admin/organizations', q(query)),
      organization: (id: string) => http.get<Record<string, unknown>>(`/admin/organizations/${id}`),
      user: (id: string) => http.get<Record<string, unknown>>(`/admin/users/${id}`),
      updateOrganization: (id: string, body: { planKey?: string; suspended?: boolean; featureFlags?: Record<string, boolean> }) => http.patch<Record<string, unknown>>(`/admin/organizations/${id}`, body),
      users: (query: { search?: string; cursor?: string } = {}) => http.get<T.List<Record<string, unknown>>>('/admin/users', q(query)),
      updateUser: (id: string, body: { disabled?: boolean; isSuperAdmin?: boolean }) => http.patch<Record<string, unknown>>(`/admin/users/${id}`, body),
      websites: (query: { search?: string; cursor?: string } = {}) => http.get<T.List<Record<string, unknown>>>('/admin/websites', q(query)),
      jobs: () => http.get<Array<{ queue: string; counts: Record<string, number>; failed: Array<{ id: string; name: string; failedReason: string; attemptsMade: number; timestamp: number }> }>>('/admin/jobs'),
      retryJob: (queue: string, jobId: string) => http.post<void>(`/admin/jobs/${enc(queue)}/${enc(jobId)}/retry`),
      featureFlags: () => http.get<Array<{ key: string; description: string; enabled: boolean; rules: Record<string, unknown> }>>('/admin/feature-flags'),
      saveFeatureFlags: (flags: Array<{ key: string; enabled: boolean; rules?: Record<string, unknown> }>) => http.put<void>('/admin/feature-flags', { flags }),
      plans: () => http.get<Array<{ key: string; name: string; limits: Record<string, number>; features: string[]; priceMonthly: number }>>('/admin/plans'),
      savePlans: (plans: unknown[]) => http.put<void>('/admin/plans', { plans }),
      auditLogs: (query: { cursor?: string; action?: string } = {}) => http.get<T.List<T.AuditLogEntry>>('/admin/audit-logs', q(query)),
      abuseReports: () => http.get<Array<Record<string, unknown>>>('/admin/abuse-reports'),
      updateAbuseReport: (id: string, body: { status: string }) => http.patch<void>(`/admin/abuse-reports/${id}`, body),
      aiUsage: () => http.get<Array<Record<string, unknown>>>('/admin/ai-usage'),
      /** Platform providers (email, SMS, storage, AI) configured from the panel instead of env. */
      providers: {
        list: (kind?: T.PlatformProviderKind) => http.get<T.ProviderRecord[]>('/admin/providers', q({ kind })),
        status: () => http.get<T.PlatformProviderStatus>('/admin/providers/status'),
        create: (body: T.ProviderInput & { kind: T.PlatformProviderKind }) => http.post<T.ProviderRecord>('/admin/providers', body),
        update: (id: string, body: Partial<T.ProviderInput>) => http.patch<T.ProviderRecord>(`/admin/providers/${id}`, body),
        remove: (id: string) => http.delete<void>(`/admin/providers/${id}`),
        test: (id: string, body: { to?: string } = {}) => http.post<T.TestResult>(`/admin/providers/${id}/test`, body),
      },
    },
    branding: {
      /** Public: platform defaults merged with an organization's overrides. */
      get: (organizationId?: string) => http.get<{ platform: AdminBranding; organization: AdminBranding | null; resolved: AdminBranding }>('/branding', q({ organizationId })),
      organization: (orgId: string) => http.get<{ organization: AdminBranding; resolved: AdminBranding }>(`/organizations/${orgId}/branding`),
      saveOrganization: (orgId: string, branding: AdminBranding) => http.put<{ organization: AdminBranding; resolved: AdminBranding }>(`/organizations/${orgId}/branding`, branding),
      savePlatform: (branding: AdminBranding) => http.put<{ platform: AdminBranding; resolved: AdminBranding }>('/admin/branding', branding),
    },
    health: () => http.get<{ status: string }>('/health'),
    healthReady: () => http.get<{ status: string; checks?: Record<string, unknown> }>('/health/ready'),
  };
}

export type AtriumClient = ReturnType<typeof createAtriumClient>;
