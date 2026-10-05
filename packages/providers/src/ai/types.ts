import type { TestResult } from '../driver';

/** Provider-neutral chat + tool-calling contract (Claude, OpenAI, Gemini…). */
export type AiRole = 'user' | 'assistant';

export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; mediaType?: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean }
  /**
   * Opaque provider-specific block that MUST be echoed back unchanged in later turns
   * (e.g. Anthropic `thinking` / `redacted_thinking` / `fallback` blocks, OpenAI Responses
   * `reasoning` items, Gemini thought signatures). History is append-only: never edit or
   * reorder earlier turns. Adapters for other providers skip parts whose `provider` differs.
   */
  | { type: 'provider_raw'; provider: string; data: unknown };

export interface AiMessage {
  role: AiRole;
  content: AiContentPart[];
}

export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface AiChatRequest {
  model?: string;
  system?: string;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  toolChoice?: 'auto' | 'any' | 'none' | { name: string };
  maxTokens?: number;
  temperature?: number;
  /** Hint to the provider to cache the system prompt + tools. */
  cache?: boolean;
  /**
   * Reasoning depth for providers that support it (Anthropic `output_config.effort`,
   * OpenAI `reasoning_effort`, Gemini thinking level). Adapters pick a sensible default.
   */
  effort?: AiEffort;
  /** Free-form metadata forwarded where supported (e.g. user id for abuse monitoring). */
  metadata?: { userId?: string };
  signal?: AbortSignal;
}

export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiChatResponse {
  content: AiContentPart[];
  /**
   * `end` — finished; `tool_use` — execute tool calls and continue; `max_tokens` — truncated;
   * `pause` — the provider paused a long turn: append the assistant content as-is and call again;
   * `other` — anything else (see `rawStopReason`). Refusals throw `ProviderError` (code `refusal`).
   */
  stopReason: 'end' | 'tool_use' | 'max_tokens' | 'pause' | 'other';
  /** Provider's own stop reason string, for logging. */
  rawStopReason?: string;
  usage: AiUsage;
  model: string;
  provider: string;
}

export type AiStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'done'; response: AiChatResponse };

export interface StructuredRequest<T> {
  model?: string;
  system?: string;
  prompt: string;
  /** JSON Schema describing the expected output. */
  schema: Record<string, unknown>;
  schemaName: string;
  /** Validate/parse (e.g. zod.parse); thrown errors trigger a repair attempt. */
  parse: (value: unknown) => T;
  maxTokens?: number;
  effort?: AiEffort;
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** USD per million tokens, used for cost estimation. */
  inputPrice: number;
  outputPrice: number;
  /** USD per million cached input tokens read (when the provider discounts cache hits). */
  cacheReadPrice?: number;
  /** USD per million tokens written to the cache (when billed separately). */
  cacheWritePrice?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsImages?: boolean;
  supportsTools?: boolean;
  default?: boolean;
}

export interface AIProvider {
  readonly driver: string;
  readonly models: ModelInfo[];
  chat(req: AiChatRequest): Promise<AiChatResponse>;
  stream(req: AiChatRequest): AsyncIterable<AiStreamEvent>;
  generateText(req: { model?: string; system?: string; prompt: string; maxTokens?: number; effort?: AiEffort; signal?: AbortSignal }): Promise<{ text: string; usage: AiUsage; model: string }>;
  generateStructuredData<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: AiUsage; model: string }>;
  /** Optional image generation; results are ingested into the normal media library. */
  generateImage?(req: { prompt: string; size?: string; model?: string }): Promise<{ data: Buffer; mimeType: string; usage?: AiUsage }>;
  estimateCost(model: string, usage: AiUsage): number;
  test(): Promise<TestResult>;
}
