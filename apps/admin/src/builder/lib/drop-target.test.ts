import { registry } from '@atrium/component-registry';
import { describe, expect, it } from 'vitest';
import { isNoopMove, resolveDropTarget, type DropCandidate } from './drop-target';
import { makeAccepts } from './rules';
import { projectTreeDrop, toMoveIndex } from './tree-projection';

const accepts = makeAccepts(registry);
const rect = (top: number, height: number, left = 0, width = 1000) => ({ top, left, width, height });

// Mock hit-test results for the fixture tree: hero | section › stack › [heading, text, button]
const hero: DropCandidate = { id: 'hero', type: 'hero', parentId: null, parentType: null, index: 0, childCount: 0, rect: rect(0, 600), axis: 'vertical' };
const section: DropCandidate = { id: 'sec', type: 'section', parentId: null, parentType: null, index: 1, childCount: 1, rect: rect(600, 400), axis: 'vertical' };
const stack: DropCandidate = { id: 'stack', type: 'stack', parentId: 'sec', parentType: 'section', index: 0, childCount: 3, rect: rect(650, 300), axis: 'vertical' };
const heading: DropCandidate = { id: 'h1', type: 'heading', parentId: 'stack', parentType: 'stack', index: 0, childCount: 0, rect: rect(660, 60), axis: 'vertical' };

describe('resolveDropTarget', () => {
  it('places a section before/after a root section by nearest edge', () => {
    expect(resolveDropTarget({ candidates: [hero], pointer: { x: 10, y: 100 }, payload: { type: 'hero' }, accepts })).toMatchObject({ parentId: null, index: 0, position: 'before', refId: 'hero' });
    expect(resolveDropTarget({ candidates: [hero], pointer: { x: 10, y: 500 }, payload: { type: 'hero' }, accepts })).toMatchObject({ parentId: null, index: 1, position: 'after' });
  });

  it('walks up to the page root for sections dropped over nested elements', () => {
    const t = resolveDropTarget({ candidates: [heading, stack, section], pointer: { x: 10, y: 690 }, payload: { type: 'hero' }, accepts });
    expect(t).toMatchObject({ parentId: null, refId: 'sec', position: 'before', index: 1 });
  });

  it('places an element before/after a sibling element', () => {
    expect(resolveDropTarget({ candidates: [heading, stack, section], pointer: { x: 10, y: 665 }, payload: { type: 'text' }, accepts })).toMatchObject({ parentId: 'stack', index: 0, position: 'before' });
    expect(resolveDropTarget({ candidates: [heading, stack, section], pointer: { x: 10, y: 715 }, payload: { type: 'text' }, accepts })).toMatchObject({ parentId: 'stack', index: 1, position: 'after' });
  });

  it('uses left/right edges in horizontal layouts', () => {
    const a: DropCandidate = { ...heading, rect: rect(660, 60, 0, 200), axis: 'horizontal' };
    expect(resolveDropTarget({ candidates: [a, stack], pointer: { x: 180, y: 665 }, payload: { type: 'button' }, accepts })).toMatchObject({ position: 'after', index: 1, axis: 'horizontal' });
  });

  it('drops inside an empty container', () => {
    const empty: DropCandidate = { ...section, childCount: 0 };
    expect(resolveDropTarget({ candidates: [empty], pointer: { x: 10, y: 610 }, payload: { type: 'heading' }, accepts })).toMatchObject({ parentId: 'sec', index: 0, position: 'inside' });
  });

  it('drops inside a container when the pointer is in its middle band', () => {
    expect(resolveDropTarget({ candidates: [stack, section], pointer: { x: 10, y: 800 }, payload: { type: 'heading' }, accepts })).toMatchObject({ parentId: 'stack', index: 3, position: 'inside' });
  });

  it('rejects elements at the page root and inside leaf components', () => {
    // hero has no children; root accepts only sections → nothing valid
    expect(resolveDropTarget({ candidates: [hero], pointer: { x: 10, y: 300 }, payload: { type: 'heading' }, accepts })).toBeNull();
  });

  it('prefers an empty drop zone', () => {
    expect(resolveDropTarget({ candidates: [], zone: { parentId: 'sec', parentType: 'section' }, pointer: { x: 0, y: 0 }, payload: { type: 'text' }, accepts })).toMatchObject({ parentId: 'sec', position: 'inside', index: 0 });
    expect(resolveDropTarget({ candidates: [], zone: { parentId: 'sec', parentType: 'section' }, pointer: { x: 0, y: 0 }, payload: { type: 'hero' }, accepts })).toBeNull();
  });

  it('never drops a moving node into itself or its descendants', () => {
    const t = resolveDropTarget({
      candidates: [heading, stack, section],
      pointer: { x: 10, y: 690 },
      payload: { type: 'stack', movingId: 'stack' },
      accepts,
      isWithinMoving: (id) => id === 'stack' || id === 'h1',
    });
    // skips heading + stack, lands relative to the section (stack cannot sit at root → inside section)
    expect(t).toMatchObject({ parentId: 'sec', position: 'inside' });
  });

  it('skips locked candidates', () => {
    const t = resolveDropTarget({ candidates: [{ ...heading, locked: true }, stack], pointer: { x: 10, y: 665 }, payload: { type: 'text' }, accepts });
    // the heading is skipped; the pointer is near the stack's top edge → before the stack
    expect(t).toMatchObject({ parentId: 'sec', position: 'before', refId: 'stack' });
  });

  it('detects no-op moves', () => {
    expect(isNoopMove({ parentId: 'stack', index: 1, position: 'after', refId: 'h1', axis: 'vertical' }, { parentId: 'stack', index: 0 })).toBe(true);
    expect(isNoopMove({ parentId: 'stack', index: 3, position: 'after', refId: 'b1', axis: 'vertical' }, { parentId: 'stack', index: 0 })).toBe(false);
  });
});

describe('layers tree projection', () => {
  const rows = [
    { id: 'hero', type: 'hero', depth: 0, parentId: null },
    { id: 'sec', type: 'section', depth: 0, parentId: null },
    { id: 'stack', type: 'stack', depth: 1, parentId: 'sec' },
    { id: 'h1', type: 'heading', depth: 2, parentId: 'stack' },
    { id: 't1', type: 'text', depth: 2, parentId: 'stack' },
  ];
  const hasChildren = (t: string) => !!registry.get(t)?.children;

  it('reorders among siblings', () => {
    const p = projectTreeDrop(rows, 't1', 'h1', 0, 14, accepts, hasChildren)!;
    expect(p).toMatchObject({ parentId: 'stack', index: 0, valid: true });
    expect(toMoveIndex(p, { parentId: 'stack', index: 1 })).toBe(0);
  });

  it('outdents with negative offset and validates registry rules', () => {
    // dragging text left two levels would put it at page root → invalid
    const p = projectTreeDrop(rows, 't1', 't1', -28, 14, accepts, hasChildren)!;
    expect(p.depth).toBe(0);
    expect(p.valid).toBe(false);
    const q = projectTreeDrop(rows, 't1', 't1', -14, 14, accepts, hasChildren)!;
    expect(q).toMatchObject({ depth: 1, parentId: 'sec', valid: true, index: 1 });
  });

  it('converts post-move positions to moveNode indices', () => {
    expect(toMoveIndex({ parentId: 'p', index: 2 }, { parentId: 'p', index: 0 })).toBe(3);
    expect(toMoveIndex({ parentId: 'q', index: 2 }, { parentId: 'p', index: 0 })).toBe(2);
  });
});
