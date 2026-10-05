import { z } from 'zod';
import type OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions';
import type { CompletionUsage } from 'openai/resources/completions';
import type {
  FunctionTool,
  Response as OpenAIResponse,
  ResponseCreateParamsNonStreaming,
  ResponseInputContent,
  ResponseInputItem,
  ResponseUsage,
} from 'openai/resources/responses/responses';
import type { ImagesResponse } from 'openai/resources/images';
import { defineDriver, ProviderError, TENANT_CONTEXT, type DriverContext, type TestResult } from '../driver';
import { createGuardedSdkFetch } from '../net/guard';
import { allowsPrivate } from '../net/policy';
import {
  addUsage,
  defaultModel,
  describeValidationError,
  emptyUsage,
  estimateCostFromCatalog,
  extractJson,
  isStrictCompatible,
  ProviderRefusalError,
  redactSecrets,
  structuredWithRepair,
  textOf,
} from './common';
import type {
  AIProvider,
  AiChatRequest,
  AiChatResponse,
  AiContentPart,
  AiEffort,
  AiMessage,
  AiStreamEvent,
  AiUsage,
  ModelInfo,
  StructuredRequest,
} from './types';

const PROVIDER = 'openai';

/**
 * Catalog ordered most-specific first: `findModel` falls back to prefix matching, so e.g.
 * `gpt-5.4-mini-2026-03-17` must hit `gpt-5.4-mini` before `gpt-5.4` / `gpt-5`.
 * Prices: USD per 1M tokens (standard tier). OpenAI prompt caching is automatic; cache
 * writes are not billed separately.
 */
export const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-5.5', label: 'GPT-5.5', inputPrice: 5, outputPrice: 30, cacheReadPrice: 0.5, contextWindow: 1_050_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true, default: true },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', inputPrice: 0.75, outputPrice: 4.5, cacheReadPrice: 0.075, contextWindow: 400_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'gpt-5.4', label: 'GPT-5.4', inputPrice: 2.5, outputPrice: 15, cacheReadPrice: 0.25, contextWindow: 1_050_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'gpt-5.2', label: 'GPT-5.2', inputPrice: 1.75, outputPrice: 14, cacheReadPrice: 0.175, contextWindow: 400_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'gpt-5.1', label: 'GPT-5.1', inputPrice: 1.25, outputPrice: 10, cacheReadPrice: 0.125, contextWindow: 400_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', inputPrice: 0.25, outputPrice: 2, cacheReadPrice: 0.025, contextWindow: 400_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'gpt-5-nano', label: 'GPT-5 nano', inputPrice: 0.05, outputPrice: 0.4, cacheReadPrice: 0.005, contextWindow: 400_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'gpt-5', label: 'GPT-5', inputPrice: 1.25, outputPrice: 10, cacheReadPrice: 0.125, contextWindow: 400_000, maxOutputTokens: 128_000, supportsImages: true, supportsTools: true },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', inputPrice: 0.4, outputPrice: 1.6, cacheReadPrice: 0.1, contextWindow: 1_047_576, maxOutputTokens: 32_768, supportsImages: true, supportsTools: true },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano', inputPrice: 0.1, outputPrice: 0.4, cacheReadPrice: 0.025, contextWindow: 1_047_576, maxOutputTokens: 32_768, supportsImages: true, supportsTools: true },
  { id: 'gpt-4.1', label: 'GPT-4.1', inputPrice: 2, outputPrice: 8, cacheReadPrice: 0.5, contextWindow: 1_047_576, maxOutputTokens: 32_768, supportsImages: true, supportsTools: true },
  { id: 'o4-mini', label: 'o4-mini', inputPrice: 1.1, outputPrice: 4.4, cacheReadPrice: 0.275, contextWindow: 200_000, maxOutputTokens: 100_000, supportsImages: true, supportsTools: true },
];

const DEFAULT_MODEL = defaultModel(OPENAI_MODELS).id;

/** Subset of the SDK client the adapter uses (injectable for tests). */
export type OpenAIClient = Pick<OpenAI, 'chat' | 'responses' | 'images'>;

export interface OpenAIMappingOptions {
  model: string;
}

/** o-series and gpt-5 family (excluding `*-chat-*` aliases) accept `reasoning_effort` and reject custom temperature. */
export function isOpenAIReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/.test(model) && !/-chat/.test(model);
}

