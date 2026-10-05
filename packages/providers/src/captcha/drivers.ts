import { z } from 'zod';
import { defineDriver } from '../driver';
import { httpRequest } from '../http';
import type { CaptchaVerifier, CaptchaVerifyInput, CaptchaVerifyResult } from './types';

type CaptchaId = CaptchaVerifier['driver'];

interface SiteverifyResponse {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
  challenge_ts?: string;
}

const ENDPOINTS: Record<CaptchaId, string> = {
  'recaptcha-v2': 'https://www.google.com/recaptcha/api/siteverify',
  'recaptcha-v3': 'https://www.google.com/recaptcha/api/siteverify',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
};

export const captchaConfigSchema = z.object({
  siteKey: z.string().min(1),
  /** Optional allow-list of hostnames the token must have been issued for. */
  allowedHostnames: z.array(z.string()).default([]),
  /** reCAPTCHA v3 only: default minimum score (0–1) when the form doesn't specify one. */
  minScore: z.number().min(0).max(1).default(0.5),
  /** reCAPTCHA Enterprise / self-hosted proxies can override the verify endpoint. */
  verifyUrl: z.string().url().optional(),
});
export const captchaSecretsSchema = z.object({ secretKey: z.string().min(1) });
export type CaptchaConfig = z.output<typeof captchaConfigSchema>;

/**
 * Server-side siteverify for reCAPTCHA v2/v3, Cloudflare Turnstile and hCaptcha.
 * Network failures are treated as verification failures (`errorCodes: ['verify-unavailable']`)
 * so a captcha outage never silently lets spam through.
 */
export class SiteverifyCaptcha implements CaptchaVerifier {
  constructor(
    readonly driver: CaptchaId,
    private readonly config: CaptchaConfig,
    private readonly secrets: z.output<typeof captchaSecretsSchema>,
  ) {}

  get siteKey(): string {
    return this.config.siteKey;
  }

  async verify(input: CaptchaVerifyInput): Promise<CaptchaVerifyResult> {
    if (!input.token) return { success: false, errorCodes: ['missing-input-response'] };
    const form = new URLSearchParams({ secret: this.secrets.secretKey, response: input.token });
    if (input.remoteIp) form.set('remoteip', input.remoteIp);
    if (this.driver === 'hcaptcha') form.set('sitekey', this.config.siteKey);
    let data: SiteverifyResponse;
    try {
      const res = await httpRequest<SiteverifyResponse>(this.driver, this.config.verifyUrl ?? ENDPOINTS[this.driver], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        timeoutMs: 8000,
      });
      data = res.data ?? {};
    } catch {
      return { success: false, errorCodes: ['verify-unavailable'] };
    }
    const result: CaptchaVerifyResult = {
      success: data.success === true,
      score: typeof data.score === 'number' ? data.score : undefined,
      action: data.action,
      hostname: data.hostname,
      errorCodes: data['error-codes']?.length ? data['error-codes'] : undefined,
    };
    if (!result.success) return result;
    const errors: string[] = [];
    if (this.config.allowedHostnames.length && result.hostname && !this.config.allowedHostnames.some((h) => h === result.hostname || result.hostname!.endsWith(`.${h}`))) {
      errors.push('hostname-mismatch');
    }
    if (this.driver === 'recaptcha-v3') {
      const min = input.minScore ?? this.config.minScore;
      if (result.score === undefined || result.score < min) errors.push('score-too-low');
      if (input.action && result.action !== input.action) errors.push('action-mismatch');
    } else if (this.driver === 'turnstile' && input.action && result.action && result.action !== input.action) {
      errors.push('action-mismatch');
    }
    if (errors.length) return { ...result, success: false, errorCodes: [...(result.errorCodes ?? []), ...errors] };
    return result;
  }
}

function captchaDriver(id: CaptchaId, name: string, description: string) {
  return defineDriver({
    kind: 'captcha',
    id,
    name,
    description,
    configSchema: captchaConfigSchema,
    secretsSchema: captchaSecretsSchema,
    create: (config, secrets): CaptchaVerifier => new SiteverifyCaptcha(id, config, secrets),
  });
}

export const recaptchaV2Driver = captchaDriver('recaptcha-v2', 'Google reCAPTCHA v2', 'Checkbox / invisible challenge. Create keys at https://www.google.com/recaptcha/admin (type: v2).');
export const recaptchaV3Driver = captchaDriver('recaptcha-v3', 'Google reCAPTCHA v3', 'Invisible score-based verification (0.0 bot – 1.0 human) with action checks.');
export const turnstileDriver = captchaDriver('turnstile', 'Cloudflare Turnstile', 'Privacy-friendly, mostly invisible challenge from Cloudflare.');
export const hcaptchaDriver = captchaDriver('hcaptcha', 'hCaptcha', 'Privacy-focused captcha alternative.');
