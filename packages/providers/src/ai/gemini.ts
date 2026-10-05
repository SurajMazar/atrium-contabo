import { z } from 'zod';
import type {
  Content,
  FunctionCallingConfigMode,
  GenerateContentConfig,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
  ThinkingConfig,
  ThinkingLevel,
} from '@google/genai';
import { defineDriver, ProviderError, type TestResult } from '../driver';
import { defaultModel, emptyUsage, estimateCostFromCatalog, parseDataUrl, ProviderRefusalError, redactSecrets, structuredWithRepair, textOf } from './common';
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

const PROVIDER = 'gemini';

/**
 * Catalog ordered most-specific first (prefix fallback in `findModel`). USD per 1M tokens,
 * paid tier, ≤200k-token prompts. Implicit context caching is billed at the cache-read rate.
 */
export const GEMINI_MODELS: ModelInfo[] = [
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (preview)', inputPrice: 2, outputPrice: 12, cacheReadPrice: 0.2, contextWindow: 1_048_576, maxOutputTokens: 65_536, supportsImages: true, supportsTools: true },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', inputPrice: 0.5, outputPrice: 3, cacheReadPrice: 0.05, contextWindow: 1_048_576, maxOutputTokens: 65_536, supportsImages: true, supportsTools: true },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', inputPrice: 1.25, outputPrice: 10, cacheReadPrice: 0.125, contextWindow: 1_048_576, maxOutputTokens: 65_536, supportsImages: true, supportsTools: true, default: true },
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', inputPrice: 0.3, outputPrice: 30, contextWindow: 32_768, maxOutputTokens: 32_768, supportsImages: true, supportsTools: false },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', inputPrice: 0.1, outputPrice: 0.4, cacheReadPrice: 0.01, contextWindow: 1_048_576, maxOutputTokens: 65_536, supportsImages: true, supportsTools: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', inputPrice: 0.3, outputPrice: 2.5, cacheReadPrice: 0.03, contextWindow: 1_048_576, maxOutputTokens: 65_536, supportsImages: true, supportsTools: true },
];

const DEFAULT_MODEL = defaultModel(GEMINI_MODELS).id;
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

/** Subset of the SDK client the adapter uses (injectable for tests). */
export interface GeminiClient {
  models: Pick<GoogleGenAI['models'], 'generateContent' | 'generateContentStream'>;
}

/** The structural slice of `GenerateContentResponse` the mapper reads (the SDK type is a class). */
export type GeminiResponseLike = Pick<GenerateContentResponse, 'candidates' | 'usageMetadata' | 'promptFeedback' | 'modelVersion'>;

/** Ids we synthesize when the API omits `functionCall.id`; they are never sent back. */
const SYNTHETIC_ID = /^call_\d+$/;

const REFUSAL_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'RECITATION', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT']);

// ---------------------------------------------------------------------------
// Request mapping
// ---------------------------------------------------------------------------

function guessMimeType(url: string, hint?: string): string {
  if (hint) return hint;
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  const map: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' };
  return (ext && map[ext]) || 'image/jpeg';
}

function isGeminiRaw(p: AiContentPart): p is Extract<AiContentPart, { type: 'provider_raw' }> {
  return p.type === 'provider_raw' && p.provider === PROVIDER;
}

/** Neutral effort → Gemini thinking config (Gemini 3: `thinkingLevel`; Gemini 2.5: `thinkingBudget`). */
export function toGeminiThinkingConfig(model: string, effort: AiEffort | undefined): ThinkingConfig | undefined {
  if (!effort || model.includes('-image')) return undefined;
  if (model.startsWith('gemini-3')) {
    return { thinkingLevel: (effort === 'low' ? 'LOW' : 'HIGH') as ThinkingLevel };
  }
  if (model.startsWith('gemini-2.5')) {
    const budget = { low: 1024, medium: 8192, high: 16384, xhigh: 24576, max: 24576 }[effort];
    return { thinkingBudget: budget };
  }
  return undefined;
}

/**
 * Neutral request → `generateContent` params.
 *
 * Thought-signature rule: an assistant message that contains ANY `provider_raw` part with
 * provider `gemini` is sent as exactly those raw parts (in order) and its neutral text /
 * tool_call parts are skipped — `fromGeminiResponse` emits a raw copy of every part of such
 * a turn, so the raw parts reproduce the model turn byte-for-byte (signatures included).
 * Messages without Gemini raw parts are mapped from their neutral parts.
 *
 * `functionResponse.name` is resolved from the most recent earlier `tool_call` with the same id.
 */