/** Neutral effort → OpenAI effort. `xhigh` / `max` collapse to `high` (the widest-supported ceiling). */
export function toOpenAIEffort(effort: AiEffort): 'low' | 'medium' | 'high' {
  return effort === 'low' || effort === 'medium' ? effort : 'high';
}

/** Tool-call arguments are model-generated JSON; never throw on malformed output. */
export function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  return { _raw: raw };
}

/** OpenAI requires `[a-zA-Z0-9_-]{1,64}` for json_schema names. */
export function sanitizeSchemaName(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return s || 'output';
}

function toolResultContent(p: Extract<AiContentPart, { type: 'tool_result' }>): string {
  return p.isError && !/^error\b/i.test(p.content) ? `Error: ${p.content}` : p.content;
}

function isOwnRaw(p: AiContentPart): p is Extract<AiContentPart, { type: 'provider_raw' }> {
  return p.type === 'provider_raw' && p.provider === PROVIDER;
}

// ---------------------------------------------------------------------------
// Chat Completions mapping
// ---------------------------------------------------------------------------

/**
 * Neutral request → Chat Completions params.
 * - `tool_result` parts become `role: 'tool'` messages, emitted (in order) BEFORE any other
 *   content of the same user turn, because OpenAI requires tool messages to directly follow
 *   the assistant message carrying the `tool_calls`.
 * - `provider_raw` parts from other providers are skipped; OpenAI raw parts that look like
 *   chat messages (have a `role`) are passed through, Responses-only items (reasoning) are skipped.
 * - Prompt caching is automatic on OpenAI, so `req.cache` needs no mapping.
 */
export function toOpenAIChatParams(req: AiChatRequest, opts: OpenAIMappingOptions): ChatCompletionCreateParamsNonStreaming {
  const reasoning = isOpenAIReasoningModel(opts.model);
  const messages: ChatCompletionMessageParam[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });

  for (const msg of req.messages) {
    if (msg.role === 'user') {
      const parts: ChatCompletionContentPart[] = [];
      for (const p of msg.content) {
        if (p.type === 'tool_result') messages.push({ role: 'tool', tool_call_id: p.toolCallId, content: toolResultContent(p) });
        else if (p.type === 'text') parts.push({ type: 'text', text: p.text });
        else if (p.type === 'image') parts.push({ type: 'image_url', image_url: { url: p.url } });
        else if (isOwnRaw(p) && isChatMessage(p.data)) messages.push(p.data);
      }
      if (parts.length === 1 && parts[0]?.type === 'text') messages.push({ role: 'user', content: parts[0].text });
      else if (parts.length) messages.push({ role: 'user', content: parts });
    } else {
      let text = '';
      const toolCalls: ChatCompletionMessageFunctionToolCall[] = [];
      for (const p of msg.content) {
        if (p.type === 'text') text += p.text;
        else if (p.type === 'tool_call') toolCalls.push({ id: p.id, type: 'function', function: { name: p.name, arguments: JSON.stringify(p.input ?? {}) } });
        else if (isOwnRaw(p) && isChatMessage(p.data)) messages.push(p.data);
      }
      if (text || toolCalls.length) {
        messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      }
    }
  }

  const params: ChatCompletionCreateParamsNonStreaming = { model: opts.model, messages };
  if (req.tools?.length) {
    params.tools = req.tools.map(
      (t): ChatCompletionTool => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema, strict: isStrictCompatible(t.inputSchema) },
      }),
    );
    if (req.toolChoice) params.tool_choice = toOpenAIToolChoice(req.toolChoice);
  }
  if (req.maxTokens !== undefined) params.max_completion_tokens = req.maxTokens;
  if (req.temperature !== undefined && !reasoning) params.temperature = req.temperature;
  if (req.effort && reasoning) params.reasoning_effort = toOpenAIEffort(req.effort);
  if (req.metadata?.userId) params.safety_identifier = req.metadata.userId;
  return params;
}

function isChatMessage(data: unknown): data is ChatCompletionMessageParam {
  return !!data && typeof data === 'object' && typeof (data as { role?: unknown }).role === 'string';
}

export function toOpenAIToolChoice(choice: NonNullable<AiChatRequest['toolChoice']>): ChatCompletionToolChoiceOption {
  if (choice === 'auto' || choice === 'none') return choice;
  if (choice === 'any') return 'required';
  return { type: 'function', function: { name: choice.name } };
}

