import { Injectable, Logger } from '@nestjs/common';
import { FormDefinitionSchema, validateSubmission, type FormDefinition, type SiteSnapshot } from '@atrium/schema';
import { formFromRow } from '@atrium/site-store';
import { createHash } from 'node:crypto';
import { env } from '../../config/env';
import { ApiError, notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { RedisService } from '../../common/redis.service';
import { ResolverService } from '../providers/resolver.service';
import { PublishingService } from '../publishing/publishing.service';
import { spamScore } from './spam';

export interface UploadedPart {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const dayStamp = () => new Date().toISOString().slice(0, 10);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class PublicService {
  private readonly logger = new Logger('Public');
  constructor(
    private readonly prisma: PrismaService,
    private readonly publishing: PublishingService,
    private readonly redis: RedisService,
    private readonly queues: QueueService,
    private readonly resolver: ResolverService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** Host → website. Platform subdomains `{slug}.{PLATFORM_SITES_DOMAIN}`, custom domains, or a bare slug. */
  async websiteForHost(rawHost: string) {
    const host = rawHost.toLowerCase().trim().replace(/\.$/, '');
    const platform = env().PLATFORM_SITES_DOMAIN.toLowerCase();
    const platformNoPort = platform.split(':')[0]!;
    const hostNoPort = host.split(':')[0]!;
    let slug: string | null = null;
    if (host.endsWith(`.${platform}`)) slug = host.slice(0, -(platform.length + 1));
    else if (hostNoPort.endsWith(`.${platformNoPort}`)) slug = hostNoPort.slice(0, -(platformNoPort.length + 1));
    else if (!host.includes('.') && !host.includes(':')) slug = host;
    if (slug) return this.db.website.findFirst({ where: { slug, deletedAt: null, status: { not: 'SUSPENDED' } } });
    const domain = await this.db.domain.findUnique({ where: { hostname: hostNoPort }, include: { website: true } });
    if (!domain || domain.website.deletedAt || domain.website.status === 'SUSPENDED') return null;
    return domain.website;
  }

  async resolve(host: string): Promise<SiteSnapshot & { etag: string }> {
    const site = await this.websiteForHost(host);
    if (!site?.publishedVersionId) throw notFound('Site');
    const v = await this.db.websiteVersion.findUniqueOrThrow({ where: { id: site.publishedVersionId } });
    return { ...(v.snapshot as unknown as SiteSnapshot), etag: `"${v.checksum.slice(0, 32)}-${v.number}"` };
  }

  /** Caddy/edge on-demand TLS: allow certificates only for hosts we serve. */
  async domainAllowed(domain: string) {
    // Any connected domain (or platform subdomain) may obtain a certificate; unknown hosts never do.
    return !!(await this.websiteForHost(domain));
  }

  private async rateLimit(key: string, perMinute: number) {
    const k = `rl:form:${key}`;
    const n = await this.redis.client.incr(k);
    if (n === 1) await this.redis.client.expire(k, 60);
    if (n > perMinute) throw new ApiError(429, 'RATE_LIMITED', 'Too many submissions. Please wait a minute and try again.');
  }

  async submit(formId: string, body: { values?: Record<string, unknown>; captchaToken?: string; _hp?: string; _ts?: number; pageUrl?: string; locale?: string } & Record<string, unknown>, meta: { ip?: string; userAgent?: string; referrer?: string; origin?: string }, files: UploadedPart[] = []) {
    const row = await this.db.form.findFirst({ where: { id: formId, archivedAt: null }, include: { fields: true, rules: true, website: { select: { id: true, organizationId: true, status: true, deletedAt: true } } } });
    if (!row || row.website.deletedAt || row.website.status === 'SUSPENDED') throw notFound('Form');
    const form: FormDefinition = FormDefinitionSchema.parse(formFromRow(row));
    const ipHash = meta.ip ? sha(`${meta.ip}|${env().ANALYTICS_SALT}`) : undefined;
    await this.rateLimit(`${formId}:${ipHash ?? 'anon'}`, form.settings.rateLimitPerMinute);

    // multipart sends fields flat; JSON sends { values }
    const values: Record<string, unknown> = { ...(body.values ?? Object.fromEntries(Object.entries(body).filter(([k]) => !k.startsWith('_') && !['captchaToken', 'pageUrl', 'locale', 'values', 'g-recaptcha-response', 'cf-turnstile-response', 'h-captcha-response'].includes(k)))) };
    const honeypot = form.settings.honeypot && typeof body._hp === 'string' && body._hp.trim().length > 0;

    // captcha
    let captchaScore: number | undefined;
    const c = form.settings.captcha;
    if (c.provider !== 'none' && !honeypot) {
      const token = body.captchaToken ?? (body['g-recaptcha-response'] as string) ?? (body['cf-turnstile-response'] as string) ?? (body['h-captcha-response'] as string);
      if (!token) throw validation('Please complete the verification challenge', [{ field: '_captcha', message: 'Verification required' }]);
      const verifier = await this.resolver.resolver.captcha({ organizationId: row.website.organizationId, websiteId: row.websiteId, integrationId: c.integrationId, kind: c.provider }).catch((err: Error) => {
        this.logger.warn(`captcha not configured for form ${formId}: ${err.message}`);
        throw new ApiError(424, 'NOT_CONFIGURED', 'This form is temporarily unavailable. Please contact us another way.');
      });
      const res = await verifier.verify({ token, remoteIp: meta.ip, action: c.provider === 'recaptcha-v3' ? c.action : undefined, minScore: c.minScore });
      if (!res.success) throw validation('Verification failed. Please try again.', [{ field: '_captcha', message: 'Verification failed', codes: res.errorCodes }]);
      captchaScore = res.score;
    }

    // attach uploaded files (stored privately)
    const fileFields = new Set(form.fields.filter((f) => f.type === 'file').map((f) => f.name));
    const uploads: Record<string, Array<{ key: string; filename: string; size: number; mimeType: string }>> = {};
    if (files.length) {
      const storage = await this.resolver.resolver.storage({ organizationId: row.website.organizationId });
      for (const f of files) {
        if (!fileFields.has(f.fieldname)) continue;
        const def = form.fields.find((x) => x.name === f.fieldname)!;
        const maxMb = def.validation?.maxFileSizeMb ?? 10;
        if (f.size > maxMb * 1_048_576) throw validation(`${def.label}: file is larger than ${maxMb} MB`, [{ field: f.fieldname, message: `Max ${maxMb} MB` }]);
        if (def.validation?.accept?.length && !def.validation.accept.some((a) => (a.endsWith('/*') ? f.mimetype.startsWith(a.slice(0, -1)) : a.startsWith('.') ? f.originalname.toLowerCase().endsWith(a) : f.mimetype === a))) throw validation(`${def.label}: file type not allowed`, [{ field: f.fieldname, message: 'File type not allowed' }]);
        const key = `private/submissions/${row.websiteId}/${dayStamp()}/${sha(`${f.originalname}${Date.now()}${Math.random()}`).slice(0, 16)}-${f.originalname.replace(/[^\w.-]+/g, '_').slice(-80)}`;
        await storage.upload({ key, body: f.buffer, contentType: f.mimetype, visibility: 'private' });
        (uploads[f.fieldname] ??= []).push({ key, filename: f.originalname, size: f.size, mimeType: f.mimetype });
      }
      Object.assign(values, uploads);
    }

    const result = validateSubmission(form, values);
    if (!result.valid && !honeypot) throw validation('Please check the highlighted fields', result.errors);

    const elapsedMs = typeof body._ts === 'number' ? Date.now() - body._ts : undefined;
    const score = spamScore(result.values, { honeypot, captchaScore, elapsedMs });
    const isSpam = honeypot || score >= 0.8;

    const labels = new Map(form.fields.map((f) => [f.name, f]));
    const summary = Object.fromEntries(Object.entries(result.values).slice(0, 6).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : v]));
    const submission = await this.db.formSubmission.create({
      data: {
        formId, websiteId: row.websiteId, status: isSpam ? 'SPAM' : 'NEW', spamScore: score, captchaScore, ipHash, userAgent: meta.userAgent?.slice(0, 400), referrer: meta.referrer?.slice(0, 500),
        pageUrl: body.pageUrl?.slice(0, 500), locale: body.locale, summary: summary as object,
        values: {
          create: Object.entries(result.values).map(([name, value]) => {
            const f = labels.get(name);
            const isScalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
            return { fieldName: name, fieldLabel: f?.label ?? name, fieldType: f?.type ?? 'text', value: isScalar ? String(value) : null, valueJson: isScalar ? undefined : (value as object) };
          }),
        },
      },
    });
    if (!isSpam) {
      await this.queues.add('formRules', 'form.process', { submissionId: submission.id }, { attempts: 3 });
      await this.db.analyticsEvent.create({ data: { websiteId: row.websiteId, type: 'conversion', name: `form:${form.slug}`, path: safePath(body.pageUrl), visitorHash: ipHash ? sha(`${ipHash}|${dayStamp()}`) : 'anon', sessionHash: ipHash ? sha(`${ipHash}|${meta.userAgent}|${dayStamp()}`) : 'anon' } }).catch(() => undefined);
    }
    return { ok: true, message: form.settings.successMessage, redirectUrl: form.settings.redirectUrl ?? null };
  }

  /** Cookie-less, privacy-preserving analytics: daily-rotating salted hashes, no raw IPs. */
  async collect(body: { websiteId: string; type: string; path: string; referrer?: string; name?: string; props?: Record<string, unknown> }, meta: { ip?: string; userAgent?: string; country?: string; dnt?: boolean }) {
    if (meta.dnt) return;
    const site = await this.db.website.findFirst({ where: { id: body.websiteId, deletedAt: null }, select: { id: true } });
    if (!site) return;
    const ua = meta.userAgent ?? '';
    if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)) return;
    const visitorHash = sha(`${meta.ip ?? ''}|${ua}|${body.websiteId}|${dayStamp()}|${env().ANALYTICS_SALT}`);
    const device = /mobile|iphone|android(?!.*tablet)/i.test(ua) ? 'mobile' : /ipad|tablet/i.test(ua) ? 'tablet' : 'desktop';
    const browser = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /safari\//i.test(ua) ? 'Safari' : /firefox\//i.test(ua) ? 'Firefox' : 'Other';
    let referrer: string | undefined;
    try {
      referrer = body.referrer ? new URL(body.referrer).hostname : undefined;
    } catch {
      referrer = undefined;
    }
    await this.db.analyticsEvent.create({
      data: { websiteId: body.websiteId, type: ['pageview', 'event', 'conversion'].includes(body.type) ? body.type : 'event', path: safePath(body.path), referrer, country: meta.country, device, browser, visitorHash, sessionHash: sha(`${visitorHash}|${Math.floor(Date.now() / 1_800_000)}`), name: body.name?.slice(0, 100), props: body.props as object | undefined },
    });
  }
}

function safePath(p?: string) {
  if (!p) return '/';
  try {
    return new URL(p, 'http://x').pathname.slice(0, 300);
  } catch {
    return '/';
  }
}
