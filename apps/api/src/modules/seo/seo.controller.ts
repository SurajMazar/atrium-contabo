import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { analyzePageSeo, findRedirectLoops, scanBrokenLinks } from '@atrium/builder-core';
import { RedirectSchema, createId } from '@atrium/schema';
import { z } from 'zod';
import { Access, CurrentUser, type AuthUser } from '../../common/decorators';
import { validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { ZodBody } from '../../common/zod.pipe';
import { DraftService } from '../websites/draft.service';

const Redirects = z.object({ redirects: z.array(RedirectSchema.extend({ id: z.string().optional() })).max(5000) });

@Controller('websites/:id')
export class SeoController {
  constructor(private readonly drafts: DraftService, private readonly prisma: PrismaService) {}

  @Access('page.read', 'website', 'id') @Get('seo')
  async seo(@Param('id') id: string) {
    const { definition } = await this.drafts.load(id);
    return definition.pages.filter((p) => p.status !== 'archived').map((p) => ({ pageId: p.id, title: p.title, slug: p.slug, report: analyzePageSeo(p, definition) }));
  }

  @Access('page.read', 'website', 'id') @Get('redirects')
  async redirects(@Param('id') id: string) {
    return (await this.drafts.load(id)).definition.redirects;
  }

  @Access('redirect.manage', 'website', 'id') @Put('redirects')
  async saveRedirects(@Param('id') id: string, @Body(new ZodBody(Redirects)) b: z.infer<typeof Redirects>, @CurrentUser() user: AuthUser) {
    const redirects = b.redirects.map((r) => ({ ...r, id: r.id ?? createId(), source: r.source.replace(/\/+$/, '') || '/' }));
    const sources = redirects.map((r) => r.source);
    const dup = sources.find((s, i) => sources.indexOf(s) !== i);
    if (dup) throw validation(`Duplicate source ${dup}`);
    const loops = findRedirectLoops(redirects);
    if (loops.length) throw validation(`Redirect loop detected: ${loops.map((l) => l.join(' → ')).join('; ')}`, { loops, sources: [...new Set(loops.flat())] });
    const res = await this.drafts.transform(id, (d) => void (d.redirects = redirects), { userId: user.id });
    return res.after.redirects;
  }

  @Access('page.read', 'website', 'id') @Get('links')
  async links(@Param('id') id: string) {
    return scanBrokenLinks((await this.drafts.load(id)).definition);
  }
}
