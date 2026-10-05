import { FormRuleSchema, planFormRules, SUBMISSION_STATUSES, type FormAction, type FormRule, type PlannedRuleActions } from '@atrium/schema';
import type { JobPayload } from '@atrium/server-kit';
import type { JobInfo, WorkerContext } from '../context';
import { appendActionsLog, type ActionLogEntry } from '../lib/actions-log';
import { errorMessage } from '../lib/errors';
import { assertOutboundUrl } from '@atrium/providers';
import { fetchTenantUrl, readResponseExcerpt } from '../lib/net';
import { checkAutoresponderQuota, checkEmailQuota, checkSmsQuota, cleanSmsRecipient, memoryQuotaStore, type QuotaStore } from '../lib/quota';
import { blockedError } from './webhooks';
import { buildSubmissionScope, defaultSubmissionHtml, renderHtml, renderRecipients, renderText, ruleData, textToHtml, type SubmissionValueRow } from '../lib/templates';
import { signSubmissionFiles, websiteUrl } from './scope';

interface RuleRow {
  ruleId: string;
  name: string;
  enabled: boolean;
  position: number;
  when: unknown;
  then: unknown;
  otherwise: unknown;
  stopProcessing: boolean;
}

/** DB rule rows → validated FormRule objects (invalid rules are reported and skipped). */
export function rulesFromRows(rows: RuleRow[], fallback: unknown): { rules: FormRule[]; invalid: Array<{ ruleId: string; error: string }> } {
  const source: unknown[] = rows.length
    ? [...rows].sort((a, b) => a.position - b.position).map((r) => ({ id: r.ruleId, name: r.name, enabled: r.enabled, when: r.when ?? undefined, then: r.then, otherwise: r.otherwise ?? [], stopProcessing: r.stopProcessing }))
    : Array.isArray(fallback)
      ? fallback
      : [];
  const rules: FormRule[] = [];
  const invalid: Array<{ ruleId: string; error: string }> = [];
  for (const raw of source) {
    const parsed = FormRuleSchema.safeParse(raw);
    if (parsed.success) rules.push(parsed.data);
    else invalid.push({ ruleId: String((raw as { id?: unknown })?.id ?? '?'), error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  return { rules, invalid };
}

/** Process-local fallback when no Redis-backed store is wired (unit tests, scripts). */
let fallbackQuota: QuotaStore | undefined;
function quotaStore(ctx: WorkerContext): QuotaStore {
  return ctx.quota ?? (fallbackQuota ??= memoryQuotaStore());
}

const STATUS_MAP: Record<string, 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'REJECTED' | 'SPAM' | 'ARCHIVED'> = Object.fromEntries(
  SUBMISSION_STATUSES.map((s) => [s, s.toUpperCase() as 'NEW']),
);

/** Queue/infrastructure failure — rethrown so BullMQ retries the whole job (job ids dedupe re-runs). */
class InfraError extends Error {
  constructor(cause: unknown) {
    super(`Could not enqueue follow-up job: ${errorMessage(cause)}`);
    this.name = 'InfraError';
  }
}

export interface FormProcessResult {
  skipped?: string;
  planned: number;
  executed: number;
  failed: number;
  deleted: boolean;
}

/**
 * `form.process` — the rule engine. Loads the submission, its form (fields/rules/settings) and
 * values; `planFormRules` decides which actions run; each action is executed (emails/SMS/webhooks
 * are fanned out to their queues with deterministic job ids so a retried job never duplicates
 * notifications); `form.submitted` is dispatched; results go to the submission actionsLog.
 * When `settings.storeSubmissions === false` the submission is deleted afterwards (content is
 * rendered into the queued messages first, so notifications still work).
 */
export async function processFormSubmission(ctx: WorkerContext, data: JobPayload<'form.process'>, job: JobInfo): Promise<FormProcessResult> {
  const sub = await ctx.prisma.formSubmission.findUnique({
    where: { id: data.submissionId },
    include: {
      values: true,
      form: { include: { rules: true } },
      website: { select: { id: true, name: true, slug: true, organizationId: true, domains: { where: { isPrimary: true }, select: { hostname: true }, take: 1 } } },
    },
  });
  if (!sub) return { skipped: 'submission not found', planned: 0, executed: 0, failed: 0, deleted: false };
  const log = sub.actionsLog as unknown as ActionLogEntry[];
  if (Array.isArray(log) && log.some((e) => e.type === 'rules' && e.status === 'done')) {
    return { skipped: 'already processed', planned: 0, executed: 0, failed: 0, deleted: false };
  }
  const settings = (sub.form.settings ?? {}) as { storeSubmissions?: boolean; rules?: unknown };
  const organizationId = sub.website.organizationId;
  const now = () => ctx.now().toISOString();
  const quota = quotaStore(ctx);

  if (sub.status === 'SPAM') {
    await appendActionsLog(ctx.prisma, sub.id, { at: now(), type: 'rules', status: 'skipped', detail: 'Submission flagged as spam — actions not run' });
    return { skipped: 'spam', planned: 0, executed: 0, failed: 0, deleted: false };
  }

  const values: SubmissionValueRow[] = sub.values.map((v) => ({ fieldName: v.fieldName, fieldLabel: v.fieldLabel, fieldType: v.fieldType, value: v.value, valueJson: v.valueJson }));
  const scope = buildSubmissionScope({
    submission: { id: sub.id, createdAt: sub.createdAt, status: sub.status, pageUrl: sub.pageUrl, referrer: sub.referrer, locale: sub.locale, tags: sub.tags },
    form: { id: sub.form.id, name: sub.form.name, slug: sub.form.slug },
    website: { id: sub.website.id, name: sub.website.name, slug: sub.website.slug, url: websiteUrl(ctx, sub.website.slug, sub.website.domains[0]?.hostname) },
    values,
  });
  const files = scope.fieldList.flatMap((f) => f.files);
  const { rules, invalid } = rulesFromRows(sub.form.rules, settings.rules);
  const plan: PlannedRuleActions[] = planFormRules(rules, { ...ruleData(values), submission: scope.submission });
  const entries: ActionLogEntry[] = invalid.map((i) => ({ at: now(), type: 'rule', status: 'skipped', ruleId: i.ruleId, error: `Invalid rule: ${i.error}` }));
  const adminUrl = `${ctx.settings.adminUrl.replace(/\/+$/, '')}/websites/${sub.website.id}/submissions/${sub.id}`;
  let filesSigned = false;
  let executed = 0;
  let failed = 0;
  let tags = [...sub.tags];
  const enqueue: WorkerContext['enqueue'] = async (name, payload, opts) => {
    try {
      return await ctx.enqueue(name, payload, opts);
    } catch (err) {
      throw new InfraError(err);
    }
  };

  for (const planned of plan) {
    for (const [index, action] of planned.actions.entries()) {
      const base = { at: now(), ruleId: planned.ruleId, branch: planned.branch, type: action.type } as const;
      const jobKey = `fp-${sub.id}-${planned.ruleId}-${planned.branch}-${index}`.replace(/[^\w-]/g, '_');
      try {
        const res = await executeAction(action);
        entries.push({ ...base, ...res });
        if (res.status !== 'skipped') executed++;
      } catch (err) {
        if (err instanceof InfraError) throw err;
        failed++;
        entries.push({ ...base, status: 'failed', error: errorMessage(err) });
        ctx.logger.warn({ submissionId: sub.id, ruleId: planned.ruleId, action: action.type, err: errorMessage(err) }, 'form action failed');
      }

      async function executeAction(a: FormAction): Promise<Omit<ActionLogEntry, 'at' | 'type'>> {
        switch (a.type) {
          case 'email': {
            const to = renderRecipients(a.to, scope);
            if (!to.length) return { status: 'skipped', detail: 'No valid recipients' };
            const cc = renderRecipients(a.cc, scope);
            const bcc = renderRecipients(a.bcc, scope);
            const q = await checkEmailQuota(quota, { organizationId, recipients: to.length + cc.length + bcc.length, nowMs: ctx.now().getTime() });
            if (!q.allowed) return { status: 'skipped', target: to.map((t) => t.email).join(', '), detail: q.reason };
            if (a.html === undefined && files.length && !filesSigned) {
              await signSubmissionFiles(ctx, organizationId, files);
              filesSigned = true;
            }
            const replyTo = a.replyTo ? renderRecipients([a.replyTo], scope)[0] : undefined;
            const text = a.body ? renderText(a.body, scope) : undefined;
            const html = a.html ? renderHtml(a.html, scope) : defaultSubmissionHtml(scope, { intro: text ? textToHtml(text) : undefined, adminUrl });
            await enqueue(
              'email.send',
              {
                organizationId,
                websiteId: sub!.website.id,
                providerId: a.providerId ?? null,
                message: { to, cc, bcc, replyTo, subject: renderText(a.subject, scope), text, html, tags: { form: sub!.form.slug, kind: 'form-notification' } },
                context: { submissionId: sub!.id, ruleId: planned.ruleId, actionType: 'email', kind: 'form-notification', rendered: true },
              },
              { jobId: jobKey },
            );
            return { status: 'queued', target: to.map((t) => t.email).join(', ') };
          }
          case 'autoresponder': {
            const to = renderRecipients([`{{${a.emailField}}}`], scope);
            if (!to.length) return { status: 'skipped', detail: `Field "${a.emailField}" has no valid email` };
            const to0 = to.slice(0, 1);
            const q = await checkAutoresponderQuota(quota, { organizationId, formId: sub!.form.id, email: to0[0]!.email, nowMs: ctx.now().getTime() });
            if (!q.allowed) return { status: 'skipped', target: to0[0]!.email, detail: q.reason };
            await enqueue(
              'email.send',
              {
                organizationId,
                websiteId: sub!.website.id,
                providerId: a.providerId ?? null,
                message: { to: to0, subject: renderText(a.subject, scope), html: renderHtml(a.html, scope), tags: { form: sub!.form.slug, kind: 'autoresponder' } },
                context: { submissionId: sub!.id, ruleId: planned.ruleId, actionType: 'autoresponder', kind: 'autoresponder', rendered: true },
              },
              { jobId: jobKey },
            );
            return { status: 'queued', target: to[0]!.email };
          }
          case 'sms': {
            const rendered = [...new Set(a.to.flatMap((t) => renderText(t, scope).split(/[,;\n]/)).map((s) => s.trim()).filter(Boolean))];
            if (!rendered.length) return { status: 'skipped', detail: 'No recipients' };
            // Only phone-number shaped recipients (E.164 / 8–15 digits); at most 10 per action.
            const recipients = [...new Set(rendered.map(cleanSmsRecipient).filter((r): r is string => !!r))].slice(0, 10);
            const invalid = rendered.length - rendered.filter((r) => cleanSmsRecipient(r)).length;
            if (!recipients.length) return { status: 'skipped', detail: 'No valid phone numbers' };
            const body = renderText(a.body, scope).slice(0, 1600);
            const sent: string[] = [];
            const limited: string[] = [];
            for (const [i, to] of recipients.entries()) {
              const q = await checkSmsQuota(quota, { organizationId, phone: to, nowMs: ctx.now().getTime() });
              if (!q.allowed) {
                limited.push(`${to}: ${q.reason}`);
                continue;
              }
              await enqueue(
                'sms.send',
                { organizationId, websiteId: sub!.website.id, providerId: a.providerId ?? null, to, body, context: { submissionId: sub!.id, ruleId: planned.ruleId, actionType: 'sms', rendered: true } },
                { jobId: `${jobKey}-${i}` },
              );
              sent.push(to);
            }
            const notes = [...(invalid ? [`${invalid} invalid number(s) ignored`] : []), ...limited];
            if (!sent.length) return { status: 'skipped', target: recipients.join(', '), detail: notes.join('; ') || 'Quota exceeded' };
            return { status: 'queued', target: sent.join(', '), ...(notes.length ? { detail: notes.join('; ') } : {}) };
          }
          case 'webhook': {
            const payload = submittedPayload();
            if (a.webhookId) {
              await enqueue('webhook.dispatch', { organizationId, websiteId: sub!.website.id, event: 'form.submitted', payload, webhookId: a.webhookId }, { jobId: jobKey });
              return { status: 'queued', target: `webhook:${a.webhookId}` };
            }
            if (!a.url) return { status: 'skipped', detail: 'No webhook or URL configured' };
            // Ad-hoc URL (no stored secret): single unsigned POST, result logged on the timeline.
            const url = assertOutboundUrl(a.url, { allowPrivate: ctx.settings.allowPrivateNetwork });
            let res: Response;
            try {
              res = await fetchTenantUrl(ctx, url.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Atrium-Webhooks/1.0', 'X-Atrium-Event': 'form.submitted' },
                body: JSON.stringify({ event: 'form.submitted', createdAt: now(), data: payload }),
                signal: AbortSignal.timeout(10_000),
              });
            } catch (err) {
              throw blockedError(err) ?? err;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await readResponseExcerpt(res, 200)}`);
            await res.body?.cancel().catch(() => undefined);
            return { status: 'done', target: url.host, detail: `HTTP ${res.status}` };
          }
          case 'tag': {
            tags = [...new Set([...tags, ...a.tags.map((t) => renderText(t, scope).trim()).filter(Boolean)])];
            await ctx.prisma.formSubmission.update({ where: { id: sub!.id }, data: { tags } });
            return { status: 'done', detail: a.tags.join(', ') };
          }
          case 'assign': {
            await ctx.prisma.formSubmission.update({ where: { id: sub!.id }, data: { assignedToId: a.userId } });
            return { status: 'done', target: a.userId };
          }
          case 'status': {
            const status = STATUS_MAP[a.status.toLowerCase()];
            if (!status) return { status: 'skipped', detail: `Unknown status "${a.status}"` };
            await ctx.prisma.formSubmission.update({ where: { id: sub!.id }, data: { status } });
            return { status: 'done', detail: status.toLowerCase() };
          }
        }
      }
    }
  }

  function submittedPayload() {
    return {
      submissionId: sub!.id,
      formId: sub!.form.id,
      formName: sub!.form.name,
      formSlug: sub!.form.slug,
      websiteId: sub!.website.id,
      pageUrl: sub!.pageUrl,
      createdAt: sub!.createdAt.toISOString(),
      data: Object.fromEntries(values.map((v) => [v.fieldName, v.valueJson ?? v.value])),
      fields: scope.fieldList.map((f) => ({ name: f.name, label: f.label, type: f.type, value: f.display })),
    };
  }

  await ctx.enqueue('webhook.dispatch', { organizationId, websiteId: sub.website.id, event: 'form.submitted', payload: submittedPayload() }, { jobId: `fp-${sub.id}-event` });

  const deleted = settings.storeSubmissions === false;
  entries.push({ at: now(), type: 'rules', status: 'done', detail: `${plan.length} rule(s) matched, ${executed} action(s) run, ${failed} failed${deleted ? '; submission not stored (form setting)' : ''}` });
  if (deleted) {
    await ctx.prisma.formSubmission.delete({ where: { id: sub.id } }).catch((err: unknown) => ctx.logger.warn({ err: errorMessage(err) }, 'could not delete unstored submission'));
  } else {
    await appendActionsLog(ctx.prisma, sub.id, entries);
  }
  ctx.logger.info({ jobId: job.id, submissionId: sub.id, rules: plan.length, executed, failed, deleted }, 'form processed');
  return { planned: plan.length, executed, failed, deleted };
}
