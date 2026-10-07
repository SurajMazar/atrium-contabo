import type { BuildReport, ChangeSummary, SeoReport, SiteOperation } from '@atrium/builder-core';
import type {
  CollectionField, FormDefinition, PageDocument, Redirect, SiteSnapshot, ThemeTokens, WebsiteDefinition, Node,
} from '@atrium/schema';

export type ID = string;
export interface List<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export interface User {
  id: ID;
  email: string;
  name: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  locale: string;
  /** Someone else set this account's password: the user must choose their own before continuing. */
  passwordChangeRequired?: boolean;
}
export interface AuthResult {
  accessToken: string;
  user: User;
}
export type LoginResult = AuthResult | { mfaRequired: true; challengeToken: string };

export interface OrganizationSummary {
  id: ID;
  name: string;
  slug: string;
  planKey: string;
}
export interface RoleSummary {
  id: ID;
  key: string;
  name: string;
}
export interface Membership {
  organization: OrganizationSummary;
  role: RoleSummary;
  permissions: string[];
  websiteIds: string[];
}
export interface Me {
  user: User;
  memberships: Membership[];
}
export interface SessionInfo {
  id: ID;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
  current: boolean;
}

export interface Role extends RoleSummary {
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount?: number;
}
export interface Member {
  id: ID;
  user: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>;
  role: RoleSummary;
  websiteIds: string[];
  createdAt: string;
}
export interface Invitation {
  id: ID;
  email: string;
  role: RoleSummary;
  /** Websites the invitee will be limited to (empty = every website). */
  websiteIds?: string[];
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}
export interface OrgUsage {
  plan: { key: string; name: string };
  limits: Record<string, number>;
  usage: Record<string, number>;
}

export type WebsiteStatus = 'DRAFT' | 'PUBLISHED' | 'SUSPENDED' | 'ARCHIVED';
export interface WebsiteSummary {
  id: ID;
  organizationId: ID;
  name: string;
  slug: string;
  status: WebsiteStatus;
  deploymentMode: 'PLATFORM' | 'INDEPENDENT';
  primaryDomain: string | null;
  platformUrl: string;
  publishedAt: string | null;
  updatedAt: string;
  thumbnailUrl: string | null;
}
export interface Website extends WebsiteSummary {
  permissions: string[];
  deploymentProvider: string | null;
  deploymentIntegrationId: string | null;
  publishedVersionId: string | null;
  createdAt: string;
}
export type WebsiteSource =
  | { type: 'blank' }
  | { type: 'template'; templateKey: string }
  | { type: 'import'; definition: unknown };

export interface DraftRevisions {
  site: number;
  theme: number;
  pages: Record<ID, number>;
}
export interface DraftResponse {
  definition: WebsiteDefinition;
  revisions: DraftRevisions;
}

export interface Dashboard {
  status: WebsiteStatus;
  productionUrl: string | null;
  primaryDomain: string | null;
  lastDeployment: Deployment | null;
  lastEditor: { name: string; at: string } | null;
  traffic: { pageviews7d: number; visitors7d: number; series: Array<{ date: string; pageviews: number; visitors: number }> };
  submissions: { new: number; total7d: number };
  conversionRate: number;
  seoScore: number | null;
  storageMb: number;
  recentEdits: ActivityItem[];
  deployments: Deployment[];
  aiGenerations: AiGenerationSummary[];
}

export interface PageSummary {
  id: ID;
  title: string;
  slug: string;
  kind: 'PAGE' | 'COLLECTION_TEMPLATE' | 'NOT_FOUND';
  status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED';
  isHomepage: boolean;
  position: number;
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
  publishedAt: string | null;
}
export interface PageWithDocument extends PageSummary {
  document: PageDocument;
}
export interface PageVersion {
  id: ID;
  number: number;
  title: string;
  message: string | null;
  source: string;
  createdAt: string;
  createdBy: string | null;
}

