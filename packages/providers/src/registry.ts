import type { z } from 'zod';
import { describeDriver, ProviderError, TENANT_CONTEXT, type DriverContext, type ProviderDriver, type ProviderKind } from './driver';
import { aiDrivers } from './ai';
import type { AIProvider } from './ai/types';
import { captchaDrivers } from './captcha';
import type { CaptchaVerifier } from './captcha/types';
import { deploymentDrivers } from './deployment';
import type { DeploymentProvider } from './deployment/types';
import { emailDrivers } from './email';
import type { EmailProvider } from './email/types';
import { searchDrivers } from './search';
import type { SearchProvider } from './search/types';
import { smsDrivers } from './sms';
import type { SmsProvider } from './sms/types';
import { storageDrivers } from './storage';
import type { StorageProvider } from './storage/types';

/** Instance type produced by drivers of each kind. */
export interface ProviderInstanceMap {
  storage: StorageProvider;
  email: EmailProvider;
  sms: SmsProvider;
  ai: AIProvider;
  deployment: DeploymentProvider;
  captcha: CaptchaVerifier;
  search: SearchProvider;
}

export type DriverOf<K extends ProviderKind> = ProviderDriver<z.ZodType, z.ZodType, ProviderInstanceMap[K]>;

/** Every built-in driver, grouped by kind. */
export const DRIVERS: { readonly [K in ProviderKind]: readonly DriverOf<K>[] } = {
  storage: storageDrivers,
  email: emailDrivers,
  sms: smsDrivers,
  ai: aiDrivers,
  deployment: deploymentDrivers,
  captcha: captchaDrivers,
  search: searchDrivers,
};

export const PROVIDER_KINDS = Object.keys(DRIVERS) as ProviderKind[];

export function getDriver<K extends ProviderKind>(kind: K, id: string): DriverOf<K> | undefined {
  return (DRIVERS[kind] as readonly DriverOf<K>[]).find((d) => d.id === id);
}

export function requireDriver<K extends ProviderKind>(kind: K, id: string): DriverOf<K> {
  const d = getDriver(kind, id);
  if (!d) throw new ProviderError(`Unknown ${kind} driver "${id}"`, id, false);
  return d;
}

export function listDrivers(kind?: ProviderKind): ProviderDriver[] {
  if (kind) return [...DRIVERS[kind]] as ProviderDriver[];
  return PROVIDER_KINDS.flatMap((k) => [...DRIVERS[k]] as ProviderDriver[]);
}

/** JSON-schema descriptions for admin forms (`GET /providers/drivers`). */
export function describeDrivers(kind?: ProviderKind) {
  return listDrivers(kind).map(describeDriver);
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ');
}

/** Validate config + secrets against the driver's schemas. Never echoes secret values. */
export function parseDriverInput<K extends ProviderKind>(kind: K, id: string, config: unknown, secrets: unknown): { driver: DriverOf<K>; config: unknown; secrets: unknown } {
  const driver = requireDriver(kind, id);
  const c = driver.configSchema.safeParse(config ?? {});
  if (!c.success) throw new ProviderError(`Invalid ${kind}/${id} config — ${formatIssues(c.error)}`, id, false);
  const s = driver.secretsSchema.safeParse(secrets ?? {});
  if (!s.success) {
    const fields = [...new Set(s.error.issues.map((i) => i.path.map(String).join('.') || '(root)'))].join(', ');
    throw new ProviderError(`Invalid ${kind}/${id} secrets — check: ${fields}`, id, false);
  }
  return { driver, config: c.data, secrets: s.data };
}

/**
 * Parse + instantiate a provider in one step. `ctx` says where the configuration came from;
 * it defaults to tenant (`public-only`) — pass `TRUSTED_CONTEXT` only for env/platform config.
 */
export function instantiateProvider<K extends ProviderKind>(kind: K, id: string, config: unknown, secrets: unknown, ctx: DriverContext = TENANT_CONTEXT): ProviderInstanceMap[K] {
  const parsed = parseDriverInput(kind, id, config, secrets);
  return parsed.driver.create(parsed.config, parsed.secrets, ctx);
}
