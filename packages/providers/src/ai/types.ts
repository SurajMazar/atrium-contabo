import type { TestResult } from '../driver';

/** Provider-neutral chat + tool-calling contract (Claude, OpenAI, Gemini…). */
export type AiRole = 'user' | 'assistant';

export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; mediaType?: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

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
  signal?: AbortSignal;
}

export interface AiChatResponse {
  content: AiContentPart[];
  stopReason: 'end' | 'tool_use' | 'max_tokens' | 'other';
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
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** USD per million tokens, used for cost estimation. */
  inputPrice: number;
  outputPrice: number;
  contextWindow?: number;
  default?: boolean;
}

export interface AIProvider {
  readonly driver: string;
  readonly models: ModelInfo[];
  chat(req: AiChatRequest): Promise<AiChatResponse>;
  stream(req: AiChatRequest): AsyncIterable<AiStreamEvent>;
  generateText(req: { model?: string; system?: string; prompt: string; maxTokens?: number; signal?: AbortSignal }): Promise<{ text: string; usage: AiUsage; model: string }>;
  generateStructuredData<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: AiUsage; model: string }>;
  /** Optional image generation; results are ingested into the normal media library. */
  generateImage?(req: { prompt: string; size?: string; model?: string }): Promise<{ data: Buffer; mimeType: string; usage?: AiUsage }>;
  estimateCost(model: string, usage: AiUsage): number;
  test(): Promise<TestResult>;
}
