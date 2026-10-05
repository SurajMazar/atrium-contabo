import { Injectable } from '@nestjs/common';
import { resolve as resolvePath, sep } from 'node:path';
import { describeDriver, getDriver, listDrivers, localStorageRoot, publicTestResult, secretReentryDecision, type ProviderKind } from '@atrium/providers';
import { decryptJson, mergeSecrets, serializeProviderRecord } from '@atrium/server-kit';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { badRequest, notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { ResolverService } from './resolver.service';

export type ProviderTable = 'email' | 'sms' | 'storage' | 'integration';

const INTEGRATION_KIND: Record<string, 'AI' | 'DEPLOYMENT' | 'CAPTCHA' | 'ANALYTICS' | 'GIT' | 'SEARCH' | 'OTHER'> = {
  ai: 'AI', deployment: 'DEPLOYMENT', captcha: 'CAPTCHA', analytics: 'ANALYTICS', git: 'GIT', search: 'SEARCH', other: 'OTHER',
};

export interface ProviderBody {
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

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService, private readonly resolver: ResolverService, private readonly audit: AuditService) {}

  private model(table: ProviderTable) {
    const db = this.prisma.client;
    return ({ email: db.emailProvider, sms: db.smsProvider, storage: db.storageProvider, integration: db.integration } as const)[table] as unknown as {
      findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
      findUnique(args: unknown): Promise<Record<string, unknown> | null>;
      create(args: unknown): Promise<Record<string, unknown>>;
      update(args: unknown): Promise<Record<string, unknown>>;
      updateMany(args: unknown): Promise<unknown>;
      delete(args: unknown): Promise<unknown>;
    };
  }

  drivers(kind?: ProviderKind) {
    return listDrivers(kind).map((d) => describeDriver(d));
  }

  private kindFor(table: ProviderTable, body: Pick<ProviderBody, 'kind'>, existing?: Record<string, unknown>): ProviderKind {
    if (table !== 'integration') return table;
    const k = (body.kind ?? (existing?.kind as string | undefined) ?? '').toLowerCase();
    if (!INTEGRATION_KIND[k]) throw badRequest('Integration kind is required (ai, deployment, captcha, analytics, git)');
    return k as ProviderKind;
  }

  /**
   * UPL-1: organization storage may use the `local` driver only outside production, and never
   * with a directory of its choosing (the driver jails it to LOCAL_STORAGE_DIR/orgs/<orgId>).
   * Returns the config to store (without `directory`).
   */
  private validateLocalStorage(config: Record<string, unknown>): Record<string, unknown> {
    if (process.env.NODE_ENV === 'production') throw badRequest('The local filesystem storage driver is not available for organizations. Use S3-compatible or Azure Blob storage.');
    const { directory, ...rest } = config;
    if (directory !== undefined && directory !== null && directory !== '') {
      const root = localStorageRoot(process.env);
      const dir = resolvePath(String(directory));
      if (dir !== root && !dir.startsWith(root + sep)) {
        throw validation('Invalid configuration', [{ path: 'config.directory', message: 'Organization storage cannot choose a directory; files are stored under the platform storage directory' }]);
      }
    }
    return rest;
  }

  /**
   * Validate config + secrets against the driver's schemas. Platform providers (super admin) may use
   * the local disk driver; its directory is always LOCAL_STORAGE_DIR, so a `directory` is never stored.
   */
  validate(kind: ProviderKind, driverId: string, config: Record<string, unknown>, secrets: Record<string, unknown> | null, opts: { platform?: boolean } = {}) {
    const driver = getDriver(kind, driverId);
    if (!driver) {
      if (['analytics', 'git', 'other', 'search'].includes(kind)) return { config, secrets };
      throw badRequest(`Unknown ${kind} driver "${driverId}"`);
    }
    if (kind === 'storage' && driverId === 'local') config = opts.platform ? (({ directory: _d, ...rest }) => rest)(config) : this.validateLocalStorage(config);
    const c = driver.configSchema.safeParse(config);
    if (!c.success) throw validation('Invalid configuration', c.error.issues.map((i) => ({ path: `config.${i.path.join('.')}`, message: i.message })));
    if (secrets) {
      const s = driver.secretsSchema.safeParse(secrets);
      if (!s.success) throw validation('Invalid credentials', s.error.issues.map((i) => ({ path: `secrets.${i.path.join('.')}`, message: i.message })));
    }
    const parsed = c.data as Record<string, unknown>;
    // The schema default re-adds `directory`; it is ignored for organization providers anyway.
    if (kind === 'storage' && driverId === 'local') delete parsed.directory;
    return { config: parsed, secrets };
  }

  /** Keys of the stored (encrypted) secrets; empty when none or undecryptable. */
  storedSecretKeys(enc: string | null | undefined): string[] {
    if (!enc) return [];
    try {
      const plain = decryptJson<Record<string, unknown>>(enc);
      return plain && typeof plain === 'object' ? Object.keys(plain).filter((k) => plain[k] !== undefined && plain[k] !== null && plain[k] !== '') : [];
    } catch {
      return [];
    }
  }

  async list(table: ProviderTable, orgId: string, q: { websiteId?: string; kind?: string }) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (q.websiteId && table !== 'storage') where.OR = [{ websiteId: q.websiteId }, { websiteId: null }];
    if (table === 'integration' && q.kind) where.kind = INTEGRATION_KIND[q.kind.toLowerCase()] ?? q.kind.toUpperCase();
    const rows = await this.model(table).findMany({ where, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => serializeProviderRecord(r as never));
  }

  async create(table: ProviderTable, orgId: string, body: ProviderBody, user: AuthUser) {
    const kind = this.kindFor(table, body);
    if (body.websiteId) await this.assertWebsite(orgId, body.websiteId);
    const { config } = this.validate(kind, body.driver, body.config, body.secrets ?? {});
    const secretsEnc = mergeSecrets(null, body.secrets);
    const data: Record<string, unknown> = { organizationId: orgId, name: body.name, driver: body.driver, config, secretsEnc, isDefault: !!body.isDefault };
    if (table !== 'storage') data.websiteId = body.websiteId ?? null;
    if (table === 'email') {
      if (!body.fromEmail) throw validation('From email is required');
      data.fromEmail = body.fromEmail;
      data.fromName = body.fromName ?? null;
    }
    if (table === 'integration') {
      data.kind = INTEGRATION_KIND[kind];
      data.enabled = body.enabled ?? true;
    }
    if (body.isDefault) await this.clearDefault(table, orgId, body.websiteId ?? null, data.kind as string | undefined);
    const row = await this.model(table).create({ data });
    await this.audit.log({ organizationId: orgId, websiteId: body.websiteId ?? null, actor: user, action: `${table === 'integration' ? `integration.${kind}` : `${table}`}.created`, resourceType: `${table}Provider`, resourceId: row.id as string, summary: `${user.name} added ${body.driver} ${table === 'integration' ? kind : table} provider "${body.name}"` });
    return serializeProviderRecord(row as never);
  }

  async update(table: ProviderTable, id: string, body: Partial<ProviderBody>, user: AuthUser) {
    const existing = await this.model(table).findUnique({ where: { id } });
    if (!existing) throw notFound('Provider');
    const kind = this.kindFor(table, body, existing);
    const driver = body.driver ?? (existing.driver as string);
    const mergedConfig = { ...(existing.config as object), ...(body.config ?? {}) } as Record<string, unknown>;
    const { config } = this.validate(kind, driver, mergedConfig, null);
    // INT-1: re-entering credentials is mandatory when the destination they are sent to changes.
    const reentry = secretReentryDecision({
      existingDriver: existing.driver as string,
      nextDriver: driver,
      existingConfig: existing.config as Record<string, unknown>,
      nextConfig: mergedConfig,
      existingSecretKeys: this.storedSecretKeys(existing.secretsEnc as string | null),
      incomingSecrets: body.secrets,
    });
    if (!reentry.ok) {
      throw validation(
        `Re-enter the credentials: changing ${reentry.changed.join(', ')} requires the secrets to be provided again`,
        reentry.missing.map((k) => ({ path: `secrets.${k}`, message: 'Re-enter this value (stored secrets are not reused when the endpoint or driver changes)' })),
      );
    }
    // Driver change: the old secrets belong to another service — start from the incoming ones only.
    const secretsEnc = reentry.replaceSecrets ? mergeSecrets(null, body.secrets ?? {}) : body.secrets ? mergeSecrets(existing.secretsEnc as string | null, body.secrets) : existing.secretsEnc;
    const data: Record<string, unknown> = { name: body.name, driver, config, secretsEnc, isDefault: body.isDefault };
    if (table === 'email') Object.assign(data, { fromEmail: body.fromEmail, fromName: body.fromName });
    if (table === 'integration' && body.enabled !== undefined) data.enabled = body.enabled;
    if (body.isDefault) await this.clearDefault(table, existing.organizationId as string, (existing.websiteId as string | null) ?? null, existing.kind as string | undefined, id);
    const row = await this.model(table).update({ where: { id }, data });
    await this.audit.log({ organizationId: existing.organizationId as string, actor: user, action: table === 'email' ? 'smtp.changed' : `${table}.updated`, resourceType: `${table}Provider`, resourceId: id, summary: `${user.name} updated provider "${row.name}"`, metadata: { secretsChanged: !!body.secrets } });
    this.resolver.resolver.invalidate?.(id);
    return serializeProviderRecord(row as never);
  }

  private async clearDefault(table: ProviderTable, orgId: string, websiteId: string | null, kind: string | undefined, exceptId?: string) {
    const where: Record<string, unknown> = { organizationId: orgId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) };
    if (table !== 'storage') where.websiteId = websiteId;
    if (kind) where.kind = kind;
    await this.model(table).updateMany({ where, data: { isDefault: false } });
  }

  private async assertWebsite(orgId: string, websiteId: string) {
    const w = await this.prisma.client.website.findFirst({ where: { id: websiteId, organizationId: orgId } });
    if (!w) throw badRequest('Website not found in this organization');
  }

  async remove(table: ProviderTable, id: string, user: AuthUser) {
    const existing = await this.model(table).findUnique({ where: { id } });
    if (!existing) throw notFound('Provider');
    await this.model(table).delete({ where: { id } });
    this.resolver.resolver.invalidate?.(id);
    await this.audit.log({ organizationId: existing.organizationId as string, actor: user, action: `${table}.deleted`, resourceType: `${table}Provider`, resourceId: id, summary: `${user.name} removed provider "${existing.name as string}"` });
  }

  async test(table: ProviderTable, id: string, body: { to?: string }) {
    const row = await this.model(table).findUnique({ where: { id } });
    if (!row) throw notFound('Provider');
    const r = this.resolver.resolver;
    const scope = { organizationId: row.organizationId as string, websiteId: (row.websiteId as string | null) ?? undefined, providerId: id };
    let result: { ok: boolean; message: string; details?: Record<string, unknown> };
    let localResult = false;
    try {
      if (table === 'email') result = await (await r.email(scope)).test(body.to);
      else if (table === 'sms') result = await (await r.sms(scope)).test(body.to);
      else if (table === 'storage') result = await (await r.storage(scope)).test();
      else {
        const kind = String(row.kind).toLowerCase();
        if (kind === 'ai') result = await (await r.ai(scope)).test();
        else if (kind === 'deployment') result = await (await r.deployment(scope)).test();
        else if (kind === 'captcha') {
          const cfg = row.config as { siteKey?: string };
          result = cfg.siteKey && row.secretsEnc ? { ok: true, message: 'Site key and secret are configured. Submit a form to verify end to end.' } : { ok: false, message: 'Site key or secret key is missing' };
          localResult = true;
        } else result = { ok: true, message: 'Saved' };
      }
    } catch (err) {
      result = { ok: false, message: (err as Error).message };
    }
    // SSRF-1: never echo remote response bodies / banners in production (status/code only).
    if (!localResult) result = publicTestResult(result);
    await this.model(table).update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: result.ok } });
    return result;
  }
}