/** `inputTokens` excludes cached prompt tokens (reported separately as `cacheReadTokens`). */
export function fromOpenAIUsage(u: CompletionUsage | null | undefined): AiUsage {
  if (!u) return emptyUsage();
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, u.prompt_tokens - cached),
    outputTokens: u.completion_tokens,
    ...(cached ? { cacheReadTokens: cached } : {}),
  };
}

function mapFinishReason(reason: string | null | undefined, hasToolCalls: boolean): AiChatResponse['stopReason'] {
  if (reason === 'content_filter') {
    throw new ProviderRefusalError('OpenAI content filter blocked the response', PROVIDER, 'content_filter');
  }
  if (hasToolCalls || reason === 'tool_calls' || reason === 'function_call') return 'tool_use';
  if (reason === 'stop') return 'end';
  if (reason === 'length') return 'max_tokens';
  return 'other';
}

export function fromOpenAIChatCompletion(res: Pick<ChatCompletion, 'choices' | 'usage' | 'model'>): AiChatResponse {
  const choice = res.choices[0];
  if (!choice) throw new ProviderError('OpenAI returned no choices', PROVIDER, true);
  const msg = choice.message;
  if (msg.refusal) throw new ProviderRefusalError('OpenAI model refused the request', PROVIDER, null, msg.refusal);
  const content: AiContentPart[] = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const tc of msg.tool_calls ?? []) {
    if (tc.type !== 'function') continue;
    content.push({ type: 'tool_call', id: tc.id, name: tc.function.name, input: parseToolArguments(tc.function.arguments) });
  }
  const hasToolCalls = content.some((p) => p.type === 'tool_call');
  return {
    content,
    stopReason: mapFinishReason(choice.finish_reason, hasToolCalls),
    rawStopReason: choice.finish_reason,
    usage: fromOpenAIUsage(res.usage),
    model: res.model,
    provider: PROVIDER,
  };
}

/** Accumulates streamed chat chunks (text + tool-call deltas by index) into a final response. */
export class OpenAIChatStreamAccumulator {
  private text = '';
  private refusal = '';
  private finishReason: string | null = null;
  private usage: CompletionUsage | null = null;
  private model = '';
  private readonly toolCalls = new Map<number, { id: string; name: string; args: string }>();

  constructor(model: string) {
    this.model = model;
  }

  /** Returns the text delta in this chunk (if any). */
  push(chunk: ChatCompletionChunk): string | undefined {
    if (chunk.model) this.model = chunk.model;
    if (chunk.usage) this.usage = chunk.usage;
    const choice = chunk.choices[0];
    if (!choice) return undefined;
    if (choice.finish_reason) this.finishReason = choice.finish_reason;
    const d = choice.delta;
    if (d.refusal) this.refusal += d.refusal;
    for (const tc of d.tool_calls ?? []) {
      const cur = this.toolCalls.get(tc.index) ?? { id: '', name: '', args: '' };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      this.toolCalls.set(tc.index, cur);
    }
    if (d.content) {
      this.text += d.content;
      return d.content;
    }
    return undefined;
  }

