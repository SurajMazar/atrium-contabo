import { z } from 'zod';
import type AnthropicSdk from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlockParam,
  BetaTool,
  BetaToolChoice,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { defineDriver, ProviderError, TENANT_CONTEXT, type DriverContext, type TestResult } from '../driver';
import { createGuardedSdkFetch } from '../net/guard';
import { allowsPrivate } from '../net/policy';
import {
  addUsage,
  appendSystem,
  defaultModel,
  describeValidationError,
  estimateCostFromCatalog,
  extractJson,
  findModel,
  isStrictCompatible,
  parseDataUrl,
  ProviderRefusalError,
  textOf,
  toolChoiceInstruction,
} from './common';
import type {
  AiChatRequest,
  AiChatResponse,
  AiContentPart,
  AiEffort,
  AIProvider,
  AiStreamEvent,
  AiUsage,
  ModelInfo,
  StructuredRequest,
} from './types';

const PROVIDER = 'anthropic';

/** Beta header for the scalar `fallbacks: 'default'` form (category-routed server-side refusal fallback). */
export const ANTHROPIC_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 32_000;

/** USD per 1M tokens. Cache writes are billed at 1.25× input (5-minute TTL). */
export const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', inputPrice: 4, outputPrice: 20, cacheReadPrice: 0.2, cacheWritePrice: 5, contextWindow: 1_000_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true, default: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', inputPrice: 2, outputPrice: 10, cacheReadPrice: 0.2, cacheWritePrice: 2.5, contextWindow: 1_000_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', inputPrice: 1, outputPrice: 5, cacheReadPrice: 0.1, cacheWritePrice: 1.25, contextWindow: 200_000, maxOutputTokens: 64_000, supportsImages: true, supportsTools: true },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', inputPrice: 10, outputPrice: 50, cacheReadPrice: 0.25, cacheWritePrice: 12.5, contextWindow: 1_000_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  // Server-side refusal-fallback targets: responses may report these models when a fallback served the turn.
  { id: 'claude-opus-5', label: 'Claude Opus 5 (fallback)', inputPrice: 5, outputPrice: 25, cacheReadPrice: 0.5, cacheWritePrice: 6.25, contextWindow: 1_000_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (fallback)', inputPrice: 5, outputPrice: 25, cacheReadPrice: 0.5, cacheWritePrice: 6.25, contextWindow: 1_000_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
];

/**
 * Per-model request-shape capabilities. Current models (Opus 5.5 / Sonnet 5.5 / Fable 5.1) run
 * adaptive thinking always-on (no `thinking` param, never budget_tokens/disabled), reject
 * forced tool_choice, reject non-default temperature, and accept `fallbacks: 'default'`.
 * Haiku 4.5 is the previous generation: no effort param, forced tool_choice allowed.
 */
interface ModelCaps {
  effort: boolean;
  forcedToolChoice: boolean;
  temperature: boolean;
  serverFallback: boolean;
}
const CURRENT_CAPS: ModelCaps = { effort: true, forcedToolChoice: false, temperature: false, serverFallback: true };
const MODEL_CAPS: Record<string, ModelCaps> = {
  'claude-opus-5-5': CURRENT_CAPS,
  'claude-sonnet-5-5': CURRENT_CAPS,
  'claude-fable-5-1': CURRENT_CAPS,
  'claude-opus-5': { effort: true, forcedToolChoice: true, temperature: false, serverFallback: true },
  'claude-opus-4-8': { effort: true, forcedToolChoice: true, temperature: false, serverFallback: false },
  'claude-haiku-4-5': { effort: false, forcedToolChoice: true, temperature: true, serverFallback: false },
};
export function anthropicModelCaps(model: string): ModelCaps {
  const key = Object.keys(MODEL_CAPS).find((k) => model === k || model.startsWith(`${k}-`));
  // Unknown (newer) models: assume the current-generation request shape.
  return key ? MODEL_CAPS[key]! : CURRENT_CAPS;
}

export interface AnthropicMapOptions {
  defaultModel: string;
  defaultEffort?: AiEffort;
  defaultMaxTokens?: number;
  /** Enable `fallbacks: 'default'` (server-side refusal fallback) on models that support it. */
  serverSideFallbacks: boolean;
}

