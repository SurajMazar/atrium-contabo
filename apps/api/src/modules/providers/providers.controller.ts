import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { ProviderKind } from '@atrium/providers';
import { z } from 'zod';
import { Access, CurrentUser, type AuthUser } from '../../common/decorators';
import { ZodBody } from '../../common/zod.pipe';
import { ProvidersService, type ProviderTable } from './providers.service';

const Body_ = z.object({
  name: z.string().trim().min(1).max(120),
  driver: z.string().min(1).max(60),
  config: z.record(z.string(), z.unknown()).default({}),
  secrets: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  websiteId: z.string().nullable().optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().max(120).optional(),
  kind: z.string().optional(),
  enabled: z.boolean().optional(),
});
type B = z.infer<typeof Body_>;

const ROUTES: Array<[string, ProviderTable, 'emailProvider' | 'smsProvider' | 'storageProvider' | 'integration']> = [
  ['email-providers', 'email', 'emailProvider'],
  ['sms-providers', 'sms', 'smsProvider'],
  ['storage-providers', 'storage', 'storageProvider'],
  ['integrations', 'integration', 'integration'],
];

@Controller()
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get('providers/drivers')
  drivers(@Query('kind') kind?: ProviderKind) {
    return this.providers.drivers(kind);
  }

  // email
  @Access('integration.manage', 'organization', 'orgId') @Get('organizations/:orgId/email-providers')
  listEmail(@Param('orgId') o: string, @Query() q: Record<string, string>) { return this.providers.list('email', o, q); }
  @Access('integration.manage', 'organization', 'orgId') @Post('organizations/:orgId/email-providers')
  createEmail(@Param('orgId') o: string, @Body(new ZodBody(Body_)) b: B, @CurrentUser() u: AuthUser) { return this.providers.create('email', o, b, u); }
  @Access('integration.manage', 'emailProvider', 'id') @Patch('email-providers/:id')
  updateEmail(@Param('id') id: string, @Body(new ZodBody(Body_.partial())) b: Partial<B>, @CurrentUser() u: AuthUser) { return this.providers.update('email', id, b, u); }
  @Access('integration.manage', 'emailProvider', 'id') @HttpCode(204) @Delete('email-providers/:id')
  removeEmail(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.providers.remove('email', id, u); }
  @Access('integration.manage', 'emailProvider', 'id') @HttpCode(200) @Post('email-providers/:id/test')
  testEmail(@Param('id') id: string, @Body(new ZodBody(z.object({ to: z.string().optional() }))) b: { to?: string }) { return this.providers.test('email', id, b); }

  // sms
  @Access('integration.manage', 'organization', 'orgId') @Get('organizations/:orgId/sms-providers')
  listSms(@Param('orgId') o: string, @Query() q: Record<string, string>) { return this.providers.list('sms', o, q); }
  @Access('integration.manage', 'organization', 'orgId') @Post('organizations/:orgId/sms-providers')
  createSms(@Param('orgId') o: string, @Body(new ZodBody(Body_)) b: B, @CurrentUser() u: AuthUser) { return this.providers.create('sms', o, b, u); }
  @Access('integration.manage', 'smsProvider', 'id') @Patch('sms-providers/:id')
  updateSms(@Param('id') id: string, @Body(new ZodBody(Body_.partial())) b: Partial<B>, @CurrentUser() u: AuthUser) { return this.providers.update('sms', id, b, u); }
  @Access('integration.manage', 'smsProvider', 'id') @HttpCode(204) @Delete('sms-providers/:id')
  removeSms(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.providers.remove('sms', id, u); }
  @Access('integration.manage', 'smsProvider', 'id') @HttpCode(200) @Post('sms-providers/:id/test')
  testSms(@Param('id') id: string, @Body(new ZodBody(z.object({ to: z.string().optional() }))) b: { to?: string }) { return this.providers.test('sms', id, b); }

  // storage
  @Access('integration.manage', 'organization', 'orgId') @Get('organizations/:orgId/storage-providers')
  listStorage(@Param('orgId') o: string, @Query() q: Record<string, string>) { return this.providers.list('storage', o, q); }
  @Access('integration.manage', 'organization', 'orgId') @Post('organizations/:orgId/storage-providers')
  createStorage(@Param('orgId') o: string, @Body(new ZodBody(Body_)) b: B, @CurrentUser() u: AuthUser) { return this.providers.create('storage', o, b, u); }
  @Access('integration.manage', 'storageProvider', 'id') @Patch('storage-providers/:id')
  updateStorage(@Param('id') id: string, @Body(new ZodBody(Body_.partial())) b: Partial<B>, @CurrentUser() u: AuthUser) { return this.providers.update('storage', id, b, u); }
  @Access('integration.manage', 'storageProvider', 'id') @HttpCode(204) @Delete('storage-providers/:id')
  removeStorage(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.providers.remove('storage', id, u); }
  @Access('integration.manage', 'storageProvider', 'id') @HttpCode(200) @Post('storage-providers/:id/test')
  testStorage(@Param('id') id: string) { return this.providers.test('storage', id, {}); }

  // integrations (ai, deployment, captcha, analytics, git)
  @Access('integration.manage', 'organization', 'orgId') @Get('organizations/:orgId/integrations')
  listIntegrations(@Param('orgId') o: string, @Query() q: Record<string, string>) { return this.providers.list('integration', o, q); }
  @Access('integration.manage', 'organization', 'orgId') @Post('organizations/:orgId/integrations')
  createIntegration(@Param('orgId') o: string, @Body(new ZodBody(Body_)) b: B, @CurrentUser() u: AuthUser) { return this.providers.create('integration', o, b, u); }
  @Access('integration.manage', 'integration', 'id') @Patch('integrations/:id')
  updateIntegration(@Param('id') id: string, @Body(new ZodBody(Body_.partial())) b: Partial<B>, @CurrentUser() u: AuthUser) { return this.providers.update('integration', id, b, u); }
  @Access('integration.manage', 'integration', 'id') @HttpCode(204) @Delete('integrations/:id')
  removeIntegration(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.providers.remove('integration', id, u); }
  @Access('integration.manage', 'integration', 'id') @HttpCode(200) @Post('integrations/:id/test')
  testIntegration(@Param('id') id: string) { return this.providers.test('integration', id, {}); }
}

export { ROUTES };
