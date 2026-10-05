import type { AIProvider, AiChatRequest, AiChatResponse, AiUsage, ModelInfo } from '@atrium/providers';
import { z } from 'zod';

export interface UsageTotals extends AiUsage {
  requests: number;
  costUsd: number;
  /** Requests already counted against the org quota by `beforeCall` (see `recordUsage`). */
  reservedRequests?: number;
}

/** Raised when a per-request budget, the org quota or the request deadline stops an AI call. */
export class AiLimitError extends Error {
  constructor(message: string, readonly kind: 'budget' | 'quota' | 'deadline' | 'model') {
    super(message);
    this.name = 'AiLimitError';
  }
}

export interface LlmOptions {
  /** Overall deadline / cancellation for every provider call made through this Llm. */
  signal?: AbortSignal;
  /** Hard cap on input+output tokens across all calls of this request. */
  maxTotalTokens?: number;
  /** Hard cap on provider calls for this request. */
  maxRequests?: number;
  /**
   * Called before every provider call (e.g. atomic quota reservation). Throw to refuse the call.
   * Each successful invocation counts as one reserved request.
   */
  beforeCall?: () => Promise<void>;
}

/** Exact catalog match (dated snapshots like `model-20260101` match their base id). */
export function findCatalogModel(models: ModelInfo[], id: string): ModelInfo | undefined {
  return models.find((m) => m.id === id) ?? models.find((m) => id.startsWith(`${m.id}-`) && /^-\d{6,8}$/.test(id.slice(m.id.length)));
}

/**
 * Model ids from clients are allowlisted against the provider's catalog: unknown ids are refused
 * (they would otherwise bypass price estimation and could select arbitrarily expensive models).
 */
export function assertModelAllowed(provider: Pick<AIProvider, 'models' | 'driver'>, model: string | undefined | null): string | undefined {
  if (!model || model === 'default') return undefined;
  if (!findCatalogModel(provider.models, model)) throw new AiLimitError(`Unknown model "${model.slice(0, 80)}" for provider ${provider.driver}. Choose one of: ${provider.models.map((m) => m.id).join(', ')}`, 'model');
  return model;
}

/** Thin, provider-neutral helper that tracks usage across a multi-step generation. */
export class Llm {
  readonly usage: UsageTotals = { inputTokens: 0, outputTokens: 0, requests: 0, costUsd: 0, reservedRequests: 0 };
  readonly options: LlmOptions;

  constructor(readonly provider: AIProvider, readonly model?: string, opts?: AbortSignal | LlmOptions) {
    this.options = opts instanceof AbortSignal ? { signal: opts } : (opts ?? {});
  }

  get signal(): AbortSignal | undefined {
    return this.options.signal;
  }

  get modelId(): string {
    return this.model ?? this.provider.models.find((m) => m.default)?.id ?? this.provider.models[0]?.id ?? 'default';
  }

  /** Cost of a call. Models missing from the catalog are priced at the catalog's most expensive model, never 0. */
  estimate(model: string, u: AiUsage): number {
    const models = this.provider.models;
    if (findCatalogModel(models, model) || !models.length) return this.provider.estimateCost(model, u);
    const priciest = [...models].sort((a, b) => b.inputPrice + b.outputPrice - (a.inputPrice + a.outputPrice))[0]!;
    return this.provider.estimateCost(priciest.id, u);
  }

  track(u: AiUsage, model: string) {
    this.usage.inputTokens += u.inputTokens;
    this.usage.outputTokens += u.outputTokens;
    this.usage.cacheReadTokens = (this.usage.cacheReadTokens ?? 0) + (u.cacheReadTokens ?? 0);
    this.usage.requests += 1;
    this.usage.costUsd += this.estimate(model, u);
  }

  /** Enforce deadline + budgets and run the reservation hook. Call before EVERY provider call. */
  async guard(): Promise<void> {
    const { signal, maxTotalTokens, maxRequests, beforeCall } = this.options;
    if (signal?.aborted) throw new AiLimitError('The AI request took too long and was stopped', 'deadline');
    if (maxRequests !== undefined && this.usage.requests >= maxRequests) throw new AiLimitError(`AI request budget reached (${maxRequests} model calls)`, 'budget');
    if (maxTotalTokens !== undefined && this.usage.inputTokens + this.usage.outputTokens >= maxTotalTokens) throw new AiLimitError(`AI token budget reached (${maxTotalTokens} tokens)`, 'budget');
    if (beforeCall) {
      await beforeCall();
      this.usage.reservedRequests = (this.usage.reservedRequests ?? 0) + 1;
    }
  }

  /** Remaining token budget for `maxTokens` clamping. */
  private clamp(maxTokens: number): number {
    const cap = this.options.maxTotalTokens;
    if (cap === undefined) return maxTokens;
    return Math.max(256, Math.min(maxTokens, cap - this.usage.inputTokens - this.usage.outputTokens));
  }

  /** One chat turn (tool use) with deadline, budget and usage tracking. */
  async chat(req: Omit<AiChatRequest, 'model' | 'signal'>): Promise<AiChatResponse> {
    await this.guard();
    const res = await this.provider.chat({ ...req, model: this.model, maxTokens: this.clamp(req.maxTokens ?? 16_000), signal: this.signal });
    this.track(res.usage, res.model);
    return res;
  }

  /** Structured JSON generation validated by a Zod schema (provider handles schema-constrained decoding + repair). */
  async json<S extends z.ZodType>(name: string, schema: S, system: string, prompt: string, maxTokens = 16_000): Promise<z.output<S>> {
    await this.guard();
    const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    const res = await this.provider.generateStructuredData({
      model: this.model,
      system,
      prompt,
      schema: jsonSchema,
      schemaName: name,
      parse: (v) => schema.parse(v),
      maxTokens: this.clamp(maxTokens),
      signal: this.signal,
    });
    this.track(res.usage, res.model);
    return res.data as z.output<S>;
  }

  async text(system: string, prompt: string, maxTokens = 4000): Promise<string> {
    await this.guard();
    const res = await this.provider.generateText({ model: this.model, system, prompt, maxTokens: this.clamp(maxTokens), signal: this.signal });
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
