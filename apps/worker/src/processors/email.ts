import type { EmailMessage } from '@atrium/providers';
import { hasTemplate } from '@atrium/schema';
import { UnrecoverableError } from 'bullmq';
import type { JobPayload } from '@atrium/server-kit';
import { isFinalAttempt, type JobInfo, type WorkerContext } from '../context';
import { appendActionsLog } from '../lib/actions-log';
import { classify, errorMessage } from '../lib/errors';
import { htmlToText, renderHtml, renderText } from '../lib/templates';
import { loadSubmissionScope } from './scope';

/**
 * `email.send` — resolve the provider (explicit → website → org → platform SMTP), optionally
 * interpolate `{{…}}` templates with the submission scope, send, and record the result on the
 * submission timeline when `context.submissionId` is set.
 */
export async function processEmailSend(ctx: WorkerContext, data: JobPayload<'email.send'>, job: JobInfo) {
  const { message, context } = data;
  const submissionId = typeof context?.submissionId === 'string' ? context.submissionId : undefined;
  const rendered = context?.rendered === true;

  let subject = message.subject;
  let text = message.text;
  let html = message.html;
  if (submissionId && !rendered && [subject, text, html].some((v) => v && hasTemplate(v))) {
    const loaded = await loadSubmissionScope(ctx, submissionId);
    if (loaded) {
      subject = renderText(subject, loaded.scope);
      text = text ? renderText(text, loaded.scope) : text;
      html = html ? renderHtml(html, loaded.scope) : html;
    }
  }
  if (html && !text) text = htmlToText(html);

  const resolved = await ctx.resolver.email({ organizationId: data.organizationId, websiteId: data.websiteId, providerId: data.providerId });
  const outgoing: EmailMessage = {
    from: message.from ?? resolved.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    replyTo: message.replyTo,
    subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 998),
    text,
    html,
    headers: message.headers,
    tags: message.tags,
    attachments: message.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.contentBase64, 'base64'), contentType: a.contentType })),
  };
  const target = message.to.map((t) => t.email).join(', ');
  try {
    const result = await resolved.send(outgoing);
    ctx.logger.info({ jobId: job.id, provider: resolved.driver, source: resolved.source, to: message.to.length, kind: context?.kind }, 'email sent');
    if (submissionId) {
      await appendActionsLog(ctx.prisma, submissionId, { at: ctx.now().toISOString(), type: String(context?.actionType ?? 'email'), status: 'sent', ruleId: context?.ruleId, provider: resolved.driver, target, messageId: result.id });
    }
    return { id: result.id, accepted: result.accepted, rejected: result.rejected, provider: resolved.driver };
  } catch (err) {
    const classified = classify(err);
    const permanent = classified instanceof UnrecoverableError;
    if (submissionId && (permanent || isFinalAttempt(job))) {
      await appendActionsLog(ctx.prisma, submissionId, { at: ctx.now().toISOString(), type: String(context?.actionType ?? 'email'), status: 'failed', ruleId: context?.ruleId, provider: resolved.driver, target, error: errorMessage(err) });
    }
    throw classified;
  }
}