export type AnthropicRequestParams = MessageCreateParamsNonStreaming & { betas?: string[] };

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function imageBlock(part: Extract<AiContentPart, { type: 'image' }>): BetaContentBlockParam {
  const data = parseDataUrl(part.url);
  if (data) {
    const mediaType = (IMAGE_TYPES.has(data.mediaType) ? data.mediaType : part.mediaType ?? 'image/png') as ImageMediaType;
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: data.data } };
  }
  return { type: 'image', source: { type: 'url', url: part.url } };
}

/** Neutral parts → Anthropic content blocks. Anthropic provider_raw blocks are echoed byte-for-byte. */
export function toAnthropicContent(parts: AiContentPart[], role: 'user' | 'assistant'): BetaContentBlockParam[] {
  const out: BetaContentBlockParam[] = [];
  for (const part of parts) {
    switch (part.type) {
      case 'text':
        if (part.text.length) out.push({ type: 'text', text: part.text });
        break;
      case 'image':
        out.push(imageBlock(part));
        break;
      case 'tool_call':
        out.push({ type: 'tool_use', id: part.id, name: part.name, input: part.input });
        break;
      case 'tool_result':
        out.push({ type: 'tool_result', tool_use_id: part.toolCallId, content: part.content, ...(part.isError ? { is_error: true } : {}) });
        break;
      case 'provider_raw':
        if (part.provider === PROVIDER) out.push(part.data as BetaContentBlockParam);
        break;
    }
  }
  // The API requires tool_result blocks to lead a user turn. Deterministic (stable) reordering
  // of the request rendering — the caller's stored history is never mutated.
  if (role === 'user' && out.some((b) => b.type === 'tool_result')) {
    return [...out.filter((b) => b.type === 'tool_result'), ...out.filter((b) => b.type !== 'tool_result')];
  }
  return out;
}

export function toAnthropicMessages(messages: AiChatRequest['messages']): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  for (const m of messages) {
    const content = toAnthropicContent(m.content, m.role);
    if (content.length) out.push({ role: m.role, content });
  }
  return out;
}

/** Anthropic structured outputs need closed objects; returns undefined when the schema can't be closed. */
export function toAnthropicOutputSchema(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  let supported = true;
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;
    const src = node as Record<string, unknown>;
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === '$schema') continue;
      res[k] = k === 'properties' || k === '$defs' || k === 'definitions' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, visit(pv)])) : visit(v);
    }
    const isObject = src.type === 'object' || (Array.isArray(src.type) && src.type.includes('object')) || 'properties' in src;
    if (isObject) {
      if (src.additionalProperties === undefined || src.additionalProperties === false) res.additionalProperties = false;
      else supported = false;
    }
    return res;
  };
  const out = visit(schema) as Record<string, unknown>;
  return supported ? out : undefined;
}

/** Build Messages API params from a neutral request (pure; exported for tests). */
export function toAnthropicParams(req: AiChatRequest, opts: AnthropicMapOptions): AnthropicRequestParams {
  const model = req.model ?? opts.defaultModel;
  const caps = anthropicModelCaps(model);
  const params: AnthropicRequestParams = {
    model,
    max_tokens: req.maxTokens ?? opts.defaultMaxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    messages: toAnthropicMessages(req.messages),
  };

  // Tool choice: forced choice 400s on current models → `auto` + an instruction in a separate
  // system block placed AFTER the cached system prefix (keeps the cache and the history intact).
  let choiceInstruction: string | undefined;
  let toolChoice: BetaToolChoice | undefined;
  if (req.tools?.length && req.toolChoice) {
    const c = req.toolChoice;
    if (c === 'none') toolChoice = { type: 'none' };
    else if (c === 'auto') toolChoice = { type: 'auto' };
    else if (caps.forcedToolChoice) toolChoice = c === 'any' ? { type: 'any' } : { type: 'tool', name: c.name };
    else {
      toolChoice = { type: 'auto' };
      choiceInstruction = toolChoiceInstruction(c);
    }
  }

  const systemBlocks: BetaTextBlockParam[] = [];
  if (req.system) systemBlocks.push({ type: 'text', text: req.system, ...(req.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) });
  if (choiceInstruction) systemBlocks.push({ type: 'text', text: choiceInstruction });
  if (systemBlocks.length === 1 && !req.cache) params.system = systemBlocks[0]!.text;
  else if (systemBlocks.length) params.system = systemBlocks;

  if (req.tools?.length) {
    params.tools = req.tools.map((t, i, all): BetaTool => {
      const tool: BetaTool = {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as BetaTool['input_schema'],
      };
      if (isStrictCompatible(t.inputSchema)) tool.strict = true;
      if (req.cache && i === all.length - 1) tool.cache_control = { type: 'ephemeral' };
      return tool;
    });
    if (toolChoice) params.tool_choice = toolChoice;
  }
  // Conversation-history caching: automatic breakpoint on the last cacheable block.
  if (req.cache) params.cache_control = { type: 'ephemeral' };

  // Thinking is always on (adaptive) for current models — `thinking` is intentionally omitted.
  const effort = req.effort ?? opts.defaultEffort;
  if (effort && caps.effort) params.output_config = { effort };
  if (req.temperature !== undefined && caps.temperature) params.temperature = req.temperature;
  if (req.metadata?.userId) params.metadata = { user_id: req.metadata.userId };
  if (opts.serverSideFallbacks && caps.serverFallback) {
    params.betas = [ANTHROPIC_FALLBACK_BETA];
    params.fallbacks = 'default';
  }
  return params;
}

