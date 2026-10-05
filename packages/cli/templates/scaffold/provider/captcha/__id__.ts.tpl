import { z } from 'zod';
import { defineDriver } from '{{driverImport}}';
import type { CaptchaVerifier, CaptchaVerifyInput, CaptchaVerifyResult } from '{{typesImport}}';

export const {{camel}}ConfigSchema = z.object({ siteKey: z.string().min(1), minScore: z.number().min(0).max(1).default(0.5) });
export const {{camel}}SecretsSchema = z.object({ secretKey: z.string().min(1) });

/**
 * NOTE: CaptchaVerifier['driver'] is a closed union in captcha/types.ts — add '{{id}}' there.
 * Fail closed: network errors must return success=false so outages never let spam through.
 */
export class {{Pascal}}CaptchaVerifier implements CaptchaVerifier {
  readonly driver = '{{id}}' as CaptchaVerifier['driver'];
  readonly siteKey: string;
  constructor(
    private readonly config: z.output<typeof {{camel}}ConfigSchema>,
    private readonly secrets: z.output<typeof {{camel}}SecretsSchema>,
  ) {
    this.siteKey = config.siteKey;
  }

  async verify(input: CaptchaVerifyInput): Promise<CaptchaVerifyResult> {
    void this.secrets;
    if (!input.token) return { success: false, errorCodes: ['missing-input-response'] };
    // TODO: POST token + secret to the provider's siteverify endpoint.
    return { success: false, errorCodes: ['not-implemented'], score: undefined };
  }
}

export const {{camel}}Driver = defineDriver({
  kind: '{{kind}}',
  id: '{{id}}',
  name: '{{title}}',
  description: 'TODO: one line shown in the admin integrations picker.',
  configSchema: {{camel}}ConfigSchema,
  secretsSchema: {{camel}}SecretsSchema,
  create: (config, secrets): CaptchaVerifier => new {{Pascal}}CaptchaVerifier(config, secrets),
});