export function toGeminiRequest(req: AiChatRequest, opts: { model: string }): GenerateContentParameters {
  const toolNames = new Map<string, string>();
  const contents: Content[] = [];

  for (const msg of req.messages) {
    const parts: Part[] = [];
    if (msg.role === 'assistant') {
      for (const p of msg.content) if (p.type === 'tool_call') toolNames.set(p.id, p.name);
      const raw = msg.content.filter(isGeminiRaw);
      if (raw.length) {
        for (const p of raw) parts.push(p.data as Part);
      } else {
        for (const p of msg.content) {
          if (p.type === 'text') {
            if (p.text) parts.push({ text: p.text });
          } else if (p.type === 'tool_call') {
            parts.push({ functionCall: { ...(SYNTHETIC_ID.test(p.id) ? {} : { id: p.id }), name: p.name, args: p.input ?? {} } });
          }
        }
      }
    } else {
      for (const p of msg.content) {
        if (p.type === 'text') parts.push({ text: p.text });
        else if (p.type === 'image') {
          const data = parseDataUrl(p.url);
          if (data) parts.push({ inlineData: { mimeType: p.mediaType ?? data.mediaType, data: data.data } });
          else parts.push({ fileData: { fileUri: p.url, mimeType: guessMimeType(p.url, p.mediaType) } });
        } else if (p.type === 'tool_result') {
          parts.push({
            functionResponse: {
              ...(SYNTHETIC_ID.test(p.toolCallId) ? {} : { id: p.toolCallId }),
              name: toolNames.get(p.toolCallId) ?? 'unknown_tool',
              response: p.isError ? { error: p.content } : { output: p.content },
            },
          });
        } else if (isGeminiRaw(p)) parts.push(p.data as Part);
      }
    }
    if (parts.length) contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
  }

  const config: GenerateContentConfig = {};
  if (req.system) config.systemInstruction = req.system;
  if (req.tools?.length) {
    config.tools = [
      { functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.inputSchema })) },
    ];
    if (req.toolChoice) {
      const c = req.toolChoice;
      const mode = (c === 'auto' ? 'AUTO' : c === 'none' ? 'NONE' : 'ANY') as FunctionCallingConfigMode;
      config.toolConfig = { functionCallingConfig: { mode, ...(typeof c === 'object' ? { allowedFunctionNames: [c.name] } : {}) } };
    }
  }
  if (req.maxTokens !== undefined) config.maxOutputTokens = req.maxTokens;
  if (req.temperature !== undefined) config.temperature = req.temperature;
  const thinking = toGeminiThinkingConfig(opts.model, req.effort);
  if (thinking) config.thinkingConfig = thinking;
  if (req.signal) config.abortSignal = req.signal;
  return { model: opts.model, contents, config };
}

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------

export function fromGeminiUsage(u: GenerateContentResponse['usageMetadata']): AiUsage {
  if (!u) return emptyUsage();
  const cached = u.cachedContentTokenCount ?? 0;
  return {
    inputTokens: Math.max(0, (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0) - cached),
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    ...(cached ? { cacheReadTokens: cached } : {}),
  };
}

/**
 * `generateContent` response → neutral response.
 * - Function calls without an id get `call_<n>` (unique within the response).
 * - If any part of the turn carries a `thoughtSignature` or is a `thought`, every part of the
 *   turn is ALSO emitted as `provider_raw {provider:'gemini', data: part}` (see the rule in
 *   `toGeminiRequest`); thought parts get no neutral representation.
 * - Safety-style finish reasons and prompt blocks throw `ProviderRefusalError`.
 */