function mapStopReason(reason: string | null | undefined): AiChatResponse['stopReason'] {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'pause_turn':
      return 'pause';
    default:
      return 'other';
  }
}

export function fromAnthropicUsage(u: BetaMessage['usage'] | undefined): AiUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? undefined,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? undefined,
  };
}

/**
 * Response → neutral parts. `text` and `tool_use` become neutral parts; every other block
 * (thinking, redacted_thinking, fallback, compaction, server tool results…) becomes a
 * `provider_raw` part that must be appended to history unchanged.
 */
export function fromAnthropicContent(blocks: BetaContentBlock[]): AiContentPart[] {
  return blocks.map((b): AiContentPart => {
    if (b.type === 'text' && !b.citations?.length) return { type: 'text', text: b.text };
    if (b.type === 'tool_use') return { type: 'tool_call', id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> };
    return { type: 'provider_raw', provider: PROVIDER, data: b };
  });
}

/** Map a final message to the neutral response; refusals throw ProviderRefusalError. */
export function fromAnthropicMessage(msg: BetaMessage): AiChatResponse {
  if (msg.stop_reason === 'refusal') {
    const details = msg.stop_details;
    const category = details?.category ?? null;
    throw new ProviderRefusalError(
      `anthropic: the model declined this request${category ? ` (category: ${category})` : ''}${details?.explanation ? ` — ${details.explanation}` : ''}`,
      PROVIDER,
      category,
      details?.explanation ?? undefined,
    );
  }
  return {
    content: fromAnthropicContent(msg.content),
    stopReason: mapStopReason(msg.stop_reason),
    rawStopReason: msg.stop_reason ?? undefined,
    usage: fromAnthropicUsage(msg.usage),
    model: msg.model,
    provider: PROVIDER,
  };
}

type SdkModule = typeof import('@anthropic-ai/sdk');

/** Map SDK errors to ProviderError with retryability (typed SDK errors, never string matching). */
export function toAnthropicError(err: unknown, sdk?: SdkModule): ProviderError {
  if (err instanceof ProviderError) return err;
  const A = sdk?.default;
  if (A) {
    if (err instanceof A.RateLimitError) return new ProviderError('anthropic: rate limited — retry later', PROVIDER, true, err);
    if (err instanceof A.AuthenticationError) return new ProviderError('anthropic: invalid API key', PROVIDER, false, err);
    if (err instanceof A.PermissionDeniedError) return new ProviderError(`anthropic: permission denied — ${err.message}`, PROVIDER, false, err);
    if (err instanceof A.NotFoundError) return new ProviderError(`anthropic: not found — ${err.message}`, PROVIDER, false, err);
    if (err instanceof A.BadRequestError) return new ProviderError(`anthropic: bad request — ${err.message}`, PROVIDER, false, err);
    if (err instanceof A.InternalServerError) return new ProviderError(`anthropic: server error — ${err.message}`, PROVIDER, true, err);
    if (err instanceof A.APIConnectionError) return new ProviderError(`anthropic: connection error — ${err.message}`, PROVIDER, true, err);
    if (err instanceof A.APIError) {
      const status = typeof err.status === 'number' ? err.status : 0;
      return new ProviderError(`anthropic: API error ${status} — ${err.message}`, PROVIDER, status === 408 || status === 409 || status === 429 || status >= 500, err);
    }
  }
  if (err instanceof Error && err.name === 'AbortError') return new ProviderError('anthropic: request aborted', PROVIDER, false, err);
  return new ProviderError(`anthropic: ${err instanceof Error ? err.message : String(err)}`, PROVIDER, false, err);
}

