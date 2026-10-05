import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Access, CurrentUser, type AuthUser } from '../../common/decorators';
import { ZodBody } from '../../common/zod.pipe';
import { DomainsService } from './domains.service';

@Controller()
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Access('website.read', 'website', 'id')
  @Get('websites/:id/domains')
  list(@Param('id') id: string) {
    return this.domains.list(id);
  }

  @Access('domain.manage', 'website', 'id')
  @Post('websites/:id/domains')
  add(@Param('id') id: string, @Body(new ZodBody(z.object({ hostname: z.string().min(3).max(253) }))) body: { hostname: string }, @CurrentUser() user: AuthUser) {
    return this.domains.add(id, body.hostname, user);
  }

  @Access('domain.manage', 'domain', 'id')
  @Patch('domains/:id')
  update(@Param('id') id: string, @Body(new ZodBody(z.object({ isPrimary: z.boolean().optional(), redirectToPrimary: z.boolean().optional() }))) body: { isPrimary?: boolean; redirectToPrimary?: boolean }) {
    return this.domains.update(id, body);
  }

  @Access('domain.manage', 'domain', 'id')
  @HttpCode(204)
  @Delete('domains/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.domains.remove(id, user);
  }

  @Access('domain.manage', 'domain', 'id')
  @HttpCode(200)
  @Post('domains/:id/verify')
  verify(@Param('id') id: string) {
    return this.domains.verify(id);
  }
}