  finish(): AiChatResponse {
    const calls = [...this.toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, c], i) => ({ id: c.id || `call_${i}`, type: 'function' as const, function: { name: c.name, arguments: c.args } }));
    return fromOpenAIChatCompletion({
      model: this.model,
      usage: this.usage ?? undefined,
      choices: [
        {
          index: 0,
          logprobs: null,
          finish_reason: (this.finishReason ?? 'stop') as ChatCompletion.Choice['finish_reason'],
          message: { role: 'assistant', content: this.text || null, refusal: this.refusal || null, ...(calls.length ? { tool_calls: calls } : {}) },
        },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Responses API mapping
// ---------------------------------------------------------------------------

/**
 * Neutral request → Responses API params (stateless: `store: false`; reasoning models also
 * request `reasoning.encrypted_content` so the returned `reasoning` items can be echoed back).
 * Assistant `provider_raw` parts with provider `openai` (reasoning items etc.) are passed back
 * unchanged, in their original position relative to the function calls that follow them.
 */
export function toOpenAIResponsesParams(req: AiChatRequest, opts: OpenAIMappingOptions): ResponseCreateParamsNonStreaming {
  const reasoning = isOpenAIReasoningModel(opts.model);
  const input: ResponseInputItem[] = [];
  for (const msg of req.messages) {
    if (msg.role === 'user') {
      const parts: ResponseInputContent[] = [];
      for (const p of msg.content) {
        if (p.type === 'tool_result') input.push({ type: 'function_call_output', call_id: p.toolCallId, output: toolResultContent(p) });
        else if (p.type === 'text') parts.push({ type: 'input_text', text: p.text });
        else if (p.type === 'image') parts.push({ type: 'input_image', image_url: p.url, detail: 'auto' });
        else if (isOwnRaw(p)) input.push(p.data as ResponseInputItem);
      }
      if (parts.length) input.push({ role: 'user', content: parts });
    } else {
      for (const p of msg.content) {
        if (p.type === 'text') {
          if (p.text) input.push({ role: 'assistant', content: p.text });
        } else if (p.type === 'tool_call') {
          input.push({ type: 'function_call', call_id: p.id, name: p.name, arguments: JSON.stringify(p.input ?? {}) });
        } else if (isOwnRaw(p)) {
          input.push(p.data as ResponseInputItem);
        }
      }
    }
  }

  const params: ResponseCreateParamsNonStreaming = { model: opts.model, input, store: false };
  if (req.system) params.instructions = req.system;
  if (req.tools?.length) {
    params.tools = req.tools.map(
      (t): FunctionTool => ({ type: 'function', name: t.name, description: t.description, parameters: t.inputSchema, strict: isStrictCompatible(t.inputSchema) }),
    );
    if (req.toolChoice) {
      const c = req.toolChoice;
      params.tool_choice = c === 'auto' || c === 'none' ? c : c === 'any' ? 'required' : { type: 'function', name: c.name };
    }
  }
  if (req.maxTokens !== undefined) params.max_output_tokens = req.maxTokens;
  if (req.temperature !== undefined && !reasoning) params.temperature = req.temperature;
  if (reasoning) {
    params.include = ['reasoning.encrypted_content'];
    if (req.effort) params.reasoning = { effort: toOpenAIEffort(req.effort) };
  }
  if (req.metadata?.userId) params.safety_identifier = req.metadata.userId;
  return params;
}

export function fromOpenAIResponsesUsage(u: ResponseUsage | null | undefined): AiUsage {
  if (!u) return emptyUsage();
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, u.input_tokens - cached),
    outputTokens: u.output_tokens,
    ...(cached ? { cacheReadTokens: cached } : {}),
  };
}

/**
 * Responses API output → neutral response. `reasoning` items (and any non-message, non-function
 * item) are preserved as `provider_raw` so they can be echoed back unchanged next turn.
 */
export function fromOpenAIResponse(res: Pick<OpenAIResponse, 'output' | 'usage' | 'model' | 'status' | 'incomplete_details'>): AiChatResponse {
  const content: AiContentPart[] = [];
  for (const item of res.output) {
    if (item.type === 'message') {
      for (const c of item.content) {
        if (c.type === 'refusal') throw new ProviderRefusalError('OpenAI model refused the request', PROVIDER, null, c.refusal);
        if (c.text) content.push({ type: 'text', text: c.text });
      }
    } else if (item.type === 'function_call') {
      content.push({ type: 'tool_call', id: item.call_id, name: item.name, input: parseToolArguments(item.arguments) });
    } else {
      content.push({ type: 'provider_raw', provider: PROVIDER, data: item });
    }
  }
  const reason = res.incomplete_details?.reason;
  if (reason === 'content_filter') throw new ProviderRefusalError('OpenAI content filter blocked the response', PROVIDER, 'content_filter');
  const hasToolCalls = content.some((p) => p.type === 'tool_call');
  let stopReason: AiChatResponse['stopReason'];
  if (res.status === 'incomplete' && reason === 'max_output_tokens') stopReason = 'max_tokens';
  else if (hasToolCalls) stopReason = 'tool_use';
  else if (res.status === 'completed' || res.status === undefined) stopReason = 'end';
  else stopReason = 'other';
  return {
    content,
    stopReason,
    rawStopReason: reason ?? res.status,
    usage: fromOpenAIResponsesUsage(res.usage),
    model: String(res.model),
    provider: PROVIDER,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);


/**
 * Map an OpenAI SDK error (`APIError` subclasses carry `.status`; `APIConnectionError` /
 * `APIConnectionTimeoutError` have none) to a `ProviderError`. Matched structurally so it
 * works without loading the SDK. `ProviderError`s are returned as-is.
 */
export function toOpenAIError(err: unknown, apiKey?: string): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { status?: unknown; message?: unknown; name?: unknown; constructor?: { name?: string } } | null;
  const ctor = e?.constructor?.name ?? '';
  const name = typeof e?.name === 'string' ? e.name : '';
  const raw = typeof e?.message === 'string' ? e.message : String(err);
  const message = redactSecrets(raw, apiKey);
  if (ctor === 'APIUserAbortError' || name === 'AbortError') return new ProviderError(`OpenAI request aborted`, PROVIDER, false, err);
  const status = typeof e?.status === 'number' ? e.status : undefined;
  if (status !== undefined) {
    const retryable = RETRYABLE_STATUS.has(status) || status >= 500;
    return new ProviderError(`OpenAI API error ${status}: ${message}`, PROVIDER, retryable, err);
  }
  if (/Connection|Timeout/.test(ctor) || /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|timed? ?out/i.test(raw)) {
    return new ProviderError(`OpenAI connection error: ${message}`, PROVIDER, true, err);
  }
  return new ProviderError(`OpenAI error: ${message}`, PROVIDER, false, err);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface OpenAIProviderOptions {
  apiKey: string;
  defaultModel?: string;
  /** Azure OpenAI / OpenAI-compatible gateway base URL. */
  baseUrl?: string;
  organization?: string;
  project?: string;
  api?: 'chat' | 'responses';
  imageModel?: string;
  /** Where the configuration came from (tenant base URLs are guarded). */
  ctx?: DriverContext;
}

interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
  strict: boolean;
}

export class OpenAIProvider implements AIProvider {
  readonly driver = PROVIDER;
  readonly models = OPENAI_MODELS;
  private clientPromise?: Promise<OpenAIClient>;

  constructor(
    private readonly opts: OpenAIProviderOptions,
    client?: OpenAIClient,
  ) {
    if (client) this.clientPromise = Promise.resolve(client);
  }

  private get api(): 'chat' | 'responses' {
    return this.opts.api ?? 'chat';
  }

  private client(): Promise<OpenAIClient> {
    this.clientPromise ??= (async () => {
      const { default: OpenAISDK } = await import('openai');
      return new OpenAISDK({
        apiKey: this.opts.apiKey,
        ...(this.opts.baseUrl ? { baseURL: this.opts.baseUrl } : {}),
        // Tenant base URLs (gateways / Azure OpenAI): connections pinned to validated public addresses.
        ...(this.opts.baseUrl && !allowsPrivate((this.opts.ctx ?? TENANT_CONTEXT).network) ? { fetch: createGuardedSdkFetch({ network: (this.opts.ctx ?? TENANT_CONTEXT).network }) } : {}),
        ...(this.opts.organization ? { organization: this.opts.organization } : {}),
        ...(this.opts.project ? { project: this.opts.project } : {}),
      });
    })().catch((err: unknown) => {
      this.clientPromise = undefined;
      throw toOpenAIError(err, this.opts.apiKey);
    });
    return this.clientPromise;
  }

  private model(m?: string): string {
    return m || this.opts.defaultModel || DEFAULT_MODEL;
  }

  private async complete(req: AiChatRequest, format?: JsonSchemaFormat): Promise<AiChatResponse> {
    const model = this.model(req.model);
    const client = await this.client();
    try {
      if (this.api === 'responses') {
        const params = toOpenAIResponsesParams(req, { model });
        if (format) params.text = { format: { type: 'json_schema', ...format } };
        const res = await client.responses.create(params, { signal: req.signal });
        return fromOpenAIResponse(res);
      }
      const params = toOpenAIChatParams(req, { model });
      if (format) params.response_format = { type: 'json_schema', json_schema: format };
      const res = await client.chat.completions.create(params, { signal: req.signal });
      return fromOpenAIChatCompletion(res);
    } catch (err) {
      throw toOpenAIError(err, this.opts.apiKey);
    }
  }

  chat(req: AiChatRequest): Promise<AiChatResponse> {
    return this.complete(req);
  }

  async *stream(req: AiChatRequest): AsyncIterable<AiStreamEvent> {
    const model = this.model(req.model);
    const client = await this.client();
    let response: AiChatResponse;
    try {
      if (this.api === 'responses') {
        const params = toOpenAIResponsesParams(req, { model });
        const events = await client.responses.create({ ...params, stream: true }, { signal: req.signal });
        let final: OpenAIResponse | undefined;
        for await (const ev of events) {
          if (ev.type === 'response.output_text.delta') yield { type: 'text', delta: ev.delta };
          else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') final = ev.response;
          else if (ev.type === 'response.failed') throw new ProviderError(`OpenAI response failed: ${ev.response.error?.message ?? 'unknown error'}`, PROVIDER, true);
          else if (ev.type === 'error') throw new ProviderError(`OpenAI stream error: ${ev.message}`, PROVIDER, true);
        }
        if (!final) throw new ProviderError('OpenAI stream ended without a final response', PROVIDER, true);
        response = fromOpenAIResponse(final);
      } else {
        const params = toOpenAIChatParams(req, { model });
        const chunks = await client.chat.completions.create(
          { ...params, stream: true, stream_options: { include_usage: true } },
          { signal: req.signal },
        );
        const acc = new OpenAIChatStreamAccumulator(model);
        for await (const chunk of chunks) {
          const delta = acc.push(chunk);
          if (delta) yield { type: 'text', delta };
        }
        response = acc.finish();
      }
    } catch (err) {
      throw toOpenAIError(err, this.opts.apiKey);
    }
    for (const p of response.content) {
      if (p.type === 'tool_call') yield { type: 'tool_call', id: p.id, name: p.name, input: p.input };
    }
    yield { type: 'done', response };
  }

  async generateText(req: Parameters<AIProvider['generateText']>[0]): Promise<{ text: string; usage: AiUsage; model: string }> {
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

  async generateStructuredData<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: AiUsage; model: string }> {
    const format: JsonSchemaFormat = { name: sanitizeSchemaName(req.schemaName), schema: req.schema, strict: isStrictCompatible(req.schema) };
    const messages: AiMessage[] = [{ role: 'user', content: [{ type: 'text', text: req.prompt }] }];
    const base = { model: req.model, system: req.system, maxTokens: req.maxTokens, effort: req.effort, signal: req.signal };
    return structuredWithRepair(req, messages, (msgs) => this.complete({ ...base, messages: msgs }, format), PROVIDER);
  }

  async generateImage(req: { prompt: string; size?: string; model?: string }): Promise<{ data: Buffer; mimeType: string; usage?: AiUsage }> {
    const client = await this.client();
    const model = req.model || this.opts.imageModel || 'gpt-image-1';
    let res: ImagesResponse;
    try {
      res = await client.images.generate({
        model,
        prompt: req.prompt,
        n: 1,
        ...(req.size ? { size: req.size } : {}),
        // gpt-image-* always return base64 and reject `response_format`; DALL·E defaults to URLs.
        ...(model.startsWith('dall-e') ? { response_format: 'b64_json' as const } : {}),
      });
    } catch (err) {
      throw toOpenAIError(err, this.opts.apiKey);
    }
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError('OpenAI image generation returned no image data', PROVIDER, false);
    const fmt = res.output_format ?? 'png';
    return {
      data: Buffer.from(b64, 'base64'),
      mimeType: `image/${fmt}`,
      ...(res.usage ? { usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } } : {}),
    };
  }

  estimateCost(model: string, usage: AiUsage): number {
    return estimateCostFromCatalog(OPENAI_MODELS, model, usage);
  }

  async test(): Promise<TestResult> {
    const model = this.model();
    try {
      // Reasoning models spend tokens thinking before answering — leave headroom.
      const res = await this.generateText({ model, prompt: 'Reply with OK', maxTokens: isOpenAIReasoningModel(model) ? 256 : 16, effort: 'low' });
      return { ok: true, message: `Connected to OpenAI (${res.model})`, details: { model: res.model, reply: res.text.slice(0, 40) } };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}


// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export const openaiConfigSchema = z.object({
  defaultModel: z.string().min(1).default(DEFAULT_MODEL),
  baseUrl: z.string().url().optional(),
  organization: z.string().optional(),
  project: z.string().optional(),
  api: z.enum(['chat', 'responses']).default('chat'),
  imageModel: z.string().min(1).default('gpt-image-1'),
});

export const openaiSecretsSchema = z.object({
  apiKey: z.string().min(1),
});

export const openaiDriver = defineDriver({
  kind: 'ai',
  id: 'openai',
  name: 'OpenAI',
  description: 'OpenAI GPT models via Chat Completions or the Responses API (also Azure OpenAI / OpenAI-compatible gateways via base URL).',
  configSchema: openaiConfigSchema,
  secretsSchema: openaiSecretsSchema,
  presets: [
    { id: 'openai', name: 'OpenAI (Chat Completions)', config: { api: 'chat' } },
    { id: 'openai-responses', name: 'OpenAI (Responses API)', config: { api: 'responses' } },
  ],
  create(config, secrets, ctx): AIProvider {
    return new OpenAIProvider({ ...config, apiKey: secrets.apiKey, ctx });
  },
});
