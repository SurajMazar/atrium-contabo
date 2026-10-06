/**
 * Permission catalog. Authorization is always checked against permission keys —
 * never against role names — so organizations can define custom roles.
 */
export const PERMISSIONS = {
  'organization.read': 'View organization',
  'organization.update': 'Update organization settings',
  'organization.delete': 'Delete organization',
  'billing.manage': 'Manage billing and plan',

  'user.invite': 'Invite members',
  'user.remove': 'Remove members',
  'role.manage': 'Create and edit roles',

  'website.read': 'View websites',
  'website.create': 'Create websites',
  'website.update': 'Update website settings',
  'website.delete': 'Delete websites',
  'website.export': 'Export and clone websites',

  'theme.update': 'Edit theme and design tokens',
  'navigation.update': 'Edit navigation, header and footer',

  'page.read': 'View pages',
  'page.create': 'Create pages',
  'page.update': 'Edit pages',
  'page.publish': 'Publish pages',
  'page.delete': 'Delete pages',

  'template.manage': 'Manage templates',
  'collection.manage': 'Manage collection schemas',
  'collection.content': 'Edit collection items',

  'media.read': 'View media',
  'media.upload': 'Upload media',
  'media.delete': 'Delete media',

  'form.read': 'View forms',
  'form.create': 'Create forms',
  'form.update': 'Edit forms and workflows',
  'form.delete': 'Delete forms',
  'submission.read': 'View submissions',
  'submission.update': 'Update submissions',
  'submission.export': 'Export submissions',
  'submission.delete': 'Delete submissions',

  'seo.manage': 'Manage SEO settings',
  'redirect.manage': 'Manage redirects',
  'code.manage': 'Add custom code and scripts',

  'domain.manage': 'Manage domains',
  'deployment.read': 'View deployments',
  'deployment.preview': 'Create preview deployments',
  'deployment.publish': 'Publish to production',

  'integration.manage': 'Manage integrations and providers',
  'webhook.manage': 'Manage webhooks',

  'ai.use': 'Use AI generation and editing',
  'analytics.read': 'View analytics',
  'audit.read': 'View audit log',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Platform-level permissions for super administrators (not assignable to org roles). */
export const PLATFORM_PERMISSIONS = [
  'platform.organizations', 'platform.users', 'platform.websites', 'platform.plans', 'platform.flags',
  'platform.jobs', 'platform.audit', 'platform.health', 'platform.abuse',
] as const;

const READ_ONLY: Permission[] = ['organization.read', 'website.read', 'page.read', 'media.read', 'form.read', 'deployment.read'];

export interface DefaultRole {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export const DEFAULT_ROLES: DefaultRole[] = [
  { key: 'owner', name: 'Organization Owner', description: 'Full control including billing and deletion', permissions: ALL_PERMISSIONS },
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Manage everything except billing and organization deletion',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'organization.delete' && p !== 'billing.manage'),
  },
  {
    // Meant for members limited to one (or a few) websites: everything inside those websites, nothing
    // organization-wide (members, roles, billing, org settings and providers, other websites).
    key: 'website_manager',
    name: 'Website Manager',
    description: 'Run assigned websites end to end: content, design, forms, SEO, domains and publishing',
    permissions: [
      ...READ_ONLY,
      'website.update', 'website.export',
      'theme.update', 'navigation.update',
      'page.create', 'page.update', 'page.publish', 'page.delete',
      'collection.manage', 'collection.content',
      'media.upload', 'media.delete',
      'form.create', 'form.update', 'form.delete',
      'submission.read', 'submission.update', 'submission.export', 'submission.delete',
      'seo.manage', 'redirect.manage', 'code.manage', 'domain.manage',
      'deployment.preview', 'deployment.publish',
      'ai.use', 'analytics.read',
    ],
  },
  {
    key: 'designer',
    name: 'Designer',
    description: 'Design pages, themes and templates',
    permissions: [...READ_ONLY, 'website.update', 'theme.update', 'navigation.update', 'page.create', 'page.update', 'template.manage', 'media.upload', 'ai.use', 'deployment.preview'],
  },
  {
    key: 'developer',
    name: 'Developer',
    description: 'Custom code, integrations, domains and deployments',
    permissions: [...READ_ONLY, 'website.update', 'page.update', 'code.manage', 'integration.manage', 'webhook.manage', 'domain.manage', 'deployment.preview', 'deployment.publish', 'redirect.manage', 'collection.manage', 'ai.use'],
  },
  {
    key: 'editor',
    name: 'Editor',
    description: 'Edit and publish page content',
    permissions: [...READ_ONLY, 'page.create', 'page.update', 'page.publish', 'media.upload', 'collection.content', 'ai.use', 'deployment.preview'],
  },
  {
    key: 'content_manager',
    name: 'Content Manager',
    description: 'Manage CMS collections and media',
    permissions: [...READ_ONLY, 'collection.content', 'media.upload', 'media.delete', 'page.update', 'ai.use'],
  },
  { key: 'seo_manager', name: 'SEO Manager', description: 'SEO settings, redirects and analytics', permissions: [...READ_ONLY, 'seo.manage', 'redirect.manage', 'analytics.read', 'page.update', 'ai.use'] },
  { key: 'marketing_manager', name: 'Marketing Manager', description: 'Forms, analytics and campaigns', permissions: [...READ_ONLY, 'form.create', 'form.update', 'submission.read', 'submission.export', 'analytics.read', 'page.update', 'ai.use'] },
  { key: 'submission_manager', name: 'Submission Manager', description: 'Work the enquiry inbox', permissions: ['organization.read', 'website.read', 'form.read', 'submission.read', 'submission.update', 'submission.export'] },
  { key: 'viewer', name: 'Viewer', description: 'Read-only access', permissions: [...READ_ONLY, 'analytics.read'] },
];

export function hasPermission(granted: Iterable<string>, required: Permission | Permission[]): boolean {
  const set = granted instanceof Set ? (granted as Set<string>) : new Set(granted);
  const req = Array.isArray(required) ? required : [required];
  return req.every((p) => set.has(p));
}
