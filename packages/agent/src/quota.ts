import { createHash } from 'node:crypto';
import type { PrismaClient } from '@atrium/db';
import { DEFAULT_PLANS, type WebsiteDefinition } from '@atrium/schema';
import { AiLimitError } from './llm';

type Db = Pick<PrismaClient, 'organization' | 'aiUsage' | '$executeRaw'>;

export interface AiOrgPolicy {
  organizationId: string;
  suspended: boolean;
  /** Plan features with super-admin `featureFlags` overrides applied. */
  features: Set<string>;
  limits: { aiRequestsPerMonth?: number; aiTokensPerMonth?: number } & Record<string, number | undefined>;
}

export const aiPeriod = (d = new Date()) => d.toISOString().slice(0, 7);

/** Plan limits/features for an organization (org `limits` and `featureFlags` override the plan). */
export async function loadAiOrgPolicy(prisma: Pick<PrismaClient, 'organization'>, organizationId: string): Promise<AiOrgPolicy> {
  const o = await prisma.organization.findUnique({ where: { id: organizationId }, include: { plan: true } });
  if (!o) throw new AiLimitError('Organization not found', 'quota');
  const fallback = DEFAULT_PLANS.find((p) => p.key === o.planKey) ?? DEFAULT_PLANS[0]!;
  const planFeatures = o.plan?.features ?? fallback.features;
  const features = new Set<string>(planFeatures);
  for (const [k, v] of Object.entries((o.featureFlags as Record<string, unknown> | null) ?? {})) {
    if (v === true) features.add(k);
    else if (v === false) features.delete(k);
  }
  const planLimits = (o.plan?.limits as Record<string, number> | undefined) ?? (fallback.limits as unknown as Record<string, number>);
  return { organizationId, suspended: !!o.suspendedAt, features, limits: { ...planLimits, ...((o.limits as Record<string, number> | null) ?? {}) } };
}

export function aiFeatureEnabled(policy: AiOrgPolicy): boolean {
  return !policy.suspended && policy.features.has('aiBuilder');
}

const INT_MAX = 2_147_483_647;

/**
 * Atomically reserve `n` AI requests for the org's current period. A single
 * conditional UPDATE (`requests + n <= limit AND tokens < limit`) means parallel
 * callers can never exceed the plan limit. Throws AiLimitError('quota') when full.
 * Reserved requests are not counted again by `recordUsage` (see `reservedRequests`).
 */
export async function reserveAiRequests(prisma: Db, organizationId: string, limits: AiOrgPolicy['limits'], n = 1): Promise<void> {
  const period = aiPeriod();
  try {
    await prisma.aiUsage.upsert({ where: { organizationId_period: { organizationId, period } }, create: { organizationId, period }, update: {} });
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err; // concurrent create: row exists now
  }
  const reqLimit = Math.min(INT_MAX, Math.max(0, Math.floor(limits.aiRequestsPerMonth ?? INT_MAX)));
  const tokLimit = Math.max(0, Math.floor(limits.aiTokensPerMonth ?? Number.MAX_SAFE_INTEGER));
  const updated = await prisma.$executeRaw`
    UPDATE ai_usage SET requests = requests + ${n}::int
    WHERE organization_id = ${organizationId} AND period = ${period}
      AND requests + ${n}::int <= ${reqLimit}::int
      AND (input_tokens::bigint + output_tokens::bigint) < ${String(tokLimit)}::bigint`;
  if (updated === 0) throw new AiLimitError('Monthly AI request or token limit reached for your plan', 'quota');
}

export async function recordUsage(prisma: Pick<PrismaClient, 'aiUsage'>, organizationId: string, usage: { requests: number; inputTokens: number; outputTokens: number; costUsd: number; reservedRequests?: number }) {
  const period = aiPeriod();
  const requests = Math.max(0, usage.requests - (usage.reservedRequests ?? 0));
  await prisma.aiUsage.upsert({
    where: { organizationId_period: { organizationId, period } },
    create: { organizationId, period, requests, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd },
    update: { requests: { increment: requests }, inputTokens: { increment: usage.inputTokens }, outputTokens: { increment: usage.outputTokens }, costUsd: { increment: usage.costUsd } },
  });
}

// ── revert staleness ──

export interface TouchedUnits {
  /** Whole-site generation. */
  all?: boolean;
  site?: boolean;
  theme?: boolean;
  redirects?: boolean;
  globalSections?: boolean;
  pages?: string[];
  forms?: string[];
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))) : val)) ?? 'null';
}

/**
 * Fingerprint of the draft units an AI change touched. Recorded right after the change is
 * applied; if it differs at revert time, someone edited those units since and a blind revert
 * would discard their work.
 */
export function draftFingerprint(def: WebsiteDefinition, units: TouchedUnits): string {
  const pick: Record<string, unknown> = {};
  if (units.all) {
    pick.all = { ...def, schemaVersion: undefined };
  } else {
    if (units.site) pick.site = { settings: def.settings, navigation: def.navigation, header: def.header, footer: def.footer, customCss: def.customCss ?? null };
    if (units.theme) pick.theme = def.theme;
    if (units.redirects) pick.redirects = def.redirects;
    if (units.globalSections) pick.globalSections = def.globalSections;
    if (units.pages?.length) pick.pages = [...new Set(units.pages)].sort().map((id) => def.pages.find((p) => p.id === id) ?? null);
    if (units.forms?.length) pick.forms = [...new Set(units.forms)].sort().map((id) => def.forms.find((f) => f.id === id) ?? null);
  }
  return createHash('sha256').update(stable(pick)).digest('hex');
}