/** Minimal client surface we use — lets tests inject a fake. */
export interface AnthropicClientLike {
  beta: {
    messages: {
      stream(params: AnthropicRequestParams, options?: { signal?: AbortSignal }): AsyncIterable<unknown> & { finalMessage(): Promise<BetaMessage> };
    };
  };
  models: { retrieve(id: string): Promise<{ id: string; display_name?: string }> };
}

export const anthropicConfigSchema = z.object({
  defaultModel: z.string().default(ANTHROPIC_DEFAULT_MODEL),
  /** Default reasoning effort; Opus 5.5's own default is `medium`. Site generation passes `high`. */
  defaultEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  defaultMaxTokens: z.number().int().min(256).max(128_000).default(ANTHROPIC_DEFAULT_MAX_TOKENS),
  /** Server-side refusal fallbacks (`fallbacks: 'default'`). On by default; turn off to surface refusals directly. */
  serverSideFallbacks: z.boolean().default(true),
  baseUrl: z.string().url().optional(),
  maxRetries: z.number().int().min(0).max(10).default(2),
  /** Per-request timeout in ms (streaming keeps long generations alive). */
  timeoutMs: z.number().int().min(1000).default(600_000),
});
export const anthropicSecretsSchema = z.object({ apiKey: z.string().min(1) });
export type AnthropicConfig = z.output<typeof anthropicConfigSchema>;

export class AnthropicProvider implements AIProvider {
  readonly driver = PROVIDER;
  readonly models = ANTHROPIC_MODELS;
  private clientPromise?: Promise<AnthropicClientLike>;
  private sdk?: SdkModule;

  constructor(
    private readonly config: AnthropicConfig,
    private readonly secrets: { apiKey: string },
    client?: AnthropicClientLike,
    private readonly ctx: DriverContext = TENANT_CONTEXT,
  ) {
    if (client) this.clientPromise = Promise.resolve(client);
  }

  private client(): Promise<AnthropicClientLike> {
    this.clientPromise ??= import('@anthropic-ai/sdk').then((mod) => {
      this.sdk = mod;
      const Anthropic = mod.default;
      const c: AnthropicSdk = new Anthropic({
        apiKey: this.secrets.apiKey,
        baseURL: this.config.baseUrl,
        // Tenant base URLs: connections pinned to validated public addresses.
        ...(this.config.baseUrl && !allowsPrivate(this.ctx.network) ? { fetch: createGuardedSdkFetch({ network: this.ctx.network }) } : {}),
        maxRetries: this.config.maxRetries,
        timeout: this.config.timeoutMs,
      });
      return c as unknown as AnthropicClientLike;
    });
    return this.clientPromise;
  }

  private mapOptions(): AnthropicMapOptions {
    return {
      defaultModel: this.config.defaultModel,
      defaultEffort: this.config.defaultEffort,
      defaultMaxTokens: this.config.defaultMaxTokens,
      serverSideFallbacks: this.config.serverSideFallbacks,
    };
  }

