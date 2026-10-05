/** Heuristic spam score in [0,1]. Combined with honeypot + captcha signals. */
export function spamScore(values: Record<string, unknown>, signals: { honeypot: boolean; captchaScore?: number; elapsedMs?: number }): number {
  let score = 0;
  if (signals.honeypot) return 1;
  if (signals.captchaScore !== undefined) score += Math.max(0, 0.6 - signals.captchaScore);
  if (signals.elapsedMs !== undefined && signals.elapsedMs < 2500) score += 0.35;
  const text = Object.values(values).filter((v) => typeof v === 'string').join(' ');
  const links = (text.match(/https?:\/\//gi) ?? []).length;
  if (links >= 3) score += 0.3;
  else if (links >= 1) score += 0.1;
  if (/\b(viagra|casino|crypto ?profit|seo services|backlinks|loan offer|bitcoin investment)\b/i.test(text)) score += 0.4;
  if (/(.)\1{9,}/.test(text)) score += 0.15;
  if (/[Ѐ-ӿ]{20,}/.test(text) && !/[a-z]{3,}/i.test(text)) score += 0.1;
  return Math.min(1, Math.round(score * 100) / 100);
}
