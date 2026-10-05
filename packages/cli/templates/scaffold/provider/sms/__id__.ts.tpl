import { z } from 'zod';
import { defineDriver, ProviderError, type TestResult } from '{{driverImport}}';
import type { SmsParams, SmsProvider, SmsResult } from '{{typesImport}}';

export const {{camel}}ConfigSchema = z.object({
  senderId: z.string().max(11).optional().describe('Alphanumeric sender id or number'),
  defaultCountry: z.string().optional(),
});
export const {{camel}}SecretsSchema = z.object({ apiKey: z.string().min(1) });

export class {{Pascal}}SmsProvider implements SmsProvider {
  readonly driver = '{{id}}';
  constructor(
    private readonly config: z.output<typeof {{camel}}ConfigSchema>,
    private readonly secrets: z.output<typeof {{camel}}SecretsSchema>,
  ) {}

  async send(params: SmsParams): Promise<SmsResult> {
    // TODO: normalize params.to to E.164, call the API, map the status.
    void this.config;
    void this.secrets;
    throw new ProviderError(`{{id}}: send() not implemented (to ${params.to})`, this.driver, false);
  }

  async test(to?: string): Promise<TestResult> {
    try {
      if (to) {
        const res = await this.send({ to, body: 'Atrium SMS test' });
        return { ok: res.status !== 'failed', message: `Test SMS ${res.status}` };
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
  create: (config, secrets): SmsProvider => new {{Pascal}}SmsProvider(config, secrets),
});
