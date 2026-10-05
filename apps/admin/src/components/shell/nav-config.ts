import {
  BarChart3,
  Building2,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  GitBranch,
  Globe,
  History,
  ImageIcon,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Palette,
  type LucideIcon,
  PenTool,
  Plug,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Webhook,
  ListChecks,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see the item. */
  permission?: string;
  /** Match nested routes as active. */
  exact?: boolean;
  /** Opens outside the shell (builder). */
  external?: boolean;
}

export function websiteNav(id: string): NavItem[] {
  const b = `/w/${id}`;
  return [
    { label: 'Dashboard', href: b, icon: LayoutDashboard, exact: true },
    { label: 'Editor', href: `${b}/editor`, icon: PenTool, permission: 'page.update', external: true },
    { label: 'Pages', href: `${b}/pages`, icon: FileText, permission: 'page.read' },
    { label: 'CMS', href: `${b}/cms`, icon: Database },
    { label: 'Media', href: `${b}/media`, icon: ImageIcon, permission: 'media.read' },
    { label: 'Forms', href: `${b}/forms`, icon: ClipboardList, permission: 'form.read' },
    { label: 'Submissions', href: `${b}/submissions`, icon: Inbox, permission: 'submission.read' },
    { label: 'SEO', href: `${b}/seo`, icon: Search },
    { label: 'Analytics', href: `${b}/analytics`, icon: BarChart3, permission: 'analytics.read' },
    { label: 'Domains', href: `${b}/domains`, icon: Globe },
    { label: 'Deployments', href: `${b}/deployments`, icon: Rocket, permission: 'deployment.read' },
    { label: 'Versions', href: `${b}/versions`, icon: History },
    { label: 'Settings', href: `${b}/settings`, icon: Settings },
  ];
}

export function orgNav(orgId: string): NavItem[] {
  const b = `/org/${orgId}`;
  return [
    { label: 'Team', href: `${b}/team`, icon: Users },
    { label: 'Roles', href: `${b}/roles`, icon: KeyRound },
    { label: 'Media library', href: `${b}/media`, icon: ImageIcon, permission: 'media.read' },
    { label: 'Integrations', href: `${b}/integrations`, icon: Plug, permission: 'integration.manage' },
    { label: 'Webhooks', href: `${b}/webhooks`, icon: Webhook, permission: 'webhook.manage' },
    { label: 'Audit log', href: `${b}/audit`, icon: ListChecks, permission: 'audit.read' },
    { label: 'Branding', href: `${b}/branding`, icon: Palette, permission: 'organization.update' },
    { label: 'Usage & billing', href: `${b}/usage`, icon: Gauge },
  ];
}

export const adminNav: NavItem[] = [
  { label: 'Overview', href: '/admin', icon: ShieldCheck, exact: true },
  { label: 'Organizations', href: '/admin/organizations', icon: Building2 },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Websites', href: '/admin/websites', icon: Globe },
  { label: 'Jobs', href: '/admin/jobs', icon: GitBranch },
  { label: 'Feature flags', href: '/admin/flags', icon: ListChecks },
  { label: 'Plans', href: '/admin/plans', icon: Gauge },
  { label: 'Providers', href: '/admin/providers', icon: Plug },
  { label: 'Branding', href: '/admin/branding', icon: Palette },
  { label: 'AI usage', href: '/admin/ai-usage', icon: BarChart3 },
  { label: 'Audit logs', href: '/admin/audit', icon: History },
  { label: 'Abuse reports', href: '/admin/abuse', icon: ShieldCheck },
];
