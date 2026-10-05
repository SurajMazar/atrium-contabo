import { describe, expect, it, vi } from 'vitest';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  ANTHROPIC_FALLBACK_BETA,
  AnthropicProvider,
  anthropicConfigSchema,
  fromAnthropicMessage,
  toAnthropicOutputSchema,
  toAnthropicParams,
  type AnthropicClientLike,
  type AnthropicRequestParams,
} from '../../src/ai/anthropic';
import { ProviderRefusalError } from '../../src/ai/common';
import type { AiMessage } from '../../src/ai/types';

const opts = { defaultModel: 'claude-opus-5-5', defaultEffort: 'medium' as const, serverSideFallbacks: true };

function message(partial: Partial<BetaMessage>): BetaMessage {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 400, cache_creation_input_tokens: 20 },
    ...partial,
  } as unknown as BetaMessage;
}

describe('toAnthropicParams', () => {
  it('maps a full tool-use conversation with thinking passthrough unchanged', () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig-abc' };
    const history: AiMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'Build a site' }, { type: 'image', url: 'data:image/png;base64,AAAA' }] },
      {
        role: 'assistant',
        content: [
          { type: 'provider_raw', provider: 'anthropic', data: thinking },
          { type: 'text', text: 'Calling tool' },
          { type: 'tool_call', id: 'toolu_1', name: 'add_page', input: { title: 'Home' } },
          { type: 'provider_raw', provider: 'openai', data: { type: 'reasoning' } },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'note' }, { type: 'tool_result', toolCallId: 'toolu_1', content: 'ok' }] },
    ];
    const p = toAnthropicParams({ messages: history }, opts);
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.max_tokens).toBe(32000);
    expect(p.messages[0]!.content).toEqual([
      { type: 'text', text: 'Build a site' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    ]);
    const assistant = p.messages[1]!.content as unknown[];
    expect(assistant[0]).toBe(thinking); // same object, byte-for-byte echo
    expect(assistant).toEqual([thinking, { type: 'text', text: 'Calling tool' }, { type: 'tool_use', id: 'toolu_1', name: 'add_page', input: { title: 'Home' } }]);
    // tool_result moved to the front of the user turn
    expect(p.messages[2]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }, { type: 'text', text: 'note' }]);
    // never sends thinking config/budget/temperature on Opus 5.5
    expect(p).not.toHaveProperty('thinking');
    expect(p).not.toHaveProperty('temperature');
    expect(p.output_config).toEqual({ effort: 'medium' });
    expect(p.betas).toEqual([ANTHROPIC_FALLBACK_BETA]);
    expect(p.fallbacks).toBe('default');
  });

  it('maps forced tool choice to auto + instruction after the cached system block', () => {
    const p = toAnthropicParams(
      {
        system: 'You are a site builder.',
        cache: true,
        effort: 'high',
        temperature: 0.2,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
        tools: [
          { name: 'a', description: 'A', inputSchema: { type: 'object', properties: { x: { type: 'string' } } } },
          { name: 'b', description: 'B', inputSchema: { type: 'object', properties: { y: { type: 'number' } }, required: ['y'], additionalProperties: false } },
        ],
        toolChoice: { name: 'b' },
      },
      opts,
    );
    expect(p.tool_choice).toEqual({ type: 'auto' });
    expect(p.system).toEqual([
      { type: 'text', text: 'You are a site builder.', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: expect.stringContaining('`b` tool') },
    ]);
    const tools = p.tools as unknown as Array<Record<string, unknown>>;
    expect(tools[0]).not.toHaveProperty('strict'); // not strict-compatible
    expect(tools[0]).not.toHaveProperty('cache_control');
    expect(tools[1]).toMatchObject({ name: 'b', strict: true, cache_control: { type: 'ephemeral' } });
    expect(p.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.output_config).toEqual({ effort: 'high' });
    expect(p).not.toHaveProperty('temperature');
  });

  it('any → auto + generic instruction; none stays none', () => {
    const tools = [{ name: 't', description: 'T', inputSchema: { type: 'object' } }];
    const any = toAnthropicParams({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], tools, toolChoice: 'any' }, opts);
    expect(any.tool_choice).toEqual({ type: 'auto' });
    expect(any.system).toContain('calling one of the provided tools');
    const none = toAnthropicParams({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], tools, toolChoice: 'none' }, opts);
    expect(none.tool_choice).toEqual({ type: 'none' });
    expect(none.system).toBeUndefined();
  });

  it('haiku 4.5 keeps forced tool choice, temperature, no effort/fallbacks', () => {
    const p = toAnthropicParams(
      { model: 'claude-haiku-4-5', temperature: 0.3, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], tools: [{ name: 't', description: 'T', inputSchema: { type: 'object' } }], toolChoice: 'any' },
      opts,
    );
    expect(p.tool_choice).toEqual({ type: 'any' });
    expect(p.temperature).toBe(0.3);
    expect(p.output_config).toBeUndefined();
    expect(p.betas).toBeUndefined();
    expect(p.fallbacks).toBeUndefined();
  });

  it('fallbacks can be disabled', () => {
    const p = toAnthropicParams({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] }, { ...opts, serverSideFallbacks: false });
    expect(p.betas).toBeUndefined();
    expect(p.fallbacks).toBeUndefined();
  });
});

