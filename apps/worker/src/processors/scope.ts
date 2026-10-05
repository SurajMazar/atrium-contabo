import type { WorkerContext } from '../context';
import { buildSubmissionScope, type SubmissionFile } from '../lib/templates';

/** Public URL of a website (primary custom domain, else the platform subdomain). */
export function websiteUrl(ctx: WorkerContext, slug: string, primaryDomain?: string | null): string {
  if (primaryDomain) return `https://${primaryDomain}`;
  const env = process.env.PLATFORM_SITES_DOMAIN ?? 'sites.localhost:3001';
  const protocol = env.split(':')[0]!.endsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${slug}.${env}`;
}

/** Load a submission with its form, website and values and build the template scope. */
export async function loadSubmissionScope(ctx: WorkerContext, submissionId: string, opts: { signFiles?: boolean } = {}) {
  const sub = await ctx.prisma.formSubmission.findUnique({
    where: { id: submissionId },
    include: {
      values: true,
      form: { select: { id: true, name: true, slug: true } },
      website: { select: { id: true, name: true, slug: true, organizationId: true, domains: { where: { isPrimary: true }, select: { hostname: true }, take: 1 } } },
    },
  });
  if (!sub) return null;
  const scope = buildSubmissionScope({
    submission: { id: sub.id, createdAt: sub.createdAt, status: sub.status, pageUrl: sub.pageUrl, referrer: sub.referrer, locale: sub.locale, tags: sub.tags },
    form: sub.form,
    website: { id: sub.website.id, name: sub.website.name, slug: sub.website.slug, url: websiteUrl(ctx, sub.website.slug, sub.website.domains[0]?.hostname) },
    values: sub.values.map((v) => ({ fieldName: v.fieldName, fieldLabel: v.fieldLabel, fieldType: v.fieldType, value: v.value, valueJson: v.valueJson })),
  });
  if (opts.signFiles) await signSubmissionFiles(ctx, sub.website.organizationId, scope.fieldList.flatMap((f) => f.files));
  return { submission: sub, scope };
}

/** Attach 7-day signed download URLs to private submission files (best effort). */
export async function signSubmissionFiles(ctx: WorkerContext, organizationId: string, files: SubmissionFile[]): Promise<void> {
  if (!files.length) return;
  try {
    const storage = await ctx.resolver.storage({ organizationId });
    await Promise.all(
      files.map(async (f) => {
        try {
          f.url = await storage.getSignedUrl(f.key, { expiresInSeconds: 7 * 24 * 3600, disposition: `attachment; filename="${f.filename.replace(/["\\\r\n]/g, '_')}"` });
        } catch (err) {
          ctx.logger.warn({ key: f.key, err }, 'could not sign submission file URL');
        }
      }),
    );
  } catch (err) {
    ctx.logger.warn({ err }, 'storage unavailable for signing submission files');
  }
}