  /** Streaming is always used (SDKs require it for large max_tokens); `finalMessage()` collects the result. */
  private async run(params: AnthropicRequestParams, signal: AbortSignal | undefined, onText?: (delta: string) => void): Promise<BetaMessage> {
    const client = await this.client();
    try {
      const stream = client.beta.messages.stream(params, signal ? { signal } : undefined);
      if (onText) {
        for await (const ev of stream) {
          const e = ev as { type?: string; delta?: { type?: string; text?: string } };
          if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) onText(e.delta.text);
        }
      }
      return await stream.finalMessage();
    } catch (err) {
      throw toAnthropicError(err, this.sdk);
    }
  }

  async chat(req: AiChatRequest): Promise<AiChatResponse> {
    const msg = await this.run(toAnthropicParams(req, this.mapOptions()), req.signal);
    return fromAnthropicMessage(msg);
  }

  async *stream(req: AiChatRequest): AsyncIterable<AiStreamEvent> {
    const queue: string[] = [];
    let wake: (() => void) | undefined;
    let finished = false;
    let failure: unknown;
    let final: BetaMessage | undefined;
    const pending = this.run(toAnthropicParams(req, this.mapOptions()), req.signal, (d) => {
      queue.push(d);
      wake?.();
    })
      .then((m) => {
        final = m;
      })
      .catch((e: unknown) => {
        failure = e;
      })
      .finally(() => {
        finished = true;
        wake?.();
      });
    while (!finished || queue.length) {
      if (queue.length) {
        yield { type: 'text', delta: queue.shift()! };
        continue;
      }
      await new Promise<void>((r) => {
        wake = r;
      });
      wake = undefined;
    }
    await pending;
    if (failure) throw failure;
    const response = fromAnthropicMessage(final!);
    for (const p of response.content) if (p.type === 'tool_call') yield { type: 'tool_call', id: p.id, name: p.name, input: p.input };
    yield { type: 'done', response };
  }

  async generateText(req: { model?: string; system?: string; prompt: string; maxTokens?: number; effort?: AiEffort; signal?: AbortSignal }) {
    const res = await this.chat({
      model: req.model,
      system: req.system,
      messages: [{ role: 'user', content: [{ type: 'text', text: req.prompt }] }],
      maxTokens: req.maxTokens,
      effort: req.effort,
      signal: req.signal,
    });
    return { text: textOf(res.content), usage: res.usage, model: res.model };
  }

  /**
   * Structured outputs via `output_config.format` (JSON schema). Parses + validates with
   * `req.parse`; on failure performs ONE repair turn (append-only) feeding the validation error back.
   */
  async generateStructuredData<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: AiUsage; model: string }> {
    const opts = this.mapOptions();
    const outputSchema = toAnthropicOutputSchema(req.schema);
    const system = outputSchema
      ? req.system
      : appendSystem(req.system, `Respond with a single JSON value named "${req.schemaName}" that conforms to this JSON Schema. Output only JSON, no prose:\n${JSON.stringify(req.schema)}`);
    const history: AiChatRequest['messages'] = [{ role: 'user', content: [{ type: 'text', text: req.prompt }] }];
    let usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const params = toAnthropicParams({ model: req.model, system, messages: history, maxTokens: req.maxTokens, effort: req.effort, signal: req.signal }, opts);
      if (outputSchema) params.output_config = { ...(params.output_config ?? {}), format: { type: 'json_schema', schema: outputSchema } };
      const msg = await this.run(params, req.signal);
      const res = fromAnthropicMessage(msg);
      usage = addUsage(usage, res.usage);
      const text = textOf(res.content);
      try {
        if (res.stopReason === 'max_tokens') throw new Error('output was truncated at max_tokens; produce a more compact result');
        const data = req.parse(extractJson(text));
        return { data, usage, model: res.model };
      } catch (err) {
        lastError = err;
        // Append-only repair: echo the full assistant turn (incl. thinking blocks) then the error.
        history.push({ role: 'assistant', content: res.content });
        history.push({
          role: 'user',
          content: [{ type: 'text', text: `The JSON you returned failed validation:\n${describeValidationError(err)}\n\nReturn the complete corrected JSON only.` }],
        });
      }
    }
    throw new ProviderError(`anthropic: structured output failed validation after repair: ${describeValidationError(lastError)}`, PROVIDER, false, lastError);
  }

  estimateCost(model: string, usage: AiUsage): number {
    return estimateCostFromCatalog(this.models, model, usage);
  }

  async test(): Promise<TestResult> {
    try {
      const client = await this.client();
      const model = await client.models.retrieve(this.config.defaultModel).catch((e: unknown) => {
        throw toAnthropicError(e, this.sdk);
      });
      return { ok: true, message: `Connected to Anthropic (${model.display_name ?? model.id})`, details: { model: model.id } };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Exposed for diagnostics/UI: the model id a request would use. */
  resolveModel(model?: string): ModelInfo {
    return findModel(this.models, model ?? this.config.defaultModel) ?? defaultModel(this.models);
  }
}

export const anthropicDriver = defineDriver({
  kind: 'ai',
  id: 'anthropic',
  name: 'Anthropic Claude',
  description: 'Claude models via the Anthropic Messages API (tool calling, structured outputs, prompt caching, server-side refusal fallbacks).',
  configSchema: anthropicConfigSchema,
  secretsSchema: anthropicSecretsSchema,
  presets: [
    { id: 'opus', name: 'Claude Opus 5.5 (best quality)', config: { defaultModel: 'claude-opus-5-5' } },
    { id: 'sonnet', name: 'Claude Sonnet 5.5 (balanced)', config: { defaultModel: 'claude-sonnet-5-5' } },
    { id: 'haiku', name: 'Claude Haiku 4.5 (fast, low cost)', config: { defaultModel: 'claude-haiku-4-5' } },
  ],
  create: (config, secrets, ctx): AIProvider => new AnthropicProvider(config, secrets, undefined, ctx),
});
