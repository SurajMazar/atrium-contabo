import { walkNodes, type Node } from '@atrium/schema';
import { describe, expect, it } from 'vitest';
import { internalClipboard, parseClipboard, serializeNodes } from './clipboard';

const tree: Node = {
  id: 'sec',
  type: 'section',
  anchor: 'about',
  props: { tone: 'surface' },
  children: [{ id: 'stack', type: 'stack', props: {}, children: [{ id: 'h', type: 'heading', props: { text: 'Hi' }, anchor: 'hi' }] }],
};

const ids = (nodes: Node[]) => {
  const out: string[] = [];
  walkNodes(nodes, (n) => void out.push(n.id));
  return out;
};

describe('clipboard', () => {
  it('round-trips nodes with fresh ids for every descendant', () => {
    const pasted = parseClipboard(serializeNodes([tree]))!;
    expect(pasted).toHaveLength(1);
    const before = ids([tree]);
    const after = ids(pasted);
    expect(after).toHaveLength(before.length);
    for (const id of after) expect(before).not.toContain(id);
    expect(new Set(after).size).toBe(after.length);
    expect(pasted[0]!.props).toEqual({ tone: 'surface' });
    expect(pasted[0]!.children![0]!.children![0]!.props).toEqual({ text: 'Hi' });
  });

  it('strips anchors so pasted copies do not duplicate HTML ids', () => {
    const pasted = parseClipboard(serializeNodes([tree]))!;
    walkNodes(pasted, (n) => void expect(n.anchor).toBeUndefined());
  });

  it('pasting twice yields distinct ids', () => {
    const text = serializeNodes([tree]);
    const a = ids(parseClipboard(text)!);
    const b = ids(parseClipboard(text)!);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  it('ignores non-Atrium clipboard content', () => {
    expect(parseClipboard('hello')).toBeNull();
    expect(parseClipboard('{"foo":1}')).toBeNull();
    expect(parseClipboard('{"atrium":"nodes","version":1,"nodes":[{"props":{}}]}')).toBeNull();
    expect(parseClipboard('{not json')).toBeNull();
    expect(parseClipboard(undefined)).toBeNull();
  });

  it('internal clipboard re-ids on every read', () => {
    internalClipboard.write([tree]);
    const a = internalClipboard.read()!;
    const b = internalClipboard.read()!;
    expect(a[0]!.id).not.toBe(b[0]!.id);
    expect(a[0]!.id).not.toBe('sec');
  });
});
