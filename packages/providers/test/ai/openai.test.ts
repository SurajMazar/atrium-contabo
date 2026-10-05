import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses';
import { ProviderError } from '../../src/driver';
import { ProviderRefusalError } from '../../src/ai/common';
import type { AiChatRequest, AiMessage } from '../../src/ai/types';
import {
  fromOpenAIChatCompletion,
  fromOpenAIResponse,
  OPENAI_MODELS,
  OpenAIChatStreamAccumulator,
  OpenAIProvider,
  openaiDriver,
  parseToolArguments,
  sanitizeSchemaName,
  toOpenAIChatParams,
  toOpenAIResponsesParams,
  toOpenAIError,
  type OpenAIClient,
} from '../../src/ai/openai';

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

const history: AiMessage[] = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image', url: DATA_URL },
      { type: 'image', url: 'https://example.com/cat.jpg' },
    ],
  },
  {
    role: 'assistant',
    content: [
      { type: 'provider_raw', provider: 'anthropic', data: { type: 'thinking', thinking: 'hmm', signature: 'sig' } },
      { type: 'text', text: 'Let me look that up.' },
      { type: 'tool_call', id: 'call_a', name: 'search', input: { q: 'cats' } },
      { type: 'tool_call', id: 'call_b', name: 'lookup', input: { id: 7 } },
    ],
  },
  {
    role: 'user',
    content: [
      { type: 'tool_result', toolCallId: 'call_a', content: 'found 3 cats' },
      { type: 'tool_result', toolCallId: 'call_b', content: 'not found', isError: true },
      { type: 'text', text: 'Thanks' },
    ],
  },
];

function completion(over: Partial<ChatCompletion.Choice['message']> = {}, finish: ChatCompletion.Choice['finish_reason'] = 'stop'): ChatCompletion {
  return {
    id: 'cmpl_1',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-5.2-2025-12-11',
    choices: [{ index: 0, logprobs: null, finish_reason: finish, message: { role: 'assistant', content: 'Hello', refusal: null, ...over } }],
    usage: { prompt_tokens: 1200, completion_tokens: 50, total_tokens: 1250, prompt_tokens_details: { cached_tokens: 1000 } },
  };
}

describe('toOpenAIChatParams', () => {
  it('maps system, images, tool calls and tool results', () => {
    const p = toOpenAIChatParams({ system: 'Be brief', messages: history, maxTokens: 500 }, { model: 'gpt-4.1' });
    expect(p.model).toBe('gpt-4.1');
    expect(p.max_completion_tokens).toBe(500);
    expect(p.messages[0]).toEqual({ role: 'system', content: 'Be brief' });
    expect(p.messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image_url', image_url: { url: DATA_URL } },
        { type: 'image_url', image_url: { url: 'https://example.com/cat.jpg' } },
      ],
    });
    // anthropic provider_raw skipped; text + tool calls in one assistant message
    expect(p.messages[2]).toEqual({
      role: 'assistant',
      content: 'Let me look that up.',
      tool_calls: [
        { id: 'call_a', type: 'function', function: { name: 'search', arguments: '{"q":"cats"}' } },
        { id: 'call_b', type: 'function', function: { name: 'lookup', arguments: '{"id":7}' } },
      ],
    });
    // tool messages (in order) directly after the assistant turn, then the user text
    expect(p.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_a', content: 'found 3 cats' });
    expect(p.messages[4]).toEqual({ role: 'tool', tool_call_id: 'call_b', content: 'Error: not found' });
    expect(p.messages[5]).toEqual({ role: 'user', content: 'Thanks' });
    expect(p.messages).toHaveLength(6);
  });

  it('maps tools with strict detection and tool choice', () => {
    const strictSchema = { type: 'object', properties: { q: { type: 'string' } }, required: ['q'], additionalProperties: false };
    const looseSchema = { type: 'object', properties: { q: { type: 'string' } } };
    const base: AiChatRequest = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [
        { name: 'strict_tool', description: 'a', inputSchema: strictSchema },
        { name: 'loose_tool', description: 'b', inputSchema: looseSchema },
      ],
    };
    const p = toOpenAIChatParams({ ...base, toolChoice: 'auto' }, { model: 'gpt-4.1' });
    expect(p.tools).toEqual([
      { type: 'function', function: { name: 'strict_tool', description: 'a', parameters: strictSchema, strict: true } },
      { type: 'function', function: { name: 'loose_tool', description: 'b', parameters: looseSchema, strict: false } },
    ]);
    expect(p.tool_choice).toBe('auto');
    expect(toOpenAIChatParams({ ...base, toolChoice: 'none' }, { model: 'gpt-4.1' }).tool_choice).toBe('none');
    expect(toOpenAIChatParams({ ...base, toolChoice: 'any' }, { model: 'gpt-4.1' }).tool_choice).toBe('required');
    expect(toOpenAIChatParams({ ...base, toolChoice: { name: 'loose_tool' } }, { model: 'gpt-4.1' }).tool_choice).toEqual({
      type: 'function',
      function: { name: 'loose_tool' },
    });
    // no tools → no tool_choice
    expect(toOpenAIChatParams({ messages: base.messages, toolChoice: 'any' }, { model: 'gpt-4.1' }).tool_choice).toBeUndefined();
  });

  it('sends reasoning_effort (and drops temperature) only for reasoning models', () => {
    const req: AiChatRequest = { messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], effort: 'max', temperature: 0.2 };
    const r = toOpenAIChatParams(req, { model: 'gpt-5.2' });
    expect(r.reasoning_effort).toBe('high');
    expect(r.temperature).toBeUndefined();
    expect(toOpenAIChatParams({ ...req, effort: 'low' }, { model: 'o4-mini' }).reasoning_effort).toBe('low');
    const n = toOpenAIChatParams(req, { model: 'gpt-4.1' });
    expect(n.reasoning_effort).toBeUndefined();
    expect(n.temperature).toBe(0.2);
  });

  it('forwards metadata.userId as safety_identifier', () => {
    const p = toOpenAIChatParams({ messages: [], metadata: { userId: 'u1' } }, { model: 'gpt-4.1' });
    expect(p.safety_identifier).toBe('u1');
  });
});

