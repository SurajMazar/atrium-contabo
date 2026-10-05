import { z } from 'zod';
import { defineDriver, ProviderError, type TestResult } from '{{driverImport}}';
import type { EmailMessage, EmailProvider, SendResult } from '{{typesImport}}';

export const {{camel}}ConfigSchema = z.object({
  /** Non-secret settings shown in the admin form. */
  baseUrl: z.string().url().default('https://api.example.com'),
  region: z.string().optional(),
});
export const {{camel}}SecretsSchema = z.object({ apiKey: z.string().min(1) });

export class {{Pascal}}EmailProvider implements EmailProvider {
  readonly driver = '{{id}}';
  constructor(
    private readonly config: z.output<typeof {{camel}}ConfigSchema>,
    private readonly secrets: z.output<typeof {{camel}}SecretsSchema>,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    // TODO: call the provider API. Map provider errors to ProviderError(retryable = 5xx/429).
    void this.config;
    void this.secrets;
    throw new ProviderError(`{{id}}: send() not implemented (to ${message.to.map((t) => t.email).join(', ')})`, this.driver, false);
  }

  async test(to?: string): Promise<TestResult> {
    try {
      if (to) {
        const res = await this.send({ from: { email: 'no-reply@example.com' }, to: [{ email: to }], subject: 'Atrium test email', text: 'It works.' });
        return { ok: res.rejected.length === 0, message: `Sent test email to ${to}` };
      }
      return { ok: true, message: 'Credentials look valid' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const {{camel}}Driver = defineDriver({
  kind: '{{kind}}',
  id: '{{id}}',
  name: '{{title}}',
  description: 'TODO: one line shown in the admin integrations picker.',
  configSchema: {{camel}}ConfigSchema,
  secretsSchema: {{camel}}SecretsSchema,
  create: (config, secrets): EmailProvider => new {{Pascal}}EmailProvider(config, secrets),
});
