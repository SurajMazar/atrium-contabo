import { z } from 'zod';
import { defineDriver, ProviderError, type TestResult } from '{{driverImport}}';
import type { PutObjectInput, StoredObject, StorageProvider } from '{{typesImport}}';

export const {{camel}}ConfigSchema = z.object({
  bucket: z.string().min(1),
  endpoint: z.string().url().optional(),
  publicBaseUrl: z.string().url().describe('Public URL prefix for objects with visibility=public'),
});
export const {{camel}}SecretsSchema = z.object({ accessKeyId: z.string().min(1), secretAccessKey: z.string().min(1) });

const todo = (op: string): never => {
  throw new ProviderError(`{{id}}: ${op}() not implemented`, '{{id}}', false);
};

export class {{Pascal}}StorageProvider implements StorageProvider {
  readonly driver = '{{id}}';
  constructor(
    private readonly config: z.output<typeof {{camel}}ConfigSchema>,
    private readonly secrets: z.output<typeof {{camel}}SecretsSchema>,
  ) {}

  async upload(input: PutObjectInput): Promise<StoredObject> {
    void this.secrets;
    return todo(`upload ${input.key}`);
  }
  async download(key: string): Promise<Buffer> {
    return todo(`download ${key}`);
  }
  async delete(key: string): Promise<void> {
    todo(`delete ${key}`);
  }
  async move(fromKey: string, toKey: string): Promise<void> {
    await this.copy(fromKey, toKey);
    await this.delete(fromKey);
  }
  async copy(fromKey: string, toKey: string): Promise<void> {
    todo(`copy ${fromKey} → ${toKey}`);
  }
  async exists(key: string): Promise<boolean> {
    return todo(`exists ${key}`);
  }
  getPublicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  async getSignedUrl(key: string): Promise<string> {
    return todo(`getSignedUrl ${key}`);
  }
  async test(): Promise<TestResult> {
    try {
      const key = `.atrium-test-${Date.now()}`;
      await this.upload({ key, body: Buffer.from('ok'), contentType: 'text/plain', visibility: 'private' });
      await this.delete(key);
      return { ok: true, message: `Read/write OK on ${this.config.bucket}` };
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
  create: (config, secrets): StorageProvider => new {{Pascal}}StorageProvider(config, secrets),
});