export function fromGeminiResponse(res: GeminiResponseLike, model: string): AiChatResponse {
  const block = res.promptFeedback?.blockReason;
  if (block) {
    throw new ProviderRefusalError(`Gemini blocked the prompt (${block})`, PROVIDER, String(block).toLowerCase(), res.promptFeedback?.blockReasonMessage);
  }
  const cand = res.candidates?.[0];
  if (!cand) throw new ProviderError('Gemini returned no candidates', PROVIDER, true);
  const finish = cand.finishReason ? String(cand.finishReason) : undefined;
  if (finish && REFUSAL_FINISH.has(finish)) {
    throw new ProviderRefusalError(`Gemini stopped the response (${finish})`, PROVIDER, finish.toLowerCase(), cand.finishMessage);
  }

  const parts = cand.content?.parts ?? [];
  const keepRaw = parts.some((p) => p.thoughtSignature || p.thought);
  const content: AiContentPart[] = [];
  let n = 0;
  for (const p of parts) {
    if (!p.thought) {
      if (p.functionCall) {
        n += 1;
        content.push({ type: 'tool_call', id: p.functionCall.id || `call_${n}`, name: p.functionCall.name ?? '', input: p.functionCall.args ?? {} });
      } else if (typeof p.text === 'string' && p.text) {
        content.push({ type: 'text', text: p.text });
      } else if (p.inlineData?.data) {
        content.push({ type: 'image', url: `data:${p.inlineData.mimeType ?? 'image/png'};base64,${p.inlineData.data}`, mediaType: p.inlineData.mimeType });
      }
    }
    if (keepRaw) content.push({ type: 'provider_raw', provider: PROVIDER, data: p });
  }

  const hasToolCalls = content.some((p) => p.type === 'tool_call');
  const stopReason: AiChatResponse['stopReason'] = hasToolCalls
    ? 'tool_use'
    : finish === 'STOP' || finish === undefined
      ? 'end'
      : finish === 'MAX_TOKENS'
        ? 'max_tokens'
        : 'other';
  return {
    content,
    stopReason,
    rawStopReason: finish,
    usage: fromGeminiUsage(res.usageMetadata),
    model: res.modelVersion || model,
    provider: PROVIDER,
  };
}

/**
 * Merge streamed chunks into one response. Adjacent plain text parts (no thought, no
 * signature on either side) are concatenated; everything else is kept as its own part.
 */
export function mergeGeminiChunks(chunks: GeminiResponseLike[]): GeminiResponseLike {
  const parts: Part[] = [];
  let last: GeminiResponseLike | undefined;
  let finishReason: NonNullable<GenerateContentResponse['candidates']>[number]['finishReason'];
  let finishMessage: string | undefined;
  let usage: GenerateContentResponse['usageMetadata'];
  let promptFeedback: GenerateContentResponse['promptFeedback'];
  for (const c of chunks) {
    last = c;
    if (c.usageMetadata) usage = c.usageMetadata;
    if (c.promptFeedback) promptFeedback = c.promptFeedback;
    const cand = c.candidates?.[0];
    if (!cand) continue;
    if (cand.finishReason) finishReason = cand.finishReason;
    if (cand.finishMessage) finishMessage = cand.finishMessage;
    for (const p of cand.content?.parts ?? []) {
      const prev = parts[parts.length - 1];
      const plain = (x: Part) => typeof x.text === 'string' && !x.thought && !x.thoughtSignature && Object.keys(x).length === 1;
      if (prev && plain(prev) && plain(p)) prev.text = (prev.text ?? '') + (p.text ?? '');
      else parts.push({ ...p });
    }
  }
  return {
    candidates: [{ content: { role: 'model', parts }, ...(finishReason ? { finishReason } : {}), ...(finishMessage ? { finishMessage } : {}) }],
    usageMetadata: usage,
    promptFeedback,
    modelVersion: last?.modelVersion,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Map a `@google/genai` error (`ApiError` has `.status`) to `ProviderError`. ProviderErrors pass through. */
export function toGeminiError(err: unknown, apiKey?: string): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { status?: unknown; message?: unknown; name?: unknown } | null;
  const raw = typeof e?.message === 'string' ? e.message : String(err);
  const message = redactSecrets(raw, apiKey);
  if (e?.name === 'AbortError') return new ProviderError('Gemini request aborted', PROVIDER, false, err);
  const status = typeof e?.status === 'number' ? e.status : undefined;
  if (status !== undefined) {
    return new ProviderError(`Gemini API error ${status}: ${message}`, PROVIDER, RETRYABLE_STATUS.has(status) || status >= 500, err);
  }
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|timed? ?out|network/i.test(raw)) {
    return new ProviderError(`Gemini connection error: ${message}`, PROVIDER, true, err);
  }
  return new ProviderError(`Gemini error: ${message}`, PROVIDER, false, err);
}

const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

