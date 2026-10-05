import { Controller, Get, Param, Query } from '@nestjs/common';
import { Access } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';

const top = <T extends string>(rows: Array<Record<T, string | null> & { _count: number }>, key: T, label: string) => rows.filter((r) => r[key]).sort((a, b) => b._count - a._count).slice(0, 10).map((r) => ({ [label]: r[key], visits: r._count }));

@Controller('websites/:id')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Access('analytics.read', 'website', 'id') @Get('analytics')
  async analytics(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    const db = this.prisma.client;
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86_400_000);
    const where = { websiteId: id, createdAt: { gte: start, lte: end } };
    const [pv, visitors, sessions, conversions, pages, refs, countries, devices, forms, raw] = await Promise.all([
      db.analyticsEvent.count({ where: { ...where, type: 'pageview' } }),
      db.analyticsEvent.findMany({ where: { ...where, type: 'pageview' }, distinct: ['visitorHash'], select: { visitorHash: true } }),
      db.analyticsEvent.findMany({ where: { ...where, type: 'pageview' }, distinct: ['sessionHash'], select: { sessionHash: true } }),
      db.analyticsEvent.count({ where: { ...where, type: 'conversion' } }),
      db.analyticsEvent.groupBy({ by: ['path'], where: { ...where, type: 'pageview' }, _count: true }),
      db.analyticsEvent.groupBy({ by: ['referrer'], where: { ...where, type: 'pageview' }, _count: true }),
      db.analyticsEvent.groupBy({ by: ['country'], where: { ...where, type: 'pageview' }, _count: true }),
      db.analyticsEvent.groupBy({ by: ['device'], where: { ...where, type: 'pageview' }, _count: true }),
      db.formSubmission.groupBy({ by: ['formId'], where: { websiteId: id, createdAt: { gte: start, lte: end }, status: { not: 'SPAM' } }, _count: true }),
      db.analyticsEvent.findMany({ where: { ...where, type: 'pageview' }, select: { createdAt: true, visitorHash: true } }),
    ]);
    const formNames = new Map((await db.form.findMany({ where: { id: { in: forms.map((f) => f.formId) } }, select: { id: true, name: true } })).map((f) => [f.id, f.name]));
    const series = new Map<string, { pageviews: number; visitors: Set<string> }>();
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) series.set(new Date(t).toISOString().slice(0, 10), { pageviews: 0, visitors: new Set() });
    for (const e of raw) {
      const k = e.createdAt.toISOString().slice(0, 10);
      const s = series.get(k) ?? { pageviews: 0, visitors: new Set<string>() };
      s.pageviews++;
      s.visitors.add(e.visitorHash);
      series.set(k, s);
    }
    return {
      totals: { pageviews: pv, visitors: visitors.length, sessions: sessions.length, conversions, conversionRate: visitors.length ? Math.round((conversions / visitors.length) * 1000) / 10 : 0 },
      series: [...series.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, s]) => ({ date, pageviews: s.pageviews, visitors: s.visitors.size })),
      topPages: pages.sort((a, b) => b._count - a._count).slice(0, 10).map((p) => ({ path: p.path, pageviews: p._count })),
      referrers: top(refs as never, 'referrer' as never, 'referrer'),
      countries: top(countries as never, 'country' as never, 'country'),
      devices: top(devices as never, 'device' as never, 'device'),
      forms: forms.map((f) => ({ formId: f.formId, name: formNames.get(f.formId) ?? 'Form', submissions: f._count })),
    };
  }
}
