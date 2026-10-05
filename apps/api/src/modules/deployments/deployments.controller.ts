import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Access, CurrentUser, type AuthUser } from '../../common/decorators';
import { forbidden } from '../../common/errors';
import { AccessService } from '../../common/access.service';
import { ZodBody } from '../../common/zod.pipe';
import { DeploymentsService } from './deployments.service';

@Controller()
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService, private readonly access: AccessService) {}

  @Access('deployment.read', 'website', 'id')
  @Get('websites/:id/deployments')
  list(@Param('id') id: string) {
    return this.deployments.list(id);
  }

  @Access('deployment.preview', 'website', 'id')
  @Post('websites/:id/deployments')
  async create(@Param('id') id: string, @Body(new ZodBody(z.object({ target: z.enum(['preview', 'production']), versionId: z.string().optional() }))) body: { target: 'preview' | 'production'; versionId?: string }, @CurrentUser() user: AuthUser) {
    if (body.target === 'production') await this.access.check(user, 'website', id, 'deployment.publish').catch(() => { throw forbidden('Publishing to production requires deployment.publish'); });
    return this.deployments.create(id, body, user);
  }

  @Access('deployment.read', 'deployment', 'id')
  @Get('deployments/:id')
  get(@Param('id') id: string) {
    return this.deployments.get(id);
  }

  @Access('deployment.publish', 'deployment', 'id')
  @Post('deployments/:id/redeploy')
  redeploy(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.deployments.redeploy(id, user);
  }

  @Access('deployment.publish', 'deployment', 'id')
  @Post('deployments/:id/rollback')
  rollback(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.deployments.rollback(id, user);
  }

  @Access('deployment.publish', 'deployment', 'id')
  @Post('deployments/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.deployments.cancel(id, user);
  }
}
