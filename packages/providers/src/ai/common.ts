import { ProviderError } from '../driver';
import type { AiChatRequest, AiChatResponse, AiContentPart, AiMessage, AiUsage, ModelInfo, StructuredRequest } from './types';

/** Raised when a model declines a request on policy grounds (HTTP 200 + refusal stop reason). */
export class ProviderRefusalError extends ProviderError {
  readonly code = 'refusal';
  constructor(
    message: string,
    provider: string,
    /** Provider refusal category, e.g. Anthropic `stop_details.category` (`cyber`, `bio`, …) — may be null. */
    public readonly category: string | null,
    public readonly explanation?: string,
  ) {
    super(message, provider, false);
    this.name = 'ProviderRefusalError';
  }
}

export function findModel(models: ModelInfo[], id: string): ModelInfo | undefined {
  return models.find((m) => m.id === id) ?? models.find((m) => id.startsWith(m.id));
}

export function defaultModel(models: ModelInfo[]): ModelInfo {
  const m = models.find((x) => x.default) ?? models[0];
  if (!m) throw new Error('model catalog is empty');
  return m;
}

/**
 * USD cost for a call. `usage.inputTokens` is the UNCACHED input count; cache reads and
 * writes are billed separately at their own rates (falling back to 10% / 125% of input).
 */
export function estimateCostFromCatalog(models: ModelInfo[], model: string, usage: AiUsage): number {
  const info = findModel(models, model);
  if (!info) return 0;
  const perToken = (price: number) => price / 1_000_000;
  const cacheRead = info.cacheReadPrice ?? info.inputPrice * 0.1;
  const cacheWrite = info.cacheWritePrice ?? info.inputPrice * 1.25;
  const cost =
    usage.inputTokens * perToken(info.inputPrice) +
    usage.outputTokens * perToken(info.outputPrice) +
    (usage.cacheReadTokens ?? 0) * perToken(cacheRead) +
    (usage.cacheWriteTokens ?? 0) * perToken(cacheWrite);
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0) || undefined,
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0) || undefined,
  };
}

/**
 * Some models reject forced tool choice. Emulate `any` / `{name}` with `auto` plus an
 * instruction appended to the system prompt (never to earlier turns — history is append-only).
 */
export function toolChoiceInstruction(choice: AiChatRequest['toolChoice']): string | undefined {
  if (!choice || choice === 'auto' || choice === 'none') return undefined;
  if (choice === 'any') return 'You must respond by calling one of the provided tools. Do not answer with plain text only.';
  return `You must respond by calling the \`${choice.name}\` tool with valid arguments. Do not answer with plain text only.`;
}

export function appendSystem(system: string | undefined, extra: string | undefined): string | undefined {
  if (!extra) return system;
  return system ? `${system}\n\n${extra}` : extra;
}

/** Returns true when a JSON schema is compatible with strict tool/structured modes (closed objects, all props required). */
export function isStrictCompatible(schema: unknown, depth = 0): boolean {
  if (depth > 40) return false;
  if (!schema || typeof schema !== 'object') return true;
  const s = schema as Record<string, unknown>;
  const type = s.type;
  const isObject = type === 'object' || (Array.isArray(type) && type.includes('object')) || 'properties' in s;
  if (isObject) {
    if (s.additionalProperties !== false) return false;
    const props = (s.properties ?? {}) as Record<string, unknown>;
    const required = Array.isArray(s.required) ? (s.required as string[]) : [];
    if (Object.keys(props).some((k) => !required.includes(k))) return false;
    if (!Object.values(props).every((p) => isStrictCompatible(p, depth + 1))) return false;
  }
  for (const key of ['items', 'not'] as const) if (s[key] && !isStrictCompatible(s[key], depth + 1)) return false;
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const arr = s[key];
    if (Array.isArray(arr) && !arr.every((x) => isStrictCompatible(x, depth + 1))) return false;
  }
  for (const key of ['$defs', 'definitions'] as const) {
    const defs = s[key];
    if (defs && typeof defs === 'object' && !Object.values(defs).every((x) => isStrictCompatible(x, depth + 1))) return false;
  }
  return true;
}

/** Best-effort JSON extraction from model text (handles ```json fences and leading prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.search(/[[{]/);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new SyntaxError('No JSON found in model output');
}

/** Human-readable validation error for a repair prompt (zod issues or generic errors). */
export function describeValidationError(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as { issues: unknown }).issues)) {
    const issues = (err as { issues: Array<{ path?: PropertyKey[]; message?: string }> }).issues;
    return issues
      .slice(0, 30)
      .map((i) => `- ${(i.path ?? []).map(String).join('.') || '(root)'}: ${i.message ?? 'invalid'}`)
      .join('\n');
  }
  return err instanceof Error ? err.message : String(err);
}

export function textOf(content: AiContentPart[]): string {
  return content
    .filter((p): p is Extract<AiContentPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function userText(text: string): AiMessage {
  return { role: 'user', content: [{ type: 'text', text }] };
}

/** Parse a `data:` URL into media type + base64 payload. */
export function parseDataUrl(url: string): { mediaType: string; data: string } | undefined {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return undefined;
  const mediaType = m[1] ?? 'application/octet-stream';
  const data = m[2] ? m[3]! : Buffer.from(decodeURIComponent(m[3]!)).toString('base64');
  return { mediaType, data };
}

export function emptyUsage(): AiUsage {
  return { inputTokens: 0, outputTokens: 0 };
}

/** Remove anything that looks like a credential from an error message. */
export function redactSecrets(message: string, ...secrets: Array<string | undefined>): string {
  let out = message;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('[redacted]');
  return out
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/(key|api[_-]?key|token)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]');
}

/**
 * Shared structured-output loop: parse → on failure, ONE repair turn that appends the invalid
 * assistant output plus the validation error (history stays append-only). Usage is summed.
 */
export async function structuredWithRepair<T>(
  req: Pick<StructuredRequest<T>, 'parse'>,
  messages: AiMessage[],
  call: (messages: AiMessage[]) => Promise<AiChatResponse>,
  provider: string,
): Promise<{ data: T; usage: AiUsage; model: string }> {
  const first = await call(messages);
  let usage = first.usage;
  const firstText = textOf(first.content);
  try {
    return { data: req.parse(extractJson(firstText)), usage, model: first.model };
  } catch (err) {
    const repairMessages: AiMessage[] = [
      ...messages,
      // Append-only repair: echo the full assistant turn (incl. provider_raw reasoning parts).
      { role: 'assistant', content: first.content.length ? first.content : [{ type: 'text', text: '(empty response)' }] },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Your previous response was not valid JSON for the required schema:\n${describeValidationError(err)}\n\nReply with the corrected JSON only — no prose, no code fences.`,
          },
        ],
      },
    ];
    const second = await call(repairMessages);
    usage = addUsage(usage, second.usage);
    try {
      return { data: req.parse(extractJson(textOf(second.content))), usage, model: second.model };
    } catch (err2) {
      throw new ProviderError(`Structured output failed validation after repair: ${describeValidationError(err2)}`, provider, false, err2);
    }
  }
}