export interface WebsiteVersion {
  id: ID;
  number: number;
  message: string | null;
  source: string;
  createdAt: string;
  createdBy: string | null;
  isPublished: boolean;
}
export interface PreviewToken {
  id: ID;
  url: string;
  token?: string;
  label: string | null;
  expiresAt: string;
  hasPassword: boolean;
}

export interface Template {
  id: ID;
  key: string | null;
  kind: 'SITE' | 'PAGE' | 'SECTION' | 'COMPONENT_PRESET' | 'THEME';
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  isBlueprint: boolean;
  organizationId: string | null;
  data?: unknown;
}
export interface GlobalSectionDto {
  id: ID;
  name: string;
  node: Node;
  updatedAt: string;
}

export interface Collection {
  id: ID;
  slug: string;
  name: string;
  singularName: string | null;
  description: string | null;
  titleField: string;
  routePrefix: string | null;
  fields: CollectionField[];
  itemCount?: number;
}
export interface CollectionItemDto {
  id: ID;
  slug: string;
  status: string;
  data: Record<string, unknown>;
  position: number;
  updatedAt: string;
}

export interface MediaVariant {
  width: number;
  format: string;
  url: string;
}
export interface Media {
  id: ID;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  title: string | null;
  caption: string | null;
  tags: string[];
  folderId: string | null;
  websiteId: string | null;
  variants: MediaVariant[];
  blurDataUrl: string | null;
  status: string;
  createdAt: string;
}
export interface MediaFolder {
  id: ID;
  name: string;
  parentId: string | null;
  websiteId: string | null;
}

export type SubmissionStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'REJECTED' | 'SPAM' | 'ARCHIVED';
export interface SubmissionSummary {
  id: ID;
  formId: ID;
  formName: string;
  status: SubmissionStatus;
  read: boolean;
  tags: string[];
  assignedTo: { id: ID; name: string } | null;
  summary: Record<string, unknown>;
  spamScore: number;
  createdAt: string;
}
export interface Submission extends SubmissionSummary {
  values: Array<{ fieldName: string; fieldLabel: string; fieldType: string; value: unknown }>;
  notes: Array<{ id: ID; body: string; author: { id: ID; name: string }; createdAt: string }>;
  actionsLog: Array<{ action: string; status: string; at: string; detail?: string }>;
  pageUrl: string | null;
  referrer: string | null;
  userAgent: string | null;
}
export interface FormDto extends FormDefinition {
  revision: number;
  submissionCount?: number;
  updatedAt?: string;
}

export type ProviderKind = 'email' | 'sms' | 'storage' | 'ai' | 'deployment' | 'captcha';
export interface DriverInfo {
  kind: ProviderKind;
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
  presets: Array<{ id: string; name: string; config: Record<string, unknown> }>;
}
export interface ProviderRecord {
  id: ID;
  name: string;
  driver: string;
  config: Record<string, unknown>;
  /** Masked values, e.g. ••••••••abcd */
  secrets: Record<string, string>;
  isDefault: boolean;
  websiteId: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  fromEmail?: string;
  fromName?: string | null;
  kind?: string;
  enabled?: boolean;
}
export type PlatformProviderKind = 'email' | 'sms' | 'storage' | 'ai';
/** Where each platform capability comes from: the admin panel, env variables, or nowhere. */
export type PlatformProviderStatus = Record<PlatformProviderKind, { source: 'admin' | 'env' | 'none'; provider?: { id: string; name: string; driver: string } }>;
export interface AiStatus {
  ready: boolean;
  source: 'demo' | 'explicit' | 'website' | 'organization' | 'platform' | null;
  provider: { driver: string; name: string } | null;
  /** Caller may connect a provider for the organization (integration.manage). */
  canConfigure: boolean;
  /** Caller is a super admin and may set the platform-wide key. */
  canConfigurePlatform: boolean;
  demoMode: boolean;
}
export interface ProviderInput {
  name: string;
  driver: string;
  config: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  isDefault?: boolean;
  websiteId?: string | null;
  fromEmail?: string;
  fromName?: string;
  kind?: string;
  enabled?: boolean;
}
export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface Webhook {
  id: ID;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  websiteId: string | null;
  secret?: string;
  createdAt: string;
}
export interface WebhookDelivery {
  id: ID;
  event: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING';
  attempts: number;
  responseStatus: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  payload?: unknown;
  responseBody?: string | null;
}

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  value: string;
  reason: string;
}
export interface Domain {
  id: ID;
  hostname: string;
  isPrimary: boolean;
  redirectToPrimary: boolean;
  environment: string;
  provider: string;
  status: string;
  dnsStatus: string;
  sslStatus: string;
  dnsRecords: DnsRecord[];
  verifiedAt: string | null;
  lastCheckedAt: string | null;
}
export interface Deployment {
  id: ID;
  provider: string;
  target: 'PREVIEW' | 'PRODUCTION';
  status: 'QUEUED' | 'BUILDING' | 'READY' | 'FAILED' | 'CANCELLED';
  url: string | null;
  inspectorUrl: string | null;
  error: string | null;
  versionId: string | null;
  versionNumber?: number | null;
  externalId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  triggeredBy?: { id: ID; name: string } | null;
  logs?: Array<{ timestamp: string; level: string; message: string }>;
}

