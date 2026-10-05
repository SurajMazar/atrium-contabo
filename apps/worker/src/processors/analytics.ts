import type { JobPayload } from '@atrium/server-kit';
import type { JobInfo, WorkerContext } from '../context';

export interface DailyBreakdown {
  topPages: Array<{ path: string; views: number; visitors: number }>;
  referrers: Array<{ source: string; visits: number }>;
  countries: Array<{ country: string; visitors: number }>;
  devices: Array<{ device: string; visitors: number }>;
  browsers: Array<{ browser: string; visitors: number }>;
  events: Array<{ name: string; count: number }>;
  conversions: Array<{ name: string; count: number }>;
}

/** UTC day bounds for `YYYY-MM-DD`. */
export function dayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error(`Invalid date ${date}`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Referrer URL → host (direct traffic and self-referrals are bucketed). */
export function referrerSource(ref: string | null): string {
  if (!ref) return '(direct)';
  try {
    return new URL(ref).hostname.replace(/^www\./, '') || '(direct)';
  } catch {
    return ref.slice(0, 100);
  }
}

const LIMIT = 10;
const count = (n: bigint | number) => Number(n);

/**
 * `analytics.rollup` — aggregate AnalyticsEvent → AnalyticsDaily per website/day: pageviews,
 * unique visitors (daily-rotating visitor hash), sessions, conversions (events of type
 * `conversion`) and a breakdown of top pages, referrers, countries, devices, browsers, events.
 * Default dates: yesterday + today (UTC) so late events are folded in; runs hourly.
 */
export async function processAnalyticsRollup(ctx: WorkerContext, data: JobPayload<'analytics.rollup'>, _job: JobInfo) {
  const today = ctx.now();
  const dates = data.date ? [data.date] : [utcDate(new Date(today.getTime() - 86_400_000)), utcDate(today)];
  let rows = 0;
  for (const date of dates) {
    const { start, end } = dayRange(date);
    const websites = data.websiteId
      ? [{ website_id: data.websiteId }]
      : await ctx.prisma.$queryRaw<Array<{ website_id: string }>>`SELECT DISTINCT website_id FROM analytics_events WHERE created_at >= ${start} AND created_at < ${end}`;
    for (const { website_id: websiteId } of websites) {
      const [totals] = await ctx.prisma.$queryRaw<Array<{ pageviews: bigint; visitors: bigint; sessions: bigint; conversions: bigint }>>`
        SELECT COUNT(*) FILTER (WHERE type = 'pageview') AS pageviews,
               COUNT(DISTINCT visitor_hash) FILTER (WHERE visitor_hash <> 'anon') AS visitors,
               COUNT(DISTINCT session_hash) FILTER (WHERE session_hash <> 'anon') AS sessions,
               COUNT(*) FILTER (WHERE type = 'conversion') AS conversions
        FROM analytics_events WHERE website_id = ${websiteId} AND created_at >= ${start} AND created_at < ${end}`;
      const topPages = await ctx.prisma.$queryRaw<Array<{ path: string; views: bigint; visitors: bigint }>>`
        SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors FROM analytics_events
        WHERE website_id = ${websiteId} AND type = 'pageview' AND created_at >= ${start} AND created_at < ${end}
        GROUP BY path ORDER BY views DESC, path ASC LIMIT ${LIMIT}`;
      const refs = await ctx.prisma.$queryRaw<Array<{ referrer: string | null; visits: bigint }>>`
        SELECT referrer, COUNT(DISTINCT session_hash) AS visits FROM analytics_events
        WHERE website_id = ${websiteId} AND type = 'pageview' AND created_at >= ${start} AND created_at < ${end}
        GROUP BY referrer ORDER BY visits DESC LIMIT 200`;
      const dim = async (column: 'country' | 'device' | 'browser') => {
        const res = await ctx.prisma.$queryRawUnsafe<Array<{ value: string | null; visitors: bigint }>>(
          `SELECT ${column} AS value, COUNT(DISTINCT visitor_hash) AS visitors FROM analytics_events WHERE website_id = $1 AND created_at >= $2 AND created_at < $3 GROUP BY ${column} ORDER BY visitors DESC LIMIT ${LIMIT}`,
          websiteId,
          start,
          end,
        );
        return res.map((r) => ({ value: r.value ?? 'unknown', visitors: count(r.visitors) }));
      };
      const named = await ctx.prisma.$queryRaw<Array<{ type: string; name: string; count: bigint }>>`
        SELECT type, name, COUNT(*) AS count FROM analytics_events
        WHERE website_id = ${websiteId} AND type IN ('event', 'conversion') AND name IS NOT NULL AND created_at >= ${start} AND created_at < ${end}
        GROUP BY type, name ORDER BY count DESC LIMIT 50`;

      const referrerMap = new Map<string, number>();
      for (const r of refs) {
        const src = referrerSource(r.referrer);
        referrerMap.set(src, (referrerMap.get(src) ?? 0) + count(r.visits));
      }
      const breakdown: DailyBreakdown = {
        topPages: topPages.map((p) => ({ path: p.path, views: count(p.views), visitors: count(p.visitors) })),
        referrers: [...referrerMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, LIMIT).map(([source, visits]) => ({ source, visits })),
        countries: (await dim('country')).map((r) => ({ country: r.value, visitors: r.visitors })),
        devices: (await dim('device')).map((r) => ({ device: r.value, visitors: r.visitors })),
        browsers: (await dim('browser')).map((r) => ({ browser: r.value, visitors: r.visitors })),
        events: named.filter((n) => n.type === 'event').slice(0, LIMIT).map((n) => ({ name: n.name, count: count(n.count) })),
        conversions: named.filter((n) => n.type === 'conversion').slice(0, LIMIT).map((n) => ({ name: n.name, count: count(n.count) })),
      };
      const values = {
        pageviews: count(totals?.pageviews ?? 0),
        visitors: count(totals?.visitors ?? 0),
        sessions: count(totals?.sessions ?? 0),
        conversions: count(totals?.conversions ?? 0),
        breakdown: breakdown as unknown as object,
      };
      await ctx.prisma.analyticsDaily.upsert({ where: { websiteId_date: { websiteId, date: start } }, create: { websiteId, date: start, ...values }, update: values });
      rows++;
    }
  }
  ctx.logger.info({ dates, rows }, 'analytics rolled up');
  return { dates, rows };
}
