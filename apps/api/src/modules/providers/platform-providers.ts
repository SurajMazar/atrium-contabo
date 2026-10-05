import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { publicTestResult, secretReentryDecision } from '@atrium/providers';
import { mergeSecrets, PLATFORM_PROVIDER_KINDS, serializeProviderRecord, type PlatformProviderKind, type PlatformProviderRow } from '@atrium/server-kit';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { CurrentUser, SuperAdminOnly, type AppRequest, type AuthUser } from '../../common/decorators';
import { badRequest, notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { ZodBody } from '../../common/zod.pipe';
import { ProvidersService } from './providers.service';
import { ResolverService } from './resolver.service';

const Kind = z.enum(PLATFORM_PROVIDER_KINDS as [PlatformProviderKind, ...PlatformProviderKind[]]);
const Body_ = z.object({
  kind: Kind,
  name: z.string().trim().min(1).max(120),
  driver: z.string().min(1).max(60),
  config: z.record(z.string(), z.unknown()).default({}),
  secrets: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().max(120).optional(),
});
type B = z.infer<typeof Body_>;

/**
 * Platform providers: email (password resets, invitations, and organizations without their own
 * mailer), SMS, storage and the shared AI key — configured from the super-admin panel instead of env.
 * Secrets are encrypted at rest and only ever returned masked. Env variables stay as the last fallback.
 */
@Injectable()
export class PlatformProvidersService {
  constructor(private readonly prisma: PrismaService, private readonly providers: ProvidersService, private readonly resolver: ResolverService, private readonly audit: AuditService) {}

  private get db() {
    return this.prisma.client;
  }

  private dto(row: PlatformProviderRow & { lastTestedAt?: Date | null; lastTestOk?: boolean | null; createdAt?: Date }) {
    return serializeProviderRecord({ ...row, organizationId: null, websiteId: null } as never);
  }

  async list(kind?: PlatformProviderKind) {
    const rows = await this.db.platformProvider.findMany({ where: kind ? { kind } : {}, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((r) => this.dto(r));
  }

  async status() {
    return this.resolver.resolver.platformStatus();
  }

  private async clearDefault(kind: string, exceptId?: string) {
    await this.db.platformProvider.updateMany({ where: { kind, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isDefault: false } });
  }

  async create(body: B, user: AuthUser, req: AppRequest) {
    if (body.kind === 'email' && !body.fromEmail) throw validation('From email is required');
    const { config } = this.providers.validate(body.kind, body.driver, body.config, body.secrets ?? {}, { platform: true });
    // The first provider of a kind becomes the default automatically.
    const isDefault = body.isDefault ?? (await this.db.platformProvider.count({ where: { kind: body.kind } })) === 0;
    if (isDefault) await this.clearDefault(body.kind);
    const row = await this.db.platformProvider.create({
      data: { kind: body.kind, name: body.name, driver: body.driver, config: config as object, secretsEnc: mergeSecrets(null, body.secrets), isDefault, enabled: body.enabled ?? true, fromEmail: body.fromEmail ?? null, fromName: body.fromName ?? null },
    });
    await this.audit.log({ actor: user, action: `platform.provider_created`, resourceType: 'platformProvider', resourceId: row.id, summary: `Super admin ${user.name} added platform ${body.kind} provider "${body.name}" (${body.driver})`, req });
    return this.dto(row);
  }

  async update(id: string, body: Partial<B>, user: AuthUser, req: AppRequest) {
    const existing = await this.db.platformProvider.findUnique({ where: { id } });
    if (!existing) throw notFound('Provider');
    if (body.kind && body.kind !== existing.kind) throw badRequest('The kind of a provider cannot change');
    const driver = body.driver ?? existing.driver;
    const mergedConfig = { ...(existing.config as object), ...(body.config ?? {}) } as Record<string, unknown>;
    const { config } = this.providers.validate(existing.kind as PlatformProviderKind, driver, mergedConfig, null, { platform: true });
    const reentry = secretReentryDecision({
      existingDriver: existing.driver,
      nextDriver: driver,
      existingConfig: existing.config as Record<string, unknown>,
      nextConfig: mergedConfig,
      existingSecretKeys: this.providers.storedSecretKeys(existing.secretsEnc),
      incomingSecrets: body.secrets,
    });
    if (!reentry.ok) {
      throw validation(
        `Re-enter the credentials: changing ${reentry.changed.join(', ')} requires the secrets to be provided again`,
        reentry.missing.map((k) => ({ path: `secrets.${k}`, message: 'Re-enter this value (stored secrets are not reused when the endpoint or driver changes)' })),
      );
    }
    const secretsEnc = reentry.replaceSecrets ? mergeSecrets(null, body.secrets ?? {}) : body.secrets ? mergeSecrets(existing.secretsEnc, body.secrets) : existing.secretsEnc;
    if (body.isDefault) await this.clearDefault(existing.kind, id);
    const row = await this.db.platformProvider.update({
      where: { id },
      data: { name: body.name, driver, config: config as object, secretsEnc, isDefault: body.isDefault, enabled: body.enabled, fromEmail: body.fromEmail, fromName: body.fromName },
    });
    this.resolver.resolver.invalidate?.(id);
    await this.audit.log({ actor: user, action: 'platform.provider_updated', resourceType: 'platformProvider', resourceId: id, summary: `Super admin ${user.name} updated platform provider "${row.name}"`, metadata: { secretsChanged: !!body.secrets }, req });
    return this.dto(row);
  }

  async remove(id: string, user: AuthUser, req: AppRequest) {
    const existing = await this.db.platformProvider.findUnique({ where: { id } });
    if (!existing) throw notFound('Provider');
    await this.db.platformProvider.delete({ where: { id } });
    // Keep a default when others of the same kind remain.
    if (existing.isDefault) {
      const next = await this.db.platformProvider.findFirst({ where: { kind: existing.kind }, orderBy: { createdAt: 'asc' } });
      if (next) await this.db.platformProvider.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    this.resolver.resolver.invalidate?.(id);
    await this.audit.log({ actor: user, action: 'platform.provider_deleted', resourceType: 'platformProvider', resourceId: id, summary: `Super admin ${user.name} removed platform provider "${existing.name}"`, req });
  }

  async test(id: string, body: { to?: string }) {
    const row = await this.db.platformProvider.findUnique({ where: { id } });
    if (!row) throw notFound('Provider');
    const kind = row.kind as PlatformProviderKind;
    let result: { ok: boolean; message: string; details?: Record<string, unknown> };
    try {
      const inst = this.resolver.resolver.platformInstance(kind, row) as unknown as { test(to?: string): Promise<typeof result> };
      result = kind === 'email' || kind === 'sms' ? await inst.test(body.to) : await inst.test();
    } catch (err) {
      result = { ok: false, message: (err as Error).message };
    }
    result = publicTestResult(result);
    await this.db.platformProvider.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: result.ok } });
    return result;
  }
}

/** Super-admin endpoints for platform providers. */
@SuperAdminOnly()
@Controller('admin/providers')
export class PlatformProvidersController {
  constructor(private readonly svc: PlatformProvidersService) {}

  @Get()
  list(@Query('kind') kind?: string) {
    return this.svc.list(kind ? Kind.parse(kind) : undefined);
  }

  @Get('status')
  status() {
    return this.svc.status();
  }

  @Post()
  create(@Body(new ZodBody(Body_)) b: B, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.svc.create(b, user, req);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodBody(Body_.partial())) b: Partial<B>, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.svc.update(id, b, user, req);
  }

  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.svc.remove(id, user, req);
  }

  @HttpCode(200)
  @Post(':id/test')
  test(@Param('id') id: string, @Body(new ZodBody(z.object({ to: z.string().max(254).optional() }))) b: { to?: string }) {
    return this.svc.test(id, b);
  }
}