describe('fromAnthropicMessage', () => {
  it('maps text/tool_use to neutral parts and thinking/fallback blocks to provider_raw', () => {
    const thinking = { type: 'thinking', thinking: '', signature: 's1' };
    const fallback = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } };
    const res = fromAnthropicMessage(
      message({
        content: [thinking, { type: 'text', text: 'Hi', citations: null }, { type: 'tool_use', id: 'toolu_9', name: 'x', input: { a: 1 } }, fallback] as never,
        stop_reason: 'tool_use',
      }),
    );
    expect(res.content).toEqual([
      { type: 'provider_raw', provider: 'anthropic', data: thinking },
      { type: 'text', text: 'Hi' },
      { type: 'tool_call', id: 'toolu_9', name: 'x', input: { a: 1 } },
      { type: 'provider_raw', provider: 'anthropic', data: fallback },
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 400, cacheWriteTokens: 20 });
  });

  it('round-trips assistant content back into params unchanged', () => {
    const blocks = [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'a', citations: null }, { type: 'tool_use', id: 't1', name: 'n', input: { q: 1 } }];
    const res = fromAnthropicMessage(message({ content: blocks as never, stop_reason: 'tool_use' }));
    const p = toAnthropicParams({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }, { role: 'assistant', content: res.content }] }, opts);
    expect(p.messages[1]!.content).toEqual([blocks[0], { type: 'text', text: 'a' }, blocks[2]]);
  });

  it('maps stop reasons', () => {
    expect(fromAnthropicMessage(message({ stop_reason: 'max_tokens' })).stopReason).toBe('max_tokens');
    expect(fromAnthropicMessage(message({ stop_reason: 'pause_turn' })).stopReason).toBe('pause');
    expect(fromAnthropicMessage(message({ stop_reason: 'end_turn' })).stopReason).toBe('end');
  });

  it('throws ProviderRefusalError with stop_details category', () => {
    const run = () => fromAnthropicMessage(message({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'nope' } as never }));
    expect(run).toThrow(ProviderRefusalError);
    try {
      run();
    } catch (e) {
      expect((e as ProviderRefusalError).category).toBe('cyber');
      expect((e as ProviderRefusalError).retryable).toBe(false);
    }
  });
});

describe('toAnthropicOutputSchema', () => {
  it('closes objects and strips $schema', () => {
    const out = toAnthropicOutputSchema({ $schema: 'x', type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'string' } } } } });
    expect(out).toEqual({ type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'string' } }, additionalProperties: false } }, additionalProperties: false });
  });
  it('rejects open records', () => {
    expect(toAnthropicOutputSchema({ type: 'object', additionalProperties: { type: 'string' } })).toBeUndefined();
  });
});

describe('AnthropicProvider with a fake client', () => {
  function fakeClient(responses: BetaMessage[]) {
    const calls: AnthropicRequestParams[] = [];
    const client: AnthropicClientLike = {
      beta: {
        messages: {
          stream(params) {
            calls.push(structuredClone(params));
            const msg = responses.shift()!;
            return {
              async *[Symbol.asyncIterator]() {
                for (const b of msg.content) if (b.type === 'text') yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: b.text } };
              },
              finalMessage: async () => msg,
            };
          },
        },
      },
      models: { retrieve: vi.fn(async (id: string) => ({ id, display_name: 'Claude Opus 5.5' })) },
    };
    return { client, calls };
  }
  const config = anthropicConfigSchema.parse({});

  it('generateStructuredData uses output_config.format and repairs once (append-only)', async () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
    const { client, calls } = fakeClient([
      message({ content: [thinking, { type: 'text', text: '{"name": 5}', citations: null }] as never }),
      message({ content: [{ type: 'text', text: '{"name": "Atrium"}', citations: null }] as never }),
    ]);
    const provider = new AnthropicProvider(config, { apiKey: 'k' }, client);
    const res = await provider.generateStructuredData({
      prompt: 'name it',
      schemaName: 'site',
      schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      parse: (v) => {
        const o = v as { name: unknown };
        if (typeof o.name !== 'string') throw new Error('name must be a string');
        return o as { name: string };
      },
    });
    expect(res.data).toEqual({ name: 'Atrium' });
    expect(res.usage.inputTokens).toBe(200);
    expect(calls[0]!.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } });
    // second call = original turn + echoed assistant (with thinking) + repair message
    expect(calls[1]!.messages).toHaveLength(3);
    expect((calls[1]!.messages[1]!.content as unknown[])[0]).toEqual(thinking);
    expect(JSON.stringify(calls[1]!.messages[2])).toContain('name must be a string');
    expect(calls[1]!.messages[0]).toEqual(calls[0]!.messages[0]);
  });

  it('stream yields text deltas then done', async () => {
    const { client } = fakeClient([message({ content: [{ type: 'text', text: 'Hello', citations: null }, { type: 'tool_use', id: 't', name: 'n', input: {} }] as never, stop_reason: 'tool_use' })]);
    const provider = new AnthropicProvider(config, { apiKey: 'k' }, client);
    const events = [];
    for await (const ev of provider.stream({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })) events.push(ev.type);
    expect(events).toEqual(['text', 'tool_call', 'done']);
  });

  it('estimates cost with cache pricing', () => {
    const provider = new AnthropicProvider(config, { apiKey: 'k' }, fakeClient([]).client);
    // 1M in ($4) + 1M out ($20) + 1M cache read ($0.20)
    expect(provider.estimateCost('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 })).toBeCloseTo(24.2, 5);
    expect(provider.estimateCost('claude-sonnet-5-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(2, 5);
  });

  it('test() uses the models endpoint', async () => {
    const provider = new AnthropicProvider(config, { apiKey: 'k' }, fakeClient([]).client);
    await expect(provider.test()).resolves.toMatchObject({ ok: true });
  });
});