describe('fromOpenAIChatCompletion', () => {
  it('maps text and usage (inputTokens excludes cached tokens)', () => {
    const r = fromOpenAIChatCompletion(completion());
    expect(r.content).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(r.stopReason).toBe('end');
    expect(r.usage).toEqual({ inputTokens: 200, outputTokens: 50, cacheReadTokens: 1000 });
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('gpt-5.2-2025-12-11');
  });

  it('maps tool calls, tolerating invalid JSON arguments', () => {
    const r = fromOpenAIChatCompletion(
      completion(
        {
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } },
            { id: 'call_2', type: 'function', function: { name: 'broken', arguments: '{"q":' } },
          ],
        },
        'tool_calls',
      ),
    );
    expect(r.stopReason).toBe('tool_use');
    expect(r.content).toEqual([
      { type: 'tool_call', id: 'call_1', name: 'search', input: { q: 'x' } },
      { type: 'tool_call', id: 'call_2', name: 'broken', input: { _raw: '{"q":' } },
    ]);
  });

  it('round-trips tool calls back into request params', () => {
    const r = fromOpenAIChatCompletion(
      completion({ content: null, tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'f', arguments: '{"a":1}' } }] }, 'tool_calls'),
    );
    const p = toOpenAIChatParams(
      {
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'go' }] },
          { role: 'assistant', content: r.content },
          { role: 'user', content: [{ type: 'tool_result', toolCallId: 'call_9', content: 'ok' }] },
        ],
      },
      { model: 'gpt-4.1' },
    );
    expect(p.messages[1]).toEqual({ role: 'assistant', content: null, tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'f', arguments: '{"a":1}' } }] });
    expect(p.messages[2]).toEqual({ role: 'tool', tool_call_id: 'call_9', content: 'ok' });
  });

  it('maps length → max_tokens', () => {
    expect(fromOpenAIChatCompletion(completion({}, 'length')).stopReason).toBe('max_tokens');
  });

  it('throws ProviderRefusalError on refusal and content_filter', () => {
    expect(() => fromOpenAIChatCompletion(completion({ content: null, refusal: "I can't help with that" }))).toThrow(ProviderRefusalError);
    try {
      fromOpenAIChatCompletion(completion({}, 'content_filter'));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderRefusalError);
      expect((err as ProviderRefusalError).category).toBe('content_filter');
      expect((err as ProviderRefusalError).code).toBe('refusal');
    }
  });
});

