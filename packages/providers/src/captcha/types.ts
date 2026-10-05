export interface CaptchaVerifyInput {
  token: string;
  remoteIp?: string;
  /** reCAPTCHA v3 action name expected. */
  action?: string;
  minScore?: number;
  /**
   * Hostnames the token must have been solved on (the website's verified domains + its platform
   * subdomain; `*.example.com` wildcards allowed). When provided and the vendor reports a
   * hostname, a mismatch fails verification with `hostname-mismatch`.
   */
  expectedHostnames?: string[];
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
