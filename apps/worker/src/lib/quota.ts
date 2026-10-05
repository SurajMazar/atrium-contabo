import { createHash } from 'node:crypto';

/**
 * INT-3: quotas for outbound messages triggered by form submissions (the recipient of an
 * autoresponder / SMS action can be a submitter-supplied value → mail-bombing / SMS toll fraud).
 * All limits live here.
 */
export const FORM_QUOTAS = {
  /** Autoresponder emails to the same address from the same form, per hour. */
  autoresponderPerRecipientPerHour: 3,
  /** SMS messages to the same phone number (any form of the organization), per day. */
  smsPerRecipientPerDay: 3,
  /** Emails (recipients) sent by form rules per organization, per day. */
  emailsPerOrgPerDay: 2000,
  /** SMS sent by form rules per organization, per day. */
  smsPerOrgPerDay: 200,
} as const;

const HOUR = 3600;
const DAY = 86_400;

/** Fixed-window counter store (Redis in production, in-memory for tests/dev fallback). */
export interface QuotaStore {
  /** Atomically add `amount` to the counter for `key` (window = `windowSeconds`) and return the new total. */
  increment(key: string, amount: number, windowSeconds: number): Promise<number>;
}

interface RedisLike {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

const INCR_SCRIPT = `local n = redis.call('INCRBY', KEYS[1], ARGV[1])
if tonumber(n) == tonumber(ARGV[1]) then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return n`;

export function redisQuotaStore(redis: RedisLike, prefix = 'atrium:quota:'): QuotaStore {
  return {
    async increment(key, amount, windowSeconds) {
      return Number(await redis.eval(INCR_SCRIPT, 1, `${prefix}${key}`, amount, windowSeconds));
    },
  };
}

export function memoryQuotaStore(now: () => number = Date.now): QuotaStore {
  const counters = new Map<string, { value: number; expiresAt: number }>();
  return {
    async increment(key, amount, windowSeconds) {
      const t = now();
      const hit = counters.get(key);
      if (!hit || hit.expiresAt <= t) {
        counters.set(key, { value: amount, expiresAt: t + windowSeconds * 1000 });
        return amount;
      }
      hit.value += amount;
      return hit.value;
    },
  };
}

/** Recipients are hashed so Redis never holds plain email addresses / phone numbers. */
function fingerprint(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}

function windowId(nowMs: number, seconds: number): number {
  return Math.floor(nowMs / 1000 / seconds);
}

export interface QuotaCheck {
  allowed: boolean;
  /** Human-readable reason when not allowed (for the submission actionsLog). */
  reason?: string;
}

/**
 * Consume `amount` units from each counter in order; stops at (and reports) the first one that
 * is exceeded. Counters are consumed even when a later one fails — a conservative choice that
 * never lets a burst slip through.
 */
async function consume(store: QuotaStore, nowMs: number, checks: Array<{ key: string; amount: number; limit: number; seconds: number; reason: string }>): Promise<QuotaCheck> {
  for (const c of checks) {
    const total = await store.increment(`${c.key}:${windowId(nowMs, c.seconds)}`, c.amount, c.seconds);
    if (total > c.limit) return { allowed: false, reason: c.reason };
  }
  return { allowed: true };
}

export function checkAutoresponderQuota(store: QuotaStore, args: { organizationId: string; formId: string; email: string; nowMs: number }): Promise<QuotaCheck> {
  return consume(store, args.nowMs, [
    { key: `ar:${args.formId}:${fingerprint(args.email)}`, amount: 1, limit: FORM_QUOTAS.autoresponderPerRecipientPerHour, seconds: HOUR, reason: `Autoresponder limit reached for this recipient (${FORM_QUOTAS.autoresponderPerRecipientPerHour}/hour)` },
    { key: `email:org:${args.organizationId}`, amount: 1, limit: FORM_QUOTAS.emailsPerOrgPerDay, seconds: DAY, reason: `Organization daily form email limit reached (${FORM_QUOTAS.emailsPerOrgPerDay}/day)` },
  ]);
}

export function checkEmailQuota(store: QuotaStore, args: { organizationId: string; recipients: number; nowMs: number }): Promise<QuotaCheck> {
  return consume(store, args.nowMs, [
    { key: `email:org:${args.organizationId}`, amount: Math.max(1, args.recipients), limit: FORM_QUOTAS.emailsPerOrgPerDay, seconds: DAY, reason: `Organization daily form email limit reached (${FORM_QUOTAS.emailsPerOrgPerDay}/day)` },
  ]);
}

export function checkSmsQuota(store: QuotaStore, args: { organizationId: string; phone: string; nowMs: number }): Promise<QuotaCheck> {
  const digits = args.phone.replace(/\D/g, '');
  return consume(store, args.nowMs, [
    { key: `sms:to:${args.organizationId}:${fingerprint(digits)}`, amount: 1, limit: FORM_QUOTAS.smsPerRecipientPerDay, seconds: DAY, reason: `SMS limit reached for this number (${FORM_QUOTAS.smsPerRecipientPerDay}/day)` },
    { key: `sms:org:${args.organizationId}`, amount: 1, limit: FORM_QUOTAS.smsPerOrgPerDay, seconds: DAY, reason: `Organization daily form SMS limit reached (${FORM_QUOTAS.smsPerOrgPerDay}/day)` },
  ]);
}

/**
 * Phone numbers accepted for form SMS actions: E.164 shape (`+` and 8–15 digits, first digit
 * 1–9) after stripping common separators; `00` international prefix and national numbers of
 * 8–15 digits (normalized by the provider's default country) are also accepted. Returns the
 * cleaned value or undefined.
 */
export function cleanSmsRecipient(raw: string): string | undefined {
  let s = raw.trim().replace(/^tel:/i, '').replace(/[\s().\-–/]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  if (/^0?[1-9]\d{7,14}$/.test(s) && s.replace(/^0/, '').length <= 15) return s;
  return undefined;
}
