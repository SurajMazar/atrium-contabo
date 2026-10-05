import { decryptJson, decryptSecret, webhookHeaders, type JobPayload } from '@atrium/server-kit';
import { isFinalAttempt, type JobInfo, type WorkerContext } from '../context';
import { errorMessage, PermanentError } from '../lib/errors';
import { assertOutboundUrl, OutboundBlockedError } from '@atrium/providers';
import { fetchTenantUrl, readResponseExcerpt, truncate } from '../lib/net';

export const WEBHOOK_TIMEOUT_MS = 10_000;
/** Mirrors DEFAULT_JOB_OPTIONS['webhook.deliver'] backoff (exponential, 30s base). */
export const WEBHOOK_BACKOFF_BASE_MS = 30_000;

/** Envelope stored on WebhookDelivery.payload and sent as the request body. */
export interface WebhookEnvelope {
  id: string;
  event: string;
  createdAt: string;
  organizationId: string;
  websiteId: string | null;
  data: Record<string, unknown>;
}

/**
 * `webhook.dispatch` — fan out an event to every enabled webhook subscribed to it (exact event,
 * `*`, or a `prefix.*` wildcard) for the organization and (optionally) website; creates one
 * WebhookDelivery row per webhook and enqueues `webhook.deliver` for each.
 */
export async function processWebhookDispatch(ctx: WorkerContext, data: JobPayload<'webhook.dispatch'>) {
  const prefix = data.event.includes('.') ? `${data.event.split('.')[0]}.*` : data.event;
  const hooks = await ctx.prisma.webhook.findMany({
    where: {
      organizationId: data.organizationId,
      enabled: true,
      ...(data.webhookId ? { id: data.webhookId } : { events: { hasSome: [data.event, '*', prefix] } }),
      ...(data.websiteId ? { OR: [{ websiteId: null }, { websiteId: data.websiteId }] } : { websiteId: null }),
    },
    select: { id: true },
  });
  const created: string[] = [];
  for (const hook of hooks) {
    const delivery = await ctx.prisma.webhookDelivery.create({ data: { webhookId: hook.id, event: data.event, payload: {}, status: 'PENDING' } });
    const envelope: WebhookEnvelope = {
      id: delivery.id,
      event: data.event,
      createdAt: delivery.createdAt.toISOString(),
      organizationId: data.organizationId,
      websiteId: data.websiteId ?? null,
      data: data.payload,
    };
    await ctx.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { payload: envelope as object } });
    await ctx.enqueue('webhook.deliver', { deliveryId: delivery.id }, { jobId: `whd-${delivery.id}` });
    created.push(delivery.id);
  }
  ctx.logger.debug({ event: data.event, deliveries: created.length }, 'webhook dispatched');
  return { deliveries: created };
}

/** The outbound guard's rejection, whether thrown directly or wrapped by fetch (`TypeError: fetch failed`). */
export function blockedError(err: unknown): OutboundBlockedError | undefined {
  if (err instanceof OutboundBlockedError) return err;
  const cause = (err as { cause?: unknown } | undefined)?.cause;
  return cause instanceof OutboundBlockedError ? cause : undefined;
}

/** The API stores secrets with encryptJson(secret); older rows may be encryptSecret(plain). */
export function readWebhookSecret(enc: string): string {
  try {
    const v = decryptJson<unknown>(enc);
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && typeof (v as { secret?: unknown }).secret === 'string') return (v as { secret: string }).secret;
  } catch {
    /* not JSON — fall through */
  }
  return decryptSecret(enc);
}

export function nextAttemptAt(now: Date, attemptNumber: number): Date {
  return new Date(now.getTime() + WEBHOOK_BACKOFF_BASE_MS * 2 ** Math.max(0, attemptNumber - 1));
}

/**
 * `webhook.deliver` — POST the signed envelope (X-Atrium-Event / -Delivery / -Timestamp /
 * -Signature = `sha256=HMAC(secret, "${timestamp}.${body}")`), 10s timeout, record status,
 * response and duration; BullMQ retries with exponential backoff, FAILED after the last attempt.
 */
export async function processWebhookDeliver(ctx: WorkerContext, data: JobPayload<'webhook.deliver'>, job: JobInfo) {
  const delivery = await ctx.prisma.webhookDelivery.findUnique({ where: { id: data.deliveryId }, include: { webhook: true } });
  if (!delivery) return { skipped: 'delivery not found' };
  if (delivery.status === 'SUCCESS') return { skipped: 'already delivered' };
  const attemptNumber = delivery.attempts + 1;
  const fail = async (error: string, permanent: boolean, extra: { responseStatus?: number; responseBody?: string; durationMs?: number } = {}) => {
    const final = permanent || isFinalAttempt(job);
    await ctx.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: final ? 'FAILED' : 'RETRYING', attempts: attemptNumber, error: truncate(error, 1000), nextAttemptAt: final ? null : nextAttemptAt(ctx.now(), attemptNumber), ...extra },
    });
    throw final ? new PermanentError(error) : new Error(error);
  };

  if (!delivery.webhook.enabled) return fail('Webhook is disabled', true);
  let secret: string;
  try {
    secret = readWebhookSecret(delivery.webhook.secretEnc);
  } catch (err) {
    return fail(`Cannot decrypt webhook secret: ${errorMessage(err)}`, true);
  }
  try {
    assertOutboundUrl(delivery.webhook.url, { allowPrivate: ctx.settings.allowPrivateNetwork });
  } catch (err) {
    return fail(errorMessage(err), true);
  }

  const payload = delivery.payload as Record<string, unknown>;
  const body = JSON.stringify(payload && Object.keys(payload).length ? payload : { id: delivery.id, event: delivery.event, createdAt: delivery.createdAt.toISOString(), data: {} });
  const headers = webhookHeaders(secret, { event: delivery.event, deliveryId: delivery.id, body, timestamp: Math.floor(ctx.now().getTime() / 1000) });
  const started = Date.now();
  let res: Response;
  try {
    // Connections are validated at connect time (DNS rebinding safe); redirects are not followed.
    res = await fetchTenantUrl(ctx, delivery.webhook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) });
  } catch (err) {
    const blocked = blockedError(err);
    if (blocked) return fail(blocked.message, true, { durationMs: Date.now() - started });
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return fail(timedOut ? `Timed out after ${WEBHOOK_TIMEOUT_MS / 1000}s` : `Network error: ${errorMessage(err)}`, false, { durationMs: Date.now() - started });
  }
  const durationMs = Date.now() - started;
  // INT-4: read at most 64 KB (then abort), store at most 4 KB.
  const responseBody = await readResponseExcerpt(res);
  if (res.status >= 200 && res.status < 300) {
    await ctx.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'SUCCESS', attempts: attemptNumber, responseStatus: res.status, responseBody, durationMs, error: null, nextAttemptAt: null } });
    return { status: res.status, durationMs };
  }
  // 410 Gone = the receiver asked us to stop; never retry.
  return fail(`HTTP ${res.status}`, res.status === 410, { responseStatus: res.status, responseBody, durationMs });
}
