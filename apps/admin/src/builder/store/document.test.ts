import { findNode, jsonClone } from '@atrium/builder-core';
import type { Node, WebsiteDefinition } from '@atrium/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyDrop, copyNode, duplicateNode, groupNode, insertComponent, moveBy, pasteNodes, removeNode, setProp, setStyle, ungroupNode,
} from '../actions';
import { adoptServerDefinition } from '../persistence/adopt';
import { makeSite } from '../test/fixtures';
import { historyEntries, loadDocument, redo, resetDocumentStore, runOps, setErrorReporter, undo, useDocumentStore } from './document';
import { select, useSelectionStore } from './ui';

const def = () => useDocumentStore.getState().definition!;
const home = () => def().pages.find((p) => p.id === 'home')!;
const node = (id: string) => findNode(home().sections, id)?.node as Node;
const childIds = (id: string) => node(id).children!.map((c) => c.id);

const errors: string[] = [];
setErrorReporter((m) => errors.push(m));

beforeEach(() => {
  resetDocumentStore();
  loadDocument(makeSite(), 'home');
  select(null);
  errors.length = 0;
});

describe('document store actions', () => {
  it('inserts after the selection when the parent accepts it', () => {
    select('h1');
    const id = insertComponent('heading')!;
    expect(childIds('stack')).toEqual(['h1', id, 't1', 'b1']);
    expect(useSelectionStore.getState().selectedId).toBe(id);
  });

  it('places sections at the page root after the selected section', () => {
    select('h1');
    const id = insertComponent('hero')!;
    expect(home().sections.map((s) => s.id)).toEqual(['hero', 'sec', id]);
  });

  it('wraps elements in a section when there is no valid parent', () => {
    const id = insertComponent('heading')!;
    const last = home().sections[home().sections.length - 1]!;
    expect(last.type).toBe('section');
    expect(last.children?.[0]?.id).toBe(id);
  });

  it('moves via drop targets and keyboard moves', () => {
    applyDrop({ kind: 'move', nodeId: 'b1', type: 'button' }, { parentId: 'stack', index: 0, position: 'before', refId: 'h1', axis: 'vertical' });
    expect(childIds('stack')).toEqual(['b1', 'h1', 't1']);
    moveBy('t1', -1);
    expect(childIds('stack')).toEqual(['b1', 't1', 'h1']);
    moveBy('b1', 1);
    expect(childIds('stack')).toEqual(['t1', 'b1', 'h1']);
  });

  it('removes and duplicates nodes', () => {
    select('t1');
    removeNode('t1');
    expect(childIds('stack')).toEqual(['h1', 'b1']);
    expect(useSelectionStore.getState().selectedId).toBe('b1');
    duplicateNode('h1');
    const ids = childIds('stack');
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('h1');
    expect(ids[1]).not.toBe('h1');
    expect(node(ids[1]!).props.text).toBe('Hello');
  });

  it('applies styles per breakpoint with desktop-first cascade and reset', () => {
    setStyle('h1', 'fontSize', 'base', '40px');
    setStyle('h1', 'fontSize', 'mobile', '28px');
    expect(node('h1').style?.fontSize).toEqual({ base: '40px', mobile: '28px' });
    setStyle('h1', 'fontSize', 'mobile', undefined);
    expect(node('h1').style?.fontSize).toBe('40px');
    setStyle('h1', 'fontSize', 'base', '');
    expect(node('h1').style).toBeUndefined();
  });

  it('undo/redo restore exact states with labels', () => {
    const before = def();
    setProp('h1', 'text', 'Changed', { label: 'Edit heading' });
    expect(node('h1').props.text).toBe('Changed');
    expect(useDocumentStore.getState().undoLabel).toBe('Edit heading');
    expect(undo()).toBe('Edit heading');
    expect(node('h1').props.text).toBe('Hello');
    expect(def()).toEqual(before);
    expect(useDocumentStore.getState().redoLabel).toBe('Edit heading');
    redo();
    expect(node('h1').props.text).toBe('Changed');
    expect(useDocumentStore.getState().canRedo).toBe(false);
  });

  it('coalesces continuous edits with the same merge key into one undo step', () => {
    const n = historyEntries().length;
    setProp('h1', 'text', 'H');
    setProp('h1', 'text', 'He');
    setProp('h1', 'text', 'Hey');
    expect(historyEntries().length).toBe(n + 1);
    setProp('t1', 'text', 'Other');
    expect(historyEntries().length).toBe(n + 2);
    undo();
    undo();
    expect(node('h1').props.text).toBe('Hello');
  });

  it('keeps structural sharing: untouched pages and sections keep identity', () => {
    const about = def().pages[1];
    const hero = node('hero');
    setProp('h1', 'text', 'X');
    expect(def().pages[1]).toBe(about);
    expect(node('hero')).toBe(hero);
  });

  it('records a multi-operation AI change as ONE history entry', () => {
    const n = historyEntries().length;
    const res = runOps(
      'AI: refresh',
      [
        { op: 'setProp', pageId: 'home', nodeId: 'h1', path: 'text', value: 'AI heading' },
        { op: 'addNode', pageId: 'home', parentId: null, index: 0, node: { type: 'hero', props: { heading: 'New' } } },
        { op: 'updateTheme', patch: { colors: { primary: '#000000' } } },
      ],
      { source: 'ai' },
    );
    expect(res.ok).toBe(true);
    expect(historyEntries().length).toBe(n + 1);
    expect(historyEntries()[historyEntries().length - 1]!.source).toBe('ai');
    expect(home().sections).toHaveLength(3);
    undo();
    expect(home().sections).toHaveLength(2);
    expect(node('h1').props.text).toBe('Hello');
    expect(def().theme.colors.primary).not.toBe('#000000');
  });

  it('rejects invalid operations atomically without a history entry', () => {
    const n = historyEntries().length;
    const before = def();
    const res = runOps('bad', [
      { op: 'setProp', pageId: 'home', nodeId: 'h1', path: 'text', value: 'ok' },
      { op: 'addNode', pageId: 'home', parentId: null, node: { type: 'heading', props: {} } },
    ]);
    expect(res.ok).toBe(false);
    expect(errors.length).toBe(1);
    expect(def()).toBe(before);
    expect(historyEntries().length).toBe(n);
  });

  it('adopts an authoritative server definition as one undoable AI entry', () => {
    const server: WebsiteDefinition = jsonClone(def());
    server.theme.colors.primary = '#123456';
    server.pages[0]!.sections[0]!.props.heading = 'From server';
    const aboutBefore = def().pages[1];
    const n = historyEntries().length;
    expect(adoptServerDefinition(server, 'AI: apply')).toBe(true);
    expect(historyEntries().length).toBe(n + 1);
    expect(def().theme.colors.primary).toBe('#123456');
    expect(node('hero').props.heading).toBe('From server');
    expect(def().pages[1]).toBe(aboutBefore); // unchanged page keeps identity → not re-saved
    undo();
    expect(node('hero').props.heading).toBe('Welcome');
  });

  it('groups and ungroups', () => {
    groupNode('t1');
    const wrapperId = useSelectionStore.getState().selectedId!;
    expect(node(wrapperId).type).toBe('container');
    expect(childIds(wrapperId)).toEqual(['t1']);
    expect(childIds('stack')).toEqual(['h1', wrapperId, 'b1']);
    ungroupNode(wrapperId);
    expect(childIds('stack')).toEqual(['h1', 't1', 'b1']);
  });

  it('copy/paste inserts a re-identified copy after the selection', () => {
    copyNode('h1');
    select('t1');
    expect(pasteNodes()).toBe(true);
    const ids = childIds('stack');
    expect(ids).toHaveLength(4);
    expect(ids[2]).not.toBe('h1');
    expect(node(ids[2]!).props.text).toBe('Hello');
  });
});
