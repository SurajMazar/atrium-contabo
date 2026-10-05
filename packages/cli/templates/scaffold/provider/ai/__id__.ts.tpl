import { z } from 'zod';
import { defineDriver, ProviderError, type TestResult } from '{{driverImport}}';
import type { AIProvider, AiChatRequest, AiChatResponse, AiStreamEvent, AiUsage, ModelInfo, StructuredRequest } from '{{typesImport}}';

export const {{camel}}ConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().default('{{id}}-default'),
});
export const {{camel}}SecretsSchema = z.object({ apiKey: z.string().min(1) });

/**
 * AI providers are only ever called through the agent's validated tool loop — they never get
 * database or shell access. Implement chat() with tool calling; the rest can build on it.
 */
export class {{Pascal}}AiProvider implements AIProvider {
  readonly driver = '{{id}}';
  readonly models: ModelInfo[] = [
    { id: '{{id}}-default', label: '{{title}} default', inputPrice: 0, outputPrice: 0, supportsTools: true, default: true },
  ];
  constructor(
    private readonly config: z.output<typeof {{camel}}ConfigSchema>,
    private readonly secrets: z.output<typeof {{camel}}SecretsSchema>,
  ) {}

  async chat(req: AiChatRequest): Promise<AiChatResponse> {
    void this.secrets;
    throw new ProviderError(`{{id}}: chat() not implemented (model ${req.model ?? this.config.defaultModel})`, this.driver, false);
  }

  async *stream(req: AiChatRequest): AsyncIterable<AiStreamEvent> {
    const response = await this.chat(req);
    for (const part of response.content) if (part.type === 'text') yield { type: 'text', delta: part.text };
    yield { type: 'done', response };
  }

  async generateText(req: { model?: string; system?: string; prompt: string; maxTokens?: number }) {
    const res = await this.chat({ model: req.model, system: req.system, maxTokens: req.maxTokens, messages: [{ role: 'user', content: [{ type: 'text', text: req.prompt }] }] });
    const text = res.content.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return { text, usage: res.usage, model: res.model };
  }

  async generateStructuredData<T>(req: StructuredRequest<T>) {
    const { text, usage, model } = await this.generateText({ model: req.model, system: `${req.system ?? ''}\nReply with JSON matching ${req.schemaName}.`, prompt: req.prompt, maxTokens: req.maxTokens });
    return { data: req.parse(JSON.parse(text)), usage, model };
  }

  estimateCost(model: string, usage: AiUsage): number {
    const m = this.models.find((x) => x.id === model) ?? this.models[0]!;
    return (usage.inputTokens * m.inputPrice + usage.outputTokens * m.outputPrice) / 1_000_000;
  }

  async test(): Promise<TestResult> {
    try {
      await this.generateText({ prompt: 'Reply with OK.', maxTokens: 5 });
      return { ok: true, message: 'Model responded' };
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
  create: (config, secrets): AIProvider => new {{Pascal}}AiProvider(config, secrets),
});
