import type { AIProvider, AiUsage } from '@atrium/providers';
import { z } from 'zod';

export interface UsageTotals extends AiUsage {
  requests: number;
  costUsd: number;
}

/** Thin, provider-neutral helper that tracks usage across a multi-step generation. */
export class Llm {
  readonly usage: UsageTotals = { inputTokens: 0, outputTokens: 0, requests: 0, costUsd: 0 };
  constructor(readonly provider: AIProvider, readonly model?: string, private readonly signal?: AbortSignal) {}

  get modelId(): string {
    return this.model ?? this.provider.models.find((m) => m.default)?.id ?? this.provider.models[0]?.id ?? 'default';
  }

  track(u: AiUsage, model: string) {
    this.usage.inputTokens += u.inputTokens;
    this.usage.outputTokens += u.outputTokens;
    this.usage.cacheReadTokens = (this.usage.cacheReadTokens ?? 0) + (u.cacheReadTokens ?? 0);
    this.usage.requests += 1;
    this.usage.costUsd += this.provider.estimateCost(model, u);
  }

  /** Structured JSON generation validated by a Zod schema (provider handles schema-constrained decoding + repair). */
  async json<S extends z.ZodType>(name: string, schema: S, system: string, prompt: string, maxTokens = 16_000): Promise<z.output<S>> {
    const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    const res = await this.provider.generateStructuredData({
      model: this.model,
      system,
      prompt,
      schema: jsonSchema,
      schemaName: name,
      parse: (v) => schema.parse(v),
      maxTokens,
      signal: this.signal,
    });
    this.track(res.usage, res.model);
    return res.data as z.output<S>;
  }

  async text(system: string, prompt: string, maxTokens = 4000): Promise<string> {
    const res = await this.provider.generateText({ model: this.model, system, prompt, maxTokens, signal: this.signal });
    this.track(res.usage, res.model);
    return res.text.trim();
  }
}

/** Run async tasks with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}
