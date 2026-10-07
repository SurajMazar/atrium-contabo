import { Injectable, Logger } from '@nestjs/common';
import { FormDefinitionSchema, validateSubmission, type FormDefinition, type SiteSnapshot } from '@atrium/schema';
import { formFromRow } from '@atrium/site-store';
import { createHash, randomBytes } from 'node:crypto';
import { MEDIA_TYPES, resolveUploadType, safeFilenameStem } from '../../common/file-safety';
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
/** What visitors may attach to form submissions (no SVG/fonts: nothing that can carry active content). */
const SUBMISSION_TYPES = new Set([...MEDIA_TYPES].filter((t) => t !== 'image/svg+xml' && !t.startsWith('font/')));
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
    // A suspended organization's websites are offline, whichever address they are reached on.
    if (slug) return this.db.website.findFirst({ where: { slug, deletedAt: null, status: { not: 'SUSPENDED' }, organization: { suspendedAt: null } } });
    const domain = await this.db.domain.findUnique({ where: { hostname: hostNoPort }, include: { website: { include: { organization: { select: { suspendedAt: true } } } } } });
    // Only domains whose ownership was proven (TXT) and that point at us are served — an unverified claim
    // must never be able to take over a hostname (e.g. a dangling CNAME left by a former customer).
    if (!domain || !domain.verifiedAt || domain.status !== 'active' || domain.website.deletedAt || domain.website.status === 'SUSPENDED' || domain.website.organization.suspendedAt) return null;
    return domain.website;
  }

  async resolve(host: string): Promise<SiteSnapshot & { etag: string }> {
    const site = await this.websiteForHost(host);
    if (!site?.publishedVersionId) throw notFound('Site');
    const v = await this.db.websiteVersion.findUniqueOrThrow({ where: { id: site.publishedVersionId } });
    const snapshot = v.snapshot as unknown as SiteSnapshot;
    // Public runtime config (captcha site keys) is resolved live, not frozen at publish: adding or
    // rotating a captcha integration takes effect without republishing (the API verifies tokens
    // with the live integration too, so page and API always agree).
    const runtime = await this.publishing.runtimeFor(site.id, site.organizationId, snapshot.definition);
    const runtimeTag = sha(JSON.stringify(runtime)).slice(0, 8);
    return { ...snapshot, runtime, etag: `"${v.checksum.slice(0, 32)}-${v.number}-${runtimeTag}"` };
  }

  /**
   * Captcha settings of the form as PUBLISHED (what visitors' pages render), read from the live
   * snapshot. Enforcing the draft's setting instead would break the live form between "turn on
   * captcha" and the next publish (the page has no widget yet). `undefined`: not in a published version.
   */
  private async publishedCaptcha(versionId: string | null, formId: string): Promise<FormDefinition['settings']['captcha'] | undefined> {
    if (!versionId) return undefined;
    const rows = await this.db.$queryRaw<Array<{ c: unknown }>>`SELECT jsonb_path_query_first(snapshot, '$.definition.forms[*] ? (@.id == $id).settings.captcha', jsonb_build_object('id', ${formId}::text)) AS c FROM website_versions WHERE id = ${versionId}`;
    const c = rows[0]?.c;
    return c && typeof c === 'object' ? (c as FormDefinition['settings']['captcha']) : undefined;
  }

  /** Caddy/edge on-demand TLS: allow certificates only for hosts we serve. */
  async domainAllowed(domain: string) {
    // Platform subdomains of live sites and verified custom domains only; unknown or pending hosts never do.
    return !!(await this.websiteForHost(domain));
  }

  private async rateLimit(key: string, perMinute: number) {
    const k = `rl:form:${key}`;
    const n = await this.redis.client.incr(k);
    if (n === 1) await this.redis.client.expire(k, 60);
    if (n > perMinute) throw new ApiError(429, 'RATE_LIMITED', 'Too many submissions. Please wait a minute and try again.');
  }

  async submit(formId: string, body: { values?: Record<string, unknown>; captchaToken?: string; _hp?: string; _ts?: number; pageUrl?: string; locale?: string } & Record<string, unknown>, meta: { ip?: string; userAgent?: string; referrer?: string; origin?: string }, files: UploadedPart[] = []) {
    const row = await this.db.form.findFirst({ where: { id: formId, archivedAt: null }, include: { fields: true, rules: true, website: { select: { id: true, organizationId: true, status: true, deletedAt: true, slug: true, publishedVersionId: true, organization: { select: { suspendedAt: true, analyticsEnabled: true } }, domains: { where: { verifiedAt: { not: null } }, select: { hostname: true } } } } } });
    if (!row || row.website.deletedAt || row.website.status === 'SUSPENDED' || row.website.organization.suspendedAt) throw notFound('Form');
    const form: FormDefinition = FormDefinitionSchema.parse(formFromRow(row));
    const ipHash = meta.ip ? sha(`${meta.ip}|${env().ANALYTICS_SALT}`) : undefined;
    await this.rateLimit(`${formId}:${ipHash ?? 'anon'}`, form.settings.rateLimitPerMinute);

    // multipart sends fields flat; JSON sends { values }
    const values: Record<string, unknown> = { ...(body.values ?? Object.fromEntries(Object.entries(body).filter(([k]) => !k.startsWith('_') && !['captchaToken', 'pageUrl', 'locale', 'values', 'g-recaptcha-response', 'cf-turnstile-response', 'h-captcha-response'].includes(k)))) };
    const honeypot = form.settings.honeypot && typeof body._hp === 'string' && body._hp.trim().length > 0;

    // captcha — as published (see publishedCaptcha); drafts that were never published use their own setting.
    let captchaScore: number | undefined;
    const c = (await this.publishedCaptcha(row.website.publishedVersionId, formId)) ?? form.settings.captcha;
    if (c.provider !== 'none' && !honeypot) {
      const token = body.captchaToken ?? (body['g-recaptcha-response'] as string) ?? (body['cf-turnstile-response'] as string) ?? (body['h-captcha-response'] as string);
      if (!token) throw validation('Please complete the verification challenge', [{ field: '_captcha', message: 'Verification required' }]);
      const verifier = await this.resolver.resolver.captcha({ organizationId: row.website.organizationId, websiteId: row.websiteId, integrationId: c.integrationId, kind: c.provider }).catch((err: Error) => {
        this.logger.warn(`captcha not configured for form ${formId}: ${err.message}`);
        throw new ApiError(424, 'NOT_CONFIGURED', 'This form is temporarily unavailable. Please contact us another way.');
      });
      // In production a token must have been solved on this website (its platform subdomain or a
      // verified custom domain), not harvested on another site using the same captcha keys.
      const expectedHostnames = env().NODE_ENV === 'production' ? [`${row.website.slug}.${env().PLATFORM_SITES_DOMAIN.split(':')[0]}`, ...row.website.domains.map((d) => d.hostname)] : undefined;
      const res = await verifier.verify({ token, remoteIp: meta.ip, action: c.provider === 'recaptcha-v3' ? c.action : undefined, minScore: c.minScore, expectedHostnames });
      if (!res.success) throw validation('Verification failed. Please try again.', [{ field: '_captcha', message: 'Verification failed', codes: res.errorCodes }]);
      captchaScore = res.score;
    }

    // Files: checked up front (size, detected type), stored only after validation and spam checks pass.
    // Values for file fields can only come from these server-side uploads, never from the visitor's JSON.
    const fileFields = new Set(form.fields.filter((f) => f.type === 'file').map((f) => f.name));
    for (const name of fileFields) delete values[name];
    const pending: Array<{ field: string; key: string; part: UploadedPart; mime: string; filename: string }> = [];
    for (const f of files) {
      if (!fileFields.has(f.fieldname)) continue; // parts for unknown fields are ignored
      const def = form.fields.find((x) => x.name === f.fieldname)!;
      const maxMb = Math.min(def.validation?.maxFileSizeMb ?? 10, 25);
      if (f.size > maxMb * 1_048_576) throw validation(`${def.label}: file is larger than ${maxMb} MB`, [{ field: f.fieldname, message: `Max ${maxMb} MB` }]);
      let type;
      try {
        type = resolveUploadType(f.buffer, f.originalname, SUBMISSION_TYPES);
      } catch {
        throw validation(`${def.label}: file type not allowed`, [{ field: f.fieldname, message: 'File type not allowed' }]);
      }
      if (def.validation?.accept?.length && !def.validation.accept.some((a) => (a.endsWith('/*') ? type.mime.startsWith(a.slice(0, -1)) : a.startsWith('.') ? `.${type.ext}` === a.toLowerCase() || (a.toLowerCase() === '.jpeg' && type.ext === 'jpg') : type.mime === a))) throw validation(`${def.label}: file type not allowed`, [{ field: f.fieldname, message: 'File type not allowed' }]);
      const filename = f.originalname.replace(/[\r\n\0]/g, '').slice(-120) || 'file';
      const key = `private/submissions/${row.websiteId}/${dayStamp()}/${randomBytes(12).toString('hex')}-${safeFilenameStem(filename)}.${type.ext}`;
      pending.push({ field: f.fieldname, key, part: f, mime: type.mime, filename });
      const list = (values[f.fieldname] as Array<{ key: string; filename: string; size: number; mimeType: string }> | undefined) ?? [];
      list.push({ key, filename, size: f.size, mimeType: type.mime });
      values[f.fieldname] = list;
    }

    const result = validateSubmission(form, values);
    if (!result.valid && !honeypot) throw validation('Please check the highlighted fields', result.errors);

    const elapsedMs = typeof body._ts === 'number' ? Date.now() - body._ts : undefined;
    const score = spamScore(result.values, { honeypot, captchaScore, elapsedMs });
    const isSpam = honeypot || score >= 0.8;

    if (pending.length && !isSpam) {
      const storage = await this.resolver.resolver.storage({ organizationId: row.website.organizationId });
      for (const p of pending) await storage.upload({ key: p.key, body: p.part.buffer, contentType: p.mime, visibility: 'private' });
    }

    const labels = new Map(form.fields.map((f) => [f.name, f]));
    const summary = Object.fromEntries(Object.entries(result.values).slice(0, 6).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : v]));
    const submission = await this.db.formSubmission.create({
      data: {
        formId, websiteId: row.websiteId, status: isSpam ? 'SPAM' : 'NEW', spamScore: score, captchaScore, ipHash, userAgent: meta.userAgent?.slice(0, 400), referrer: meta.referrer?.slice(0, 500),
        pageUrl: safePageUrl(body.pageUrl), locale: typeof body.locale === 'string' ? body.locale.slice(0, 10) : undefined, summary: summary as object,
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
      if (row.website.organization.analyticsEnabled) await this.db.analyticsEvent.create({ data: { websiteId: row.websiteId, type: 'conversion', name: `form:${form.slug}`, path: safePath(body.pageUrl), visitorHash: ipHash ? sha(`${ipHash}|${dayStamp()}`) : 'anon', sessionHash: ipHash ? sha(`${ipHash}|${meta.userAgent}|${dayStamp()}`) : 'anon' } }).catch(() => undefined);
    }
    return { ok: true, message: form.settings.successMessage, redirectUrl: form.settings.redirectUrl ?? null };
  }

  /**
   * Cookie-less, privacy-preserving analytics: daily-rotating salted hashes, no raw IPs. Nothing is
   * stored unless a super admin turned analytics on for the website's organization.
   */
  async collect(body: { websiteId: string; type: string; path: string; referrer?: string; name?: string; props?: Record<string, unknown> }, meta: { ip?: string; userAgent?: string; country?: string; dnt?: boolean }) {
    if (meta.dnt) return;
    const site = await this.db.website.findFirst({ where: { id: body.websiteId, deletedAt: null, organization: { analyticsEnabled: true, suspendedAt: null } }, select: { id: true } });
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

/** Submitted page URLs are shown as links in the admin: http(s) only. */
function safePageUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().slice(0, 500) : undefined;
  } catch {
    return undefined;
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
