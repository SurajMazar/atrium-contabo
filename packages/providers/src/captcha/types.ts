export interface CaptchaVerifyInput {
  token: string;
  remoteIp?: string;
  /** reCAPTCHA v3 action name expected. */
  action?: string;
  minScore?: number;
}

export interface CaptchaVerifyResult {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  errorCodes?: string[];
}

export interface CaptchaVerifier {
  readonly driver: 'recaptcha-v2' | 'recaptcha-v3' | 'turnstile' | 'hcaptcha';
  /** Public site key exposed to the rendered website. */
  readonly siteKey: string;
  verify(input: CaptchaVerifyInput): Promise<CaptchaVerifyResult>;
}