export interface ActivityItem {
  id: ID;
  action: string;
  summary: string | null;
  actorType: 'USER' | 'AI' | 'SYSTEM' | 'API';
  actorName: string | null;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface Analytics {
  /** Built-in analytics is collected for this website's organization (super admins switch it). */
  enabled: boolean;
  totals: { pageviews: number; visitors: number; sessions: number; conversions: number; conversionRate: number };
  series: Array<{ date: string; pageviews: number; visitors: number }>;
  topPages: Array<{ path: string; pageviews: number }>;
  referrers: Array<{ referrer: string; visits: number }>;
  countries: Array<{ country: string; visits: number }>;
  devices: Array<{ device: string; visits: number }>;
  forms: Array<{ formId: string; name: string; submissions: number }>;
}

export interface AiProgressStep {
  step: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  at?: string;
  detail?: string;
}
export interface AiGenerationSummary {
  id: ID;
  kind: string;
  prompt: string;
  provider: string;
  model: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'REVERTED';
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
  user?: { id: ID; name: string };
}
export interface AiGeneration extends AiGenerationSummary {
  progress: AiProgressStep[];
  result: unknown;
  error: string | null;
  websiteId: string | null;
}
export interface AiProposal {
  generationId: ID;
  summary: string;
  operations: SiteOperation[];
  changes: ChangeSummary[];
  requiresConfirmation: boolean;
  warnings?: string[];
}
export interface SiteBrief {
  businessName: string;
  businessType: string;
  description: string;
  location?: string;
  services?: string[];
  audience?: string;
  style?: string;
  pages?: string[];
  contact?: { phone?: string; email?: string; address?: string; whatsapp?: string };
  social?: Record<string, string>;
  logoUrl?: string;
  imageUrls?: string[];
  locale?: string;
}
export interface AiModels {
  provider: string;
  configured: boolean;
  models: Array<{ id: string; label: string; default?: boolean }>;
}
export type RewriteMode = 'rewrite' | 'shorten' | 'expand' | 'professional' | 'luxurious' | 'casual' | 'seo' | 'translate';

export interface RegistryComponent {
  type: string;
  name: string;
  category: string;
  level: 'section' | 'block' | 'element' | 'site';
  description: string;
  icon: string;
  variants?: Array<{ id: string; name: string; description: string }>;
  defaultVariant?: string;
  controls: unknown[];
  styleControls: string[];
  children: false | { allowed: 'any' | string[]; min?: number; max?: number };
  bindable?: { listProp: string; itemFields: string[] };
  animations?: { recommended: string[]; default?: string };
  defaultProps?: Record<string, unknown>;
}

export interface AuditLogEntry extends ActivityItem {
  ip: string | null;
  websiteId: string | null;
}

export type { BuildReport, ChangeSummary, SeoReport, SiteOperation, ThemeTokens, Redirect, SiteSnapshot, WebsiteDefinition, PageDocument, FormDefinition };