describe('stream accumulator', () => {
  it('accumulates text and tool call deltas by index', () => {
    const chunk = (delta: ChatCompletionChunk.Choice['delta'], finish: ChatCompletionChunk.Choice['finish_reason'] = null): ChatCompletionChunk => ({
      id: 'c',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'gpt-4.1',
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    const acc = new OpenAIChatStreamAccumulator('gpt-4.1');
    expect(acc.push(chunk({ content: 'Hi ' }))).toBe('Hi ');
    acc.push(chunk({ tool_calls: [{ index: 1, id: 'call_y', function: { name: 'b', arguments: '{"z"' } }] }));
    acc.push(chunk({ tool_calls: [{ index: 0, id: 'call_x', function: { name: 'a', arguments: '{}' } }] }));
    acc.push(chunk({ tool_calls: [{ index: 1, function: { arguments: ':2}' } }] }, 'tool_calls'));
    acc.push({ ...chunk({}), choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    const r = acc.finish();
    expect(r.content).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'tool_call', id: 'call_x', name: 'a', input: {} },
      { type: 'tool_call', id: 'call_y', name: 'b', input: { z: 2 } },
    ]);
    expect(r.stopReason).toBe('tool_use');
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
});

describe('Responses API mapping', () => {
  const reasoningItem = { id: 'rs_1', type: 'reasoning', summary: [], encrypted_content: 'enc' };

  it('maps output: reasoning → provider_raw, function_call → tool_call, usage', () => {
    const res = {
      model: 'gpt-5.2',
      status: 'completed',
      incomplete_details: null,
      output: [
        reasoningItem,
        { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'search', arguments: '{"q":"x"}', status: 'completed' },
      ],
      usage: { input_tokens: 500, input_tokens_details: { cached_tokens: 100, cache_write_tokens: 0 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 10 }, total_tokens: 520 },
    } as unknown as OpenAIResponse;
    const r = fromOpenAIResponse(res);
    expect(r.content).toEqual([
      { type: 'provider_raw', provider: 'openai', data: reasoningItem },
      { type: 'tool_call', id: 'call_1', name: 'search', input: { q: 'x' } },
    ]);
    expect(r.stopReason).toBe('tool_use');
    expect(r.usage).toEqual({ inputTokens: 400, outputTokens: 20, cacheReadTokens: 100 });

    // echo back: reasoning item unchanged, before its function_call, then the output
    const p = toOpenAIResponsesParams(
      {
        system: 'sys',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'go' }, { type: 'image', url: DATA_URL }] },
          { role: 'assistant', content: [{ type: 'provider_raw', provider: 'gemini', data: { text: 'x' } }, ...r.content] },
          { role: 'user', content: [{ type: 'tool_result', toolCallId: 'call_1', content: 'res' }] },
        ],
        effort: 'medium',
        tools: [{ name: 'search', description: 'd', inputSchema: { type: 'object' } }],
        toolChoice: { name: 'search' },
      },
      { model: 'gpt-5.2' },
    );
    expect(p.instructions).toBe('sys');
    expect(p.store).toBe(false);
    expect(p.include).toEqual(['reasoning.encrypted_content']);
    expect(p.reasoning).toEqual({ effort: 'medium' });
    expect(p.tool_choice).toEqual({ type: 'function', name: 'search' });
    expect(p.tools).toEqual([{ type: 'function', name: 'search', description: 'd', parameters: { type: 'object' }, strict: false }]);
    expect(p.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'go' }, { type: 'input_image', image_url: DATA_URL, detail: 'auto' }] },
      reasoningItem,
      { type: 'function_call', call_id: 'call_1', name: 'search', arguments: '{"q":"x"}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'res' },
    ]);
  });

  it('maps text, max_output_tokens and refusals', () => {
    const base = { model: 'gpt-4.1', usage: undefined, incomplete_details: null };
    const text = fromOpenAIResponse({
      ...base,
      status: 'completed',
      output: [{ type: 'message', id: 'm', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Hi', annotations: [] }] }],
    } as unknown as OpenAIResponse);
    expect(text.content).toEqual([{ type: 'text', text: 'Hi' }]);
    expect(text.stopReason).toBe('end');
    const trunc = fromOpenAIResponse({ ...base, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] } as unknown as OpenAIResponse);
    expect(trunc.stopReason).toBe('max_tokens');
    expect(() =>
      fromOpenAIResponse({
        ...base,
        status: 'completed',
        output: [{ type: 'message', id: 'm', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'no' }] }],
      } as unknown as OpenAIResponse),
    ).toThrow(ProviderRefusalError);
  });
});

describe('helpers', () => {
  it('parseToolArguments', () => {
    expect(parseToolArguments('')).toEqual({});
    expect(parseToolArguments('[1]')).toEqual({ _raw: '[1]' });
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
  });

  it('sanitizeSchemaName', () => {
    expect(sanitizeSchemaName('Page Plan (v2)')).toBe('Page_Plan__v2_');
    expect(sanitizeSchemaName('x'.repeat(100))).toHaveLength(64);
    expect(sanitizeSchemaName('')).toBe('output');
  });

  it('toOpenAIError: retryable statuses, connection errors, redaction', () => {
    expect(toOpenAIError(Object.assign(new Error('rate limited'), { status: 429 })).retryable).toBe(true);
    expect(toOpenAIError(Object.assign(new Error('boom'), { status: 503 })).retryable).toBe(true);
    expect(toOpenAIError(Object.assign(new Error('bad'), { status: 400 })).retryable).toBe(false);
    class APIConnectionError extends Error {}
    expect(toOpenAIError(new APIConnectionError('Connection error.')).retryable).toBe(true);
    const e = toOpenAIError(Object.assign(new Error('Incorrect API key provided: sk-proj-abcdefghijklmnop'), { status: 401 }), 'sk-proj-abcdefghijklmnop');
    expect(e.message).not.toContain('abcdefghijklmnop');
    const pe = new ProviderError('x', 'openai');
    expect(toOpenAIError(pe)).toBe(pe);
  });
});