/** `1024x1536` / `1536x1024` / `16:9` → closest Gemini-supported aspect ratio. */
export function toGeminiAspectRatio(size: string | undefined): string | undefined {
  if (!size) return undefined;
  if (ASPECT_RATIOS.includes(size)) return size;
  const m = /^(\d+)\s*[x×:]\s*(\d+)$/i.exec(size.trim());
  if (!m) return undefined;
  const target = Number(m[1]) / Number(m[2]);
  if (!Number.isFinite(target) || target <= 0) return undefined;
  let best = '1:1';
  let bestDiff = Infinity;
  for (const r of ASPECT_RATIOS) {
    const [w, h] = r.split(':').map(Number) as [number, number];
    const diff = Math.abs(Math.log(w / h / target));
    if (diff < bestDiff) [best, bestDiff] = [r, diff];
  }
  return best;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface GeminiProviderOptions {
  apiKey: string;
  defaultModel?: string;
  imageModel?: string;
}

export class GeminiProvider implements AIProvider {
  readonly driver = PROVIDER;
  readonly models = GEMINI_MODELS;
  private clientPromise?: Promise<GeminiClient>;

  constructor(
    private readonly opts: GeminiProviderOptions,
    client?: GeminiClient,
  ) {
    if (client) this.clientPromise = Promise.resolve(client);
  }

  private client(): Promise<GeminiClient> {
    this.clientPromise ??= (async () => {
      const { GoogleGenAI: SDK } = await import('@google/genai');
      return new SDK({ apiKey: this.opts.apiKey });
    })().catch((err: unknown) => {
      this.clientPromise = undefined;
      throw toGeminiError(err, this.opts.apiKey);
    });
    return this.clientPromise;
  }

  private model(m?: string): string {
    return m || this.opts.defaultModel || DEFAULT_MODEL;
  }

  private async complete(req: AiChatRequest, extra?: GenerateContentConfig): Promise<AiChatResponse> {
    const model = this.model(req.model);
    const client = await this.client();
    const params = toGeminiRequest(req, { model });
    if (extra) params.config = { ...params.config, ...extra };
    try {
      const res = await client.models.generateContent(params);
      return fromGeminiResponse(res, model);
    } catch (err) {
      throw toGeminiError(err, this.opts.apiKey);
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
      const chunks: GeminiResponseLike[] = [];
      const iter = await client.models.generateContentStream(toGeminiRequest(req, { model }));
      for await (const chunk of iter) {
        chunks.push(chunk);
        for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (!p.thought && typeof p.text === 'string' && p.text) yield { type: 'text', delta: p.text };
        }
      }
      response = fromGeminiResponse(mergeGeminiChunks(chunks), model);
    } catch (err) {
      throw toGeminiError(err, this.opts.apiKey);
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
    const extra: GenerateContentConfig = { responseMimeType: 'application/json', responseJsonSchema: req.schema };
    const messages: AiMessage[] = [{ role: 'user', content: [{ type: 'text', text: req.prompt }] }];
    const base = { model: req.model, system: req.system, maxTokens: req.maxTokens, effort: req.effort, signal: req.signal };
    return structuredWithRepair(req, messages, (msgs) => this.complete({ ...base, messages: msgs }, extra), PROVIDER);
  }

  async generateImage(req: { prompt: string; size?: string; model?: string }): Promise<{ data: Buffer; mimeType: string; usage?: AiUsage }> {
    const client = await this.client();
    const model = req.model || this.opts.imageModel || DEFAULT_IMAGE_MODEL;
    const aspectRatio = toGeminiAspectRatio(req.size);
    let res: GenerateContentResponse;
    try {
      res = await client.models.generateContent({
        model,
        contents: req.prompt,
        config: { responseModalities: ['IMAGE'], ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
      });
    } catch (err) {
      throw toGeminiError(err, this.opts.apiKey);
    }
    const mapped = fromGeminiResponse(res, model); // throws on safety blocks
    const img = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!img?.data) throw new ProviderError('Gemini image generation returned no image data', PROVIDER, false);
    return { data: Buffer.from(img.data, 'base64'), mimeType: img.mimeType ?? 'image/png', usage: mapped.usage };
  }

  estimateCost(model: string, usage: AiUsage): number {
    return estimateCostFromCatalog(GEMINI_MODELS, model, usage);
  }

  async test(): Promise<TestResult> {
    const model = this.model();
    try {
      // Thinking models count thoughts against maxOutputTokens — leave headroom.
      const res = await this.generateText({ model, prompt: 'Reply with OK', maxTokens: 256, effort: 'low' });
      return { ok: true, message: `Connected to Gemini (${res.model})`, details: { model: res.model, reply: res.text.slice(0, 40) } };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export const geminiConfigSchema = z.object({
  defaultModel: z.string().min(1).default(DEFAULT_MODEL),
  imageModel: z.string().min(1).default(DEFAULT_IMAGE_MODEL),
});

export const geminiSecretsSchema = z.object({
  apiKey: z.string().min(1),
});

export const geminiDriver = defineDriver({
  kind: 'ai',
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Google Gemini models via the Gemini Developer API (@google/genai).',
  configSchema: geminiConfigSchema,
  secretsSchema: geminiSecretsSchema,
  create(config, secrets): AIProvider {
    return new GeminiProvider({ ...config, apiKey: secrets.apiKey });
  },
});
