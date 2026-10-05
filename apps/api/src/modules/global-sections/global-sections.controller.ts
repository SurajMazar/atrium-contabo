import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { NodeInputSchema, type NodeInput } from '@atrium/schema';
import { z } from 'zod';
import { Access } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { ZodBody } from '../../common/zod.pipe';
import { DraftService } from '../websites/draft.service';

const dto = (g: { id: string; name: string; node: unknown; updatedAt: Date }) => ({ id: g.id, name: g.name, node: g.node, updatedAt: g.updatedAt.toISOString() });

/** Reusable sections referenced from pages via `global-section` nodes; edits propagate everywhere. */
@Controller()
export class GlobalSectionsController {
  constructor(private readonly prisma: PrismaService, private readonly drafts: DraftService) {}

  @Access('page.read', 'website', 'id') @Get('websites/:id/global-sections')
  async list(@Param('id') id: string) {
    return (await this.prisma.client.globalSection.findMany({ where: { websiteId: id }, orderBy: { createdAt: 'asc' } })).map(dto);
  }

  @Access('page.update', 'website', 'id') @Post('websites/:id/global-sections')
  async create(@Param('id') id: string, @Body(new ZodBody(z.object({ name: z.string().trim().min(1).max(120), node: NodeInputSchema }))) b: { name: string; node: NodeInput }) {
    const { node } = this.drafts.registry.normalize(b.node);
    return dto(await this.prisma.client.globalSection.create({ data: { websiteId: id, name: b.name, node: node as object } }));
  }

  @Access('page.update', 'globalSection', 'gid') @Patch('global-sections/:gid')
  async update(@Param('gid') gid: string, @Body(new ZodBody(z.object({ name: z.string().trim().min(1).max(120).optional(), node: NodeInputSchema.optional() }))) b: { name?: string; node?: NodeInput }) {
    const node = b.node ? (this.drafts.registry.normalize(b.node).node as object) : undefined;
    return dto(await this.prisma.client.globalSection.update({ where: { id: gid }, data: { name: b.name, node } }));
  }

  @Access('page.update', 'globalSection', 'gid') @HttpCode(204) @Delete('global-sections/:gid')
  async remove(@Param('gid') gid: string) {
    await this.prisma.client.globalSection.delete({ where: { id: gid } });
  }
}
