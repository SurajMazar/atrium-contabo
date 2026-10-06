import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Access, CurrentAccess, CurrentUser, type AccessContext, type AuthUser } from '../../common/decorators';
import { badRequest } from '../../common/errors';
import { ZodBody } from '../../common/zod.pipe';
import { PublishingService } from './publishing.service';

@Controller('websites/:id')
export class PublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Access('page.read', 'website', 'id')
  @HttpCode(200)
  @Post('validate')
  validate(@Param('id') id: string) {
    return this.publishing.validate(id);
  }

  @Access('page.publish', 'website', 'id')
  @HttpCode(200)
  @Post('publish')
  publish(@Param('id') id: string, @Body(new ZodBody(z.object({ message: z.string().max(300).optional() }))) body: { message?: string }, @CurrentUser() user: AuthUser) {
    return this.publishing.publish(id, body, user);
  }

  @Access('page.read', 'website', 'id')
  @Get('versions')
  versions(@Param('id') id: string) {
    return this.publishing.versions(id);
  }

  @Access('page.read', 'website', 'id')
  @Get('versions/compare')
  compare(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) throw badRequest('from and to are required');
    return this.publishing.compare(id, from, to);
  }

  @Access('page.read', 'website', 'id')
  @Get('versions/:versionId')
  version(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.publishing.version(id, versionId);
  }

  @Access('page.update', 'website', 'id')
  @HttpCode(204)
  @Post('versions/:versionId/restore')
  restore(@Param('id') id: string, @Param('versionId') versionId: string, @CurrentUser() user: AuthUser, @CurrentAccess() access: AccessContext) {
    return this.publishing.restore(id, versionId, user, access);
  }

  @Access('page.publish', 'website', 'id')
  @HttpCode(200)
  @Post('versions/:versionId/publish')
  republish(@Param('id') id: string, @Param('versionId') versionId: string, @CurrentUser() user: AuthUser) {
    return this.publishing.republish(id, versionId, user);
  }

  @Access('page.read', 'website', 'id')
  @Get('preview-tokens')
  tokens(@Param('id') id: string) {
    return this.publishing.previewTokens(id);
  }

  @Access('page.update', 'website', 'id')
  @Post('preview-tokens')
  createToken(@Param('id') id: string, @Body(new ZodBody(z.object({ expiresInHours: z.number().min(1).max(24 * 90).optional(), password: z.string().min(8).max(100).optional(), label: z.string().max(80).optional() }))) body: { expiresInHours?: number; password?: string; label?: string }, @CurrentUser() user: AuthUser) {
    return this.publishing.createPreviewToken(id, body, user);
  }

  @Access('page.update', 'website', 'id')
  @HttpCode(204)
  @Delete('preview-tokens/:tokenId')
  revokeToken(@Param('id') id: string, @Param('tokenId') tokenId: string) {
    return this.publishing.revokePreviewToken(id, tokenId);
  }
}
