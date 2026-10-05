import { hasTemplate } from '@atrium/schema';
import { UnrecoverableError } from 'bullmq';
import type { JobPayload } from '@atrium/server-kit';
import { isFinalAttempt, type JobInfo, type WorkerContext } from '../context';
import { appendActionsLog } from '../lib/actions-log';
import { classify, errorMessage, PermanentError } from '../lib/errors';
import { renderText } from '../lib/templates';
import { loadSubmissionScope } from './scope';

/** `sms.send` — resolve the org SMS provider, render the body template, send and log. */
export async function processSmsSend(ctx: WorkerContext, data: JobPayload<'sms.send'>, job: JobInfo) {
  const submissionId = typeof data.context?.submissionId === 'string' ? data.context.submissionId : undefined;
  let body = data.body;
  let to = data.to;
  if (submissionId && data.context?.rendered !== true && (hasTemplate(body) || hasTemplate(to))) {
    const loaded = await loadSubmissionScope(ctx, submissionId);
    if (loaded) {
      body = renderText(body, loaded.scope);
      to = renderText(to, loaded.scope);
    }
  }
  const log = (status: 'sent' | 'failed', extra: { messageId?: string; error?: string; provider?: string }) =>
    submissionId ? appendActionsLog(ctx.prisma, submissionId, { at: ctx.now().toISOString(), type: 'sms', status, ruleId: data.context?.ruleId, target: to, ...extra }) : Promise.resolve();

  let provider: string | undefined;
  try {
    const resolved = await ctx.resolver.sms({ organizationId: data.organizationId, websiteId: data.websiteId, providerId: data.providerId });
    provider = resolved.driver;
    const res = await resolved.send({ to, body, from: data.from });
    if (res.status === 'failed') throw new PermanentError(`SMS to ${to} was rejected by ${resolved.driver}`);
    await log('sent', { messageId: res.id, provider });
    ctx.logger.info({ jobId: job.id, provider, status: res.status }, 'sms sent');
    return { id: res.id, status: res.status, provider };
  } catch (err) {
    const classified = classify(err);
    if (classified instanceof UnrecoverableError || isFinalAttempt(job)) await log('failed', { error: errorMessage(err), provider });
    throw classified;
  }
}
