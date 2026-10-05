import { describe, expect, it, vi } from 'vitest';
import type { GenerateContentResponse } from '@google/genai';
import { ProviderRefusalError } from '../../src/ai/common';
import type { AiMessage } from '../../src/ai/types';
import {
  fromGeminiResponse,
  fromGeminiUsage,
  GEMINI_MODELS,
  geminiDriver,
  GeminiProvider,
  mergeGeminiChunks,
  toGeminiAspectRatio,
  toGeminiRequest,
  toGeminiThinkingConfig,
  toGeminiError,
  type GeminiClient,
  type GeminiResponseLike,
} from '../../src/ai/gemini';

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const user = (text: string): AiMessage => ({ role: 'user', content: [{ type: 'text', text }] });

function response(parts: object[], finishReason = 'STOP', extra: Partial<GeminiResponseLike> = {}): GeminiResponseLike {
  return {
    candidates: [{ content: { role: 'model', parts }, finishReason } as never],
    usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 600, candidatesTokenCount: 40, thoughtsTokenCount: 60 },
    modelVersion: 'gemini-2.5-pro',
    ...extra,
  };
}

describe('toGeminiRequest', () => {
  it('maps roles, text, images, tool calls and tool results', () => {
    const p = toGeminiRequest(
      {
        system: 'Be brief',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Look' },
              { type: 'image', url: DATA_URL },
              { type: 'image', url: 'https://example.com/cat.webp' },
            ],
          },
          {
            role: 'assistant',
            content: [
              { type: 'provider_raw', provider: 'openai', data: { type: 'reasoning', id: 'rs_1' } },
              { type: 'text', text: 'Checking' },
              { type: 'tool_call', id: 'toolu_1', name: 'search', input: { q: 'cats' } },
              { type: 'tool_call', id: 'call_2', name: 'lookup', input: {} },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', toolCallId: 'toolu_1', content: '3 cats' },
              { type: 'tool_result', toolCallId: 'call_2', content: 'boom', isError: true },
            ],
          },
        ],
        maxTokens: 300,
        temperature: 0.4,
      },
      { model: 'gemini-2.5-flash' },
    );
    expect(p.model).toBe('gemini-2.5-flash');
    expect(p.contents).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'Look' },
          { inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } },
          { fileData: { fileUri: 'https://example.com/cat.webp', mimeType: 'image/webp' } },
        ],
      },
      {
        role: 'model',
        parts: [
          { text: 'Checking' },
          { functionCall: { id: 'toolu_1', name: 'search', args: { q: 'cats' } } },
          // synthetic id (call_<n>) is not sent back
          { functionCall: { name: 'lookup', args: {} } },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { id: 'toolu_1', name: 'search', response: { output: '3 cats' } } },
          { functionResponse: { name: 'lookup', response: { error: 'boom' } } },
        ],
      },
    ]);
    expect(p.config).toEqual({ systemInstruction: 'Be brief', maxOutputTokens: 300, temperature: 0.4 });
  });

  it('maps tools and tool choice', () => {
    const schema = { type: 'object', properties: { q: { type: 'string' } } };
    const base = { messages: [user('hi')], tools: [{ name: 'search', description: 'Search', inputSchema: schema }] };
    const p = toGeminiRequest({ ...base, toolChoice: 'auto' }, { model: 'gemini-2.5-pro' });
    expect(p.config?.tools).toEqual([{ functionDeclarations: [{ name: 'search', description: 'Search', parametersJsonSchema: schema }] }]);
    expect(p.config?.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
    expect(toGeminiRequest({ ...base, toolChoice: 'none' }, { model: 'm' }).config?.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
    expect(toGeminiRequest({ ...base, toolChoice: 'any' }, { model: 'm' }).config?.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    expect(toGeminiRequest({ ...base, toolChoice: { name: 'search' } }, { model: 'm' }).config?.toolConfig).toEqual({
      functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['search'] },
    });
  });

  it('maps effort to thinking config per model generation', () => {
    expect(toGeminiThinkingConfig('gemini-2.5-pro', 'low')).toEqual({ thinkingBudget: 1024 });
    expect(toGeminiThinkingConfig('gemini-2.5-flash', 'max')).toEqual({ thinkingBudget: 24576 });
    expect(toGeminiThinkingConfig('gemini-3-pro-preview', 'low')).toEqual({ thinkingLevel: 'LOW' });
    expect(toGeminiThinkingConfig('gemini-3-pro-preview', 'high')).toEqual({ thinkingLevel: 'HIGH' });
    expect(toGeminiThinkingConfig('gemini-2.5-flash-image', 'high')).toBeUndefined();
    expect(toGeminiThinkingConfig('gemini-2.5-pro', undefined)).toBeUndefined();
    const signal = new AbortController().signal;
    expect(toGeminiRequest({ messages: [user('x')], effort: 'medium', signal }, { model: 'gemini-2.5-pro' }).config).toEqual({
      thinkingConfig: { thinkingBudget: 8192 },
      abortSignal: signal,
    });
  });
});