describe('estimateCost', () => {
  it('uses catalog prices incl. cache reads', () => {
    const p = new OpenAIProvider({ apiKey: 'k' }, {} as OpenAIClient);
    // gpt-4.1: $2 in, $8 out, $0.5 cached per 1M
    expect(p.estimateCost('gpt-4.1', { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 })).toBeCloseTo(10.5);
    // dated snapshot falls back to prefix
    expect(p.estimateCost('gpt-4.1-mini-2025-04-14', { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(0.4);
    expect(p.estimateCost('unknown-model', { inputTokens: 1, outputTokens: 1 })).toBe(0);
    expect(OPENAI_MODELS.filter((m) => m.default)).toHaveLength(1);
  });
});

describe('OpenAIProvider with injected client', () => {
  it('generateStructuredData repairs once and sums usage', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completion({ content: '{"title": 5}' }))
      .mockResolvedValueOnce(completion({ content: '{"title": "Home"}' }));
    const client = { chat: { completions: { create } } } as unknown as OpenAIClient;
    const p = new OpenAIProvider({ apiKey: 'k', defaultModel: 'gpt-4.1' }, client);
    const parse = (v: unknown) => {
      const t = (v as { title?: unknown }).title;
      if (typeof t !== 'string') throw new Error('title must be a string');
      return { title: t };
    };
    const schema = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false };
    const out = await p.generateStructuredData({ prompt: 'make a title', schema, schemaName: 'page title', parse });
    expect(out.data).toEqual({ title: 'Home' });
    expect(out.usage).toEqual({ inputTokens: 400, outputTokens: 100, cacheReadTokens: 2000 });
    const first = create.mock.calls[0]![0];
    expect(first.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'page_title', schema, strict: true } });
    const second = create.mock.calls[1]![0];
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1]).toEqual({ role: 'assistant', content: '{"title": 5}' });
    expect(second.messages[2].content).toContain('title must be a string');
  });

  it('stream yields text deltas, tool calls, then done', async () => {
    async function* gen(): AsyncGenerator<ChatCompletionChunk> {
      const c = (delta: ChatCompletionChunk.Choice['delta'], finish: ChatCompletionChunk.Choice['finish_reason'] = null): ChatCompletionChunk => ({
        id: 'c',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-4.1',
        choices: [{ index: 0, delta, finish_reason: finish }],
      });
      yield c({ content: 'A' });
      yield c({ content: 'B' });
      yield c({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 't', arguments: '{"x":1}' } }] }, 'tool_calls');
    }
    const create = vi.fn().mockResolvedValue(gen());
    const p = new OpenAIProvider({ apiKey: 'k' }, { chat: { completions: { create } } } as unknown as OpenAIClient);
    const events = [];
    for await (const e of p.stream({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })) events.push(e);
    expect(events.map((e) => e.type)).toEqual(['text', 'text', 'tool_call', 'done']);
    expect(events[2]).toEqual({ type: 'tool_call', id: 'call_1', name: 't', input: { x: 1 } });
    expect(create.mock.calls[0]![0]).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it('test() reports failures without throwing', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('invalid key'), { status: 401 }));
    const p = new OpenAIProvider({ apiKey: 'k' }, { chat: { completions: { create } } } as unknown as OpenAIClient);
    const r = await p.test();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('401');
  });

  it('generateImage decodes b64_json', async () => {
    const generate = vi.fn().mockResolvedValue({ created: 0, data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }] });
    const p = new OpenAIProvider({ apiKey: 'k', imageModel: 'gpt-image-1' }, { images: { generate } } as unknown as OpenAIClient);
    const img = await p.generateImage({ prompt: 'a cat', size: '1024x1024' });
    expect(img.data.toString()).toBe('png-bytes');
    expect(img.mimeType).toBe('image/png');
    expect(generate.mock.calls[0]![0]).toEqual({ model: 'gpt-image-1', prompt: 'a cat', n: 1, size: '1024x1024' });
  });
});

describe('openaiDriver', () => {
  it('parses config defaults and creates a provider', () => {
    const cfg = openaiDriver.configSchema.parse({});
    expect(cfg).toEqual({ defaultModel: 'gpt-5.5', api: 'chat', imageModel: 'gpt-image-1' });
    const provider = openaiDriver.create(cfg, openaiDriver.secretsSchema.parse({ apiKey: 'sk-test' }));
    expect(provider.driver).toBe('openai');
    expect(openaiDriver.kind).toBe('ai');
  });
});
