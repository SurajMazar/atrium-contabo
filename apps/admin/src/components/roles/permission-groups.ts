import { PERMISSIONS } from '@atrium/schema';

export interface PermissionEntry {
  key: string;
  description: string;
  resource: string;
  action: string;
}

export interface PermissionGroup {
  resource: string;
  label: string;
  permissions: PermissionEntry[];
}

const RESOURCE_LABELS: Record<string, string> = {
  organization: 'Organization',
  billing: 'Billing',
  user: 'Members',
  role: 'Roles',
  website: 'Websites',
  theme: 'Theme',
  navigation: 'Navigation',
  page: 'Pages',
  template: 'Templates',
  collection: 'CMS collections',
  media: 'Media',
  form: 'Forms',
  submission: 'Submissions',
  seo: 'SEO',
  redirect: 'Redirects',
  code: 'Custom code',
  domain: 'Domains',
  deployment: 'Deployments',
  integration: 'Integrations',
  webhook: 'Webhooks',
  ai: 'AI',
  analytics: 'Analytics',
  audit: 'Audit log',
};

export function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource.charAt(0).toUpperCase() + resource.slice(1);
}

export const FALLBACK_CATALOG: Array<{ key: string; description: string }> = Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));

/** Normalize the `/permissions` response (or fall back to the bundled catalog). */
export function normalizeCatalog(data: unknown): Array<{ key: string; description: string }> {
  if (!Array.isArray(data) || data.length === 0) return FALLBACK_CATALOG;
  const out: Array<{ key: string; description: string }> = [];
  for (const item of data) {
    if (item && typeof item === 'object' && typeof (item as { key?: unknown }).key === 'string') {
      const key = (item as { key: string }).key;
      const d = (item as { description?: unknown }).description;
      out.push({ key, description: typeof d === 'string' && d ? d : ((PERMISSIONS as Record<string, string>)[key] ?? key) });
    } else if (typeof item === 'string') {
      out.push({ key: item, description: (PERMISSIONS as Record<string, string>)[item] ?? item });
    }
  }
  return out.length ? out : FALLBACK_CATALOG;
}

/** Group catalog entries by resource (key prefix before the dot), keeping catalog order. */
export function groupPermissions(catalog: Array<{ key: string; description: string }>): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();
  for (const p of catalog) {
    const dot = p.key.indexOf('.');
    const resource = dot === -1 ? p.key : p.key.slice(0, dot);
    const action = dot === -1 ? p.key : p.key.slice(dot + 1);
    let g = groups.get(resource);
    if (!g) {
      g = { resource, label: resourceLabel(resource), permissions: [] };
      groups.set(resource, g);
    }
    g.permissions.push({ ...p, resource, action });
  }
  return [...groups.values()];
}