describe('fromGeminiResponse', () => {
  it('maps text, function calls (synthesizing ids) and usage', () => {
    const r = fromGeminiResponse(
      response([{ text: 'Sure.' }, { functionCall: { name: 'a', args: { x: 1 } } }, { functionCall: { id: 'fc_real', name: 'b', args: {} } }, { functionCall: { name: 'c' } }]),
      'gemini-2.5-pro',
    );
    expect(r.content).toEqual([
      { type: 'text', text: 'Sure.' },
      { type: 'tool_call', id: 'call_1', name: 'a', input: { x: 1 } },
      { type: 'tool_call', id: 'fc_real', name: 'b', input: {} },
      { type: 'tool_call', id: 'call_3', name: 'c', input: {} },
    ]);
    expect(r.stopReason).toBe('tool_use');
    // input excludes cached; output includes thoughts
    expect(r.usage).toEqual({ inputTokens: 400, outputTokens: 100, cacheReadTokens: 600 });
    expect(r.provider).toBe('gemini');
  });

  it('maps finish reasons', () => {
    expect(fromGeminiResponse(response([{ text: 'x' }]), 'm').stopReason).toBe('end');
    expect(fromGeminiResponse(response([{ text: 'x' }], 'MAX_TOKENS'), 'm').stopReason).toBe('max_tokens');
    expect(fromGeminiResponse(response([], 'MALFORMED_FUNCTION_CALL'), 'm').stopReason).toBe('other');
    for (const reason of ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'RECITATION']) {
      expect(() => fromGeminiResponse(response([], reason), 'm')).toThrow(ProviderRefusalError);
    }
  });

  it('throws on promptFeedback.blockReason', () => {
    const res = { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] } as unknown as GeminiResponseLike;
    try {
      fromGeminiResponse(res, 'm');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderRefusalError);
      expect((err as ProviderRefusalError).category).toBe('safety');
    }
  });

  it('fromGeminiUsage handles missing metadata', () => {
    expect(fromGeminiUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('thought signature round-trip', () => {
  it('preserves every part raw when any part carries a signature, and echoes only raw parts', () => {
    const parts = [
      { text: 'thinking summary', thought: true },
      { text: 'Let me search.' },
      { functionCall: { name: 'search', args: { q: 'x' } }, thoughtSignature: 'SIG_1' },
    ];
    const r = fromGeminiResponse(response(parts), 'gemini-2.5-pro');
    // neutral parts for display (no neutral part for the thought) + raw copy of each part
    expect(r.content).toEqual([
      { type: 'provider_raw', provider: 'gemini', data: parts[0] },
      { type: 'text', text: 'Let me search.' },
      { type: 'provider_raw', provider: 'gemini', data: parts[1] },
      { type: 'tool_call', id: 'call_1', name: 'search', input: { q: 'x' } },
      { type: 'provider_raw', provider: 'gemini', data: parts[2] },
    ]);

    const req = toGeminiRequest(
      {
        messages: [
          user('go'),
          { role: 'assistant', content: r.content },
          { role: 'user', content: [{ type: 'tool_result', toolCallId: 'call_1', content: 'result' }] },
        ],
      },
      { model: 'gemini-2.5-pro' },
    );
    // model turn = exactly the original parts (no duplicated neutral parts)
    expect(req.contents).toEqual([
      { role: 'user', parts: [{ text: 'go' }] },
      { role: 'model', parts },
      { role: 'user', parts: [{ functionResponse: { name: 'search', response: { output: 'result' } } }] },
    ]);
  });

  it('emits no provider_raw when nothing carries a signature', () => {
    const r = fromGeminiResponse(response([{ text: 'plain' }]), 'm');
    expect(r.content).toEqual([{ type: 'text', text: 'plain' }]);
  });
});

describe('mergeGeminiChunks', () => {
  it('concatenates plain text and keeps signature parts separate', () => {
    const merged = mergeGeminiChunks([
      response([{ text: 'Hel' }], undefined as never, { usageMetadata: undefined }),
      response([{ text: 'lo' }], undefined as never, { usageMetadata: undefined }),
      response([{ text: '', thoughtSignature: 'S' }], 'STOP'),
    ]);
    expect(merged.candidates?.[0]?.content?.parts).toEqual([{ text: 'Hello' }, { text: '', thoughtSignature: 'S' }]);
    expect(merged.candidates?.[0]?.finishReason).toBe('STOP');
    expect(merged.usageMetadata?.promptTokenCount).toBe(1000);
  });
});

describe('helpers', () => {
  it('toGeminiAspectRatio', () => {
    expect(toGeminiAspectRatio('1024x1024')).toBe('1:1');
    expect(toGeminiAspectRatio('1536x1024')).toBe('3:2');
    expect(toGeminiAspectRatio('1920x1080')).toBe('16:9');
    expect(toGeminiAspectRatio('9:16')).toBe('9:16');
    expect(toGeminiAspectRatio('huge')).toBeUndefined();
  });

  it('toGeminiError', () => {
    expect(toGeminiError(Object.assign(new Error('quota'), { status: 429 })).retryable).toBe(true);
    expect(toGeminiError(Object.assign(new Error('bad'), { status: 400 })).retryable).toBe(false);
    expect(toGeminiError(new TypeError('fetch failed')).retryable).toBe(true);
    const e = toGeminiError(Object.assign(new Error('API key not valid: AIzaSyA1234567890abcdefghijklmnop'), { status: 400 }));
    expect(e.message).not.toContain('AIzaSy');
  });

  it('estimateCost', () => {
    const p = new GeminiProvider({ apiKey: 'k' }, {} as GeminiClient);
    // gemini-2.5-flash: $0.30 in, $2.50 out, $0.03 cached
    expect(p.estimateCost('gemini-2.5-flash', { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 })).toBeCloseTo(2.83);
    // -lite must not be priced as flash
    expect(p.estimateCost('gemini-2.5-flash-lite-preview-09-2025', { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(0.1);
    expect(GEMINI_MODELS.filter((m) => m.default)).toHaveLength(1);
  });
});

describe('GeminiProvider with injected client', () => {
  it('generateStructuredData sets JSON mode and repairs once', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(response([{ text: 'not json' }]))
      .mockResolvedValueOnce(response([{ text: '{"ok":true}' }]));
    const p = new GeminiProvider({ apiKey: 'k' }, { models: { generateContent } } as unknown as GeminiClient);
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
    const out = await p.generateStructuredData({ prompt: 'p', schema, schemaName: 's', parse: (v) => v as { ok: boolean } });
    expect(out.data).toEqual({ ok: true });
    expect(out.usage).toEqual({ inputTokens: 800, outputTokens: 200, cacheReadTokens: 1200 });
    const first = generateContent.mock.calls[0]![0];
    expect(first.config).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: schema });
    const second = generateContent.mock.calls[1]![0];
    expect(second.contents).toHaveLength(3);
    expect(second.contents[1]).toEqual({ role: 'model', parts: [{ text: 'not json' }] });
  });

  it('stream yields text deltas, tool calls, then done', async () => {
    async function* gen(): AsyncGenerator<GeminiResponseLike> {
      yield response([{ text: 'A' }], undefined as never, { usageMetadata: undefined });
      yield response([{ functionCall: { name: 't', args: { x: 1 } } }], 'STOP');
    }
    const generateContentStream = vi.fn().mockResolvedValue(gen());
    const p = new GeminiProvider({ apiKey: 'k' }, { models: { generateContentStream } } as unknown as GeminiClient);
    const events = [];
    for await (const e of p.stream({ messages: [user('hi')] })) events.push(e);
    expect(events.map((e) => e.type)).toEqual(['text', 'tool_call', 'done']);
    expect(events[1]).toEqual({ type: 'tool_call', id: 'call_1', name: 't', input: { x: 1 } });
  });

  it('generateImage decodes inlineData', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValue(response([{ inlineData: { mimeType: 'image/png', data: Buffer.from('img').toString('base64') } }]) as GenerateContentResponse);
    const p = new GeminiProvider({ apiKey: 'k' }, { models: { generateContent } } as unknown as GeminiClient);
    const img = await p.generateImage({ prompt: 'a cat', size: '1792x1024' });
    expect(img.data.toString()).toBe('img');
    expect(img.mimeType).toBe('image/png');
    expect(generateContent.mock.calls[0]![0]).toEqual({
      model: 'gemini-2.5-flash-image',
      contents: 'a cat',
      config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
    });
  });

  it('test() reports failures without throwing', async () => {
    const generateContent = vi.fn().mockRejectedValue(Object.assign(new Error('API key not valid'), { status: 400 }));
    const p = new GeminiProvider({ apiKey: 'k' }, { models: { generateContent } } as unknown as GeminiClient);
    const r = await p.test();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('400');
  });
});

describe('geminiDriver', () => {
  it('parses config defaults', () => {
    expect(geminiDriver.configSchema.parse({})).toEqual({ defaultModel: 'gemini-2.5-pro', imageModel: 'gemini-2.5-flash-image' });
    expect(geminiDriver.id).toBe('gemini');
  });
});
