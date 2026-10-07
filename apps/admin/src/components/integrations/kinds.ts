import type { AtriumClient, ProviderInput, ProviderKind, ProviderRecord, TestResult } from '@atrium/sdk';
import { Bot, Mail, MessageSquare, Rocket, ShieldCheck, HardDrive, type LucideIcon } from 'lucide-react';

export interface KindMeta {
  kind: ProviderKind;
  /** Tab label */
  label: string;
  /** Singular noun used in copy ("Email provider") */
  noun: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  /** Integrations table kind (AI | DEPLOYMENT | CAPTCHA) — undefined for dedicated provider tables. */
  integrationKind?: 'AI' | 'DEPLOYMENT' | 'CAPTCHA';
  /** Email-only from address fields. */
  hasFrom?: boolean;
  /** Website scoping is supported (storage providers are organization-wide). */
  scoped: boolean;
  /** Test needs a recipient. */
  testRecipient?: 'email' | 'phone';
  /** Whether rows can be enabled/disabled (integrations table only). */
  toggleable?: boolean;
  /** Platform-wide provider managed by super admins (/admin/providers) instead of an organization. */
  platform?: boolean;
}

export const KINDS: KindMeta[] = [
  {
    kind: 'email',
    label: 'Email',
    noun: 'Email provider',
    icon: Mail,
    emptyTitle: 'No email providers',
    emptyDescription: 'Send form notifications and autoresponders from your own domain. Atrium’s platform mailer is used until you add one.',
    hasFrom: true,
    scoped: true,
    testRecipient: 'email',
  },
  {
    kind: 'sms',
    label: 'SMS',
    noun: 'SMS provider',
    icon: MessageSquare,
    emptyTitle: 'No SMS providers',
    emptyDescription: 'Text new leads to your team or send confirmation messages to visitors. SMS actions on forms stay inactive until you add one.',
    scoped: true,
    testRecipient: 'phone',
  },
  {
    kind: 'storage',
    label: 'Storage',
    noun: 'Storage provider',
    icon: HardDrive,
    emptyTitle: 'No storage providers',
    emptyDescription: 'Keep uploaded media and form attachments in your own S3, R2 or Azure bucket. Platform storage is used until you add one.',
    scoped: false,
  },
  {
    kind: 'ai',
    label: 'AI',
    noun: 'AI provider',
    icon: Bot,
    emptyTitle: 'No AI providers',
    emptyDescription: 'Bring your own OpenAI, Anthropic or Gemini key for site generation and content rewrites. Usage then bills to your account instead of plan credits.',
    integrationKind: 'AI',
    scoped: true,
    toggleable: true,
  },
  {
    kind: 'deployment',
    label: 'Deployment',
    noun: 'Deployment target',
    icon: Rocket,
    emptyTitle: 'No deployment targets',
    emptyDescription: 'Publish websites independently to Vercel, Netlify, Cloudflare Pages or your own server. Atrium hosting is used until you add one.',
    integrationKind: 'DEPLOYMENT',
    scoped: true,
    toggleable: true,
  },
  {
    kind: 'captcha',
    label: 'Captcha',
    noun: 'Captcha provider',
    icon: ShieldCheck,
    emptyTitle: 'No captcha providers',
    emptyDescription: 'Protect public forms from spam with Turnstile, reCAPTCHA or hCaptcha. Forms rely on honeypot and rate limits until you add one.',
    integrationKind: 'CAPTCHA',
    scoped: true,
    toggleable: true,
  },
];

export const KIND_KEYS = KINDS.map((k) => k.kind);

export function kindMeta(kind: string): KindMeta {
  return KINDS.find((k) => k.kind === kind) ?? KINDS[0]!;
}

/** Scope id used in query keys for platform providers. */
export const PLATFORM_SCOPE = 'platform';

/** Platform variants of the provider kinds (super-admin panel). */
export const PLATFORM_KINDS: KindMeta[] = [
  { ...KINDS[0]!, platform: true, scoped: false, emptyTitle: 'Using environment SMTP', emptyDescription: 'Password resets, invitations and organizations without their own mailer send through this provider. Until you add one, SMTP_* environment variables are used.' },
  { ...KINDS[1]!, platform: true, scoped: false, emptyTitle: 'No platform SMS provider', emptyDescription: 'A shared SMS gateway for organizations that have not connected their own. Without one, SMS form actions stay inactive.' },
  { ...KINDS[2]!, platform: true, scoped: false, emptyTitle: 'Using environment storage', emptyDescription: 'Where uploads go for organizations without their own bucket. Until you add one, STORAGE_DRIVER with S3_* / R2_* environment variables (or the local disk) are used.' },
  { ...KINDS[3]!, platform: true, scoped: false, toggleable: true, emptyTitle: 'No platform AI key', emptyDescription: 'A shared Claude, OpenAI or Gemini key that powers AI generation and editing for every organization that has not connected its own. Usage counts against each plan’s AI credits.' },
];

/** Uniform CRUD for every provider kind (dedicated tables vs the integrations table). */
export function providerApi(api: AtriumClient, meta: KindMeta) {
  if (meta.platform) {
    const p = api.admin.providers;
    return {
      list: (_orgId?: string): Promise<ProviderRecord[]> => p.list(meta.kind as 'email' | 'sms' | 'storage' | 'ai'),
      create: (_orgId: string, body: ProviderInput) => p.create({ ...body, kind: meta.kind as 'email' | 'sms' | 'storage' | 'ai' }),
      update: (id: string, body: Partial<ProviderInput>) => p.update(id, body),
      remove: (id: string) => p.remove(id),
      test: (id: string, to?: string): Promise<TestResult> => p.test(id, to ? { to } : {}),
    };
  }
  const crud = meta.kind === 'email' ? api.providers.email : meta.kind === 'sms' ? api.providers.sms : meta.kind === 'storage' ? api.providers.storage : api.providers.integrations;
  return {
    list: (orgId: string): Promise<ProviderRecord[]> => (meta.integrationKind ? crud.list(orgId, { kind: meta.integrationKind }) : crud.list(orgId)),
    create: (orgId: string, body: ProviderInput) => crud.create(orgId, meta.integrationKind ? { ...body, kind: meta.integrationKind } : body),
    update: (id: string, body: Partial<ProviderInput>) => crud.update(id, body),
    remove: (id: string) => crud.remove(id),
    test: (id: string, to?: string): Promise<TestResult> => crud.test(id, to ? { to } : {}),
  };
}

/** Keep only string masked values (the server may mask nested objects). */
export function maskedStrings(secrets: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (secrets && typeof secrets === 'object') for (const [k, v] of Object.entries(secrets as Record<string, unknown>)) if (typeof v === 'string' && v) out[k] = v;
  return out;
}

/** Only send secrets the user actually typed; omitted keys keep stored values. */
export function typedSecrets(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}
