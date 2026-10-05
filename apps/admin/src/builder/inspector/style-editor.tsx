'use client';

import { registry, type StyleKey } from '@atrium/component-registry';
import { SPACE_STEPS } from '@atrium/design-tokens';
import type { BackgroundImage, Breakpoint, Node, Responsive, WebsiteDefinition } from '@atrium/schema';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ImageIcon, Link2, Link2Off, RotateCcw, Trash2,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { setStyle, setStyleObject } from '../actions';
import { BREAKPOINT_LABEL } from '../lib/devices';
import { cn } from '../lib/cn';
import { formatBox, inheritedValue, overriddenBreakpoints, ownValue, parseBox } from '../lib/responsive';
import { findInDef } from '../lib/tree';
import { useDocumentStore } from '../store/document';
import { requestMedia, useBreakpoint } from '../store/ui';
import { Btn, CommitInput, Group, NativeSelect, NumberInput, RangeSlider, Row, Segmented, Tip } from '../ui/primitives';
import { ColorField } from './controls/color';

type StyleRecord = Record<string, unknown>;

export interface StyleGroupDef {
  id: string;
  title: string;
  tab: 'style' | 'layout';
  keys: StyleKey[];
}

export const STYLE_GROUPS: StyleGroupDef[] = [
  { id: 'spacing', title: 'Spacing', tab: 'layout', keys: ['padding', 'margin', 'gap'] },
  { id: 'size', title: 'Size', tab: 'layout', keys: ['width', 'maxWidth', 'height', 'minHeight', 'aspectRatio'] },
  { id: 'flex', title: 'Layout', tab: 'layout', keys: ['display', 'flexDirection', 'flexWrap', 'alignItems', 'justifyContent', 'gridColumns', 'order'] },
  { id: 'position', title: 'Position', tab: 'layout', keys: ['position', 'inset', 'zIndex', 'overflow'] },
  { id: 'typography', title: 'Typography', tab: 'style', keys: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'color'] },
  { id: 'background', title: 'Background', tab: 'style', keys: ['background', 'backgroundImage', 'opacity'] },
  { id: 'border', title: 'Border & effects', tab: 'style', keys: ['border', 'borderRadius', 'boxShadow'] },
];

export const ALL_STYLE_KEYS = STYLE_GROUPS.flatMap((g) => g.keys);

const SPACE_TOKENS = SPACE_STEPS.filter((s) => s > 0).map((s) => `@space.${s}`);
const LABELS: Partial<Record<StyleKey, string>> = {
  maxWidth: 'Max width', minHeight: 'Min height', aspectRatio: 'Aspect', flexDirection: 'Direction', flexWrap: 'Wrap', alignItems: 'Align',
  justifyContent: 'Justify', gridColumns: 'Columns', textAlign: 'Align', fontFamily: 'Font', fontSize: 'Size', fontWeight: 'Weight',
  lineHeight: 'Line height', letterSpacing: 'Tracking', textTransform: 'Case', borderRadius: 'Radius', boxShadow: 'Shadow', zIndex: 'Z-index',
  backgroundImage: 'Image',
};
const label = (k: StyleKey) => LABELS[k] ?? k[0]!.toUpperCase() + k.slice(1);

/** Dot that shows where a responsive value comes from; click resets an override. */
function OverrideDot({ value, bp, onReset }: { value: Responsive<unknown> | undefined; bp: Breakpoint; onReset: () => void }) {
  const own = ownValue(value, bp);
  const inherited = inheritedValue(value, bp);
  const others = overriddenBreakpoints(value).filter((b) => b !== bp);
  if (own === undefined) {
    if (inherited === undefined && !others.length) return null;
    return (
      <Tip content={inherited !== undefined ? `Inherited from a larger breakpoint${others.length ? ` · overridden on ${others.map((b) => BREAKPOINT_LABEL[b]).join(', ')}` : ''}` : `Overridden on ${others.map((b) => BREAKPOINT_LABEL[b]).join(', ')}`}>
        <span className="size-1.5 shrink-0 rounded-full border border-fg-subtle" />
      </Tip>
    );
  }
  return (
    <Tip content={bp === 'base' ? 'Set for all devices — click to clear' : `Overridden on ${BREAKPOINT_LABEL[bp]} — click to reset to inherited`}>
      <button type="button" onClick={onReset} className={cn('group flex size-3.5 shrink-0 items-center justify-center rounded-full', bp === 'base' ? 'text-fg-muted' : 'text-accent')} aria-label="Reset value">
        <span className="size-1.5 rounded-full bg-current group-hover:hidden" />
        <RotateCcw className="hidden size-3 group-hover:block" />
      </button>
    </Tip>
  );
}

function TokenInput({ value, placeholder, onCommit, tokens, disabled, listId }: { value: string | undefined; placeholder?: string; onCommit: (v: string | undefined) => void; tokens?: string[]; disabled?: boolean; listId?: string }) {
  return (
    <>
      <CommitInput value={value ?? ''} placeholder={placeholder} disabled={disabled} list={tokens ? listId : undefined} mono onCommit={(v) => onCommit(v.trim() || undefined)} />
      {tokens && listId && (
        <datalist id={listId}>
          {tokens.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
    </>
  );
}

const A = (value: string, icon?: ReactNode) => ({ label: icon ?? value, value });

interface KeyEditorProps {
  k: StyleKey;
  value: unknown;
  placeholder: unknown;
  set: (v: unknown, opts?: { mergeKey?: string }) => void;
  disabled?: boolean;
  nodeId: string;
}

function KeyEditor({ k, value, placeholder, set, disabled, nodeId }: KeyEditorProps) {
  const str = value === undefined ? undefined : String(value);
  const ph = placeholder === undefined ? undefined : String(placeholder);
  switch (k) {
    case 'gap':
    case 'width':
    case 'height':
    case 'minHeight':
    case 'inset':
    case 'letterSpacing':
    case 'lineHeight':
      return <TokenInput value={str} placeholder={ph ?? (k === 'lineHeight' ? '1.5' : 'auto')} onCommit={set} disabled={disabled} tokens={k === 'gap' ? SPACE_TOKENS : k === 'letterSpacing' ? ['-0.02em', '0', '0.05em', '0.12em', '0.2em'] : k === 'lineHeight' ? ['1', '1.1', '1.25', '1.5', '1.7'] : ['100%', 'auto', '50vh', '100vh', 'fit-content']} listId={`dl-${k}`} />;
    case 'maxWidth':
      return <TokenInput value={str} placeholder={ph ?? 'none'} onCommit={set} disabled={disabled} tokens={['@container.narrow', '@container.default', '@container.wide', '100%', '40ch', '65ch']} listId="dl-maxWidth" />;
    case 'fontSize':
      return <TokenInput value={str} placeholder={ph ?? 'inherit'} onCommit={set} disabled={disabled} tokens={['@text.xs', '@text.sm', '@text.base', '@text.lg', '@text.xl', '@text.2xl', '@text.3xl', '@text.4xl', '@text.5xl', '@text.6xl']} listId="dl-fontSize" />;
    case 'aspectRatio':
      return <NativeSelect value={str} placeholder={ph ? `Inherited (${ph})` : 'Auto'} disabled={disabled} onChange={(v) => set(v || undefined)} options={['1/1', '4/3', '3/2', '16/9', '21/9', '3/4', '2/3', '9/16'].map((v) => ({ label: v, value: v }))} />;
    case 'display':
      return <NativeSelect value={str} placeholder={ph ? `Inherited (${ph})` : 'Default'} disabled={disabled} onChange={(v) => set(v || undefined)} options={['block', 'flex', 'inline-flex', 'grid', 'none'].map((v) => ({ label: v, value: v }))} />;
    case 'flexDirection':
      return <Segmented value={str ?? ph} disabled={disabled} onChange={(v) => set(v)} options={[A('row', <ArrowRight className="size-3.5" />), A('column', <ArrowDown className="size-3.5" />), A('row-reverse', <ArrowLeft className="size-3.5" />), A('column-reverse', <ArrowUp className="size-3.5" />)]} />;
    case 'flexWrap':
      return <Segmented value={str ?? ph} disabled={disabled} onChange={(v) => set(v)} options={[A('nowrap'), A('wrap')]} />;
    case 'alignItems':
      return <NativeSelect value={str} placeholder={ph ? `Inherited (${ph})` : 'Default'} disabled={disabled} onChange={(v) => set(v || undefined)} options={['start', 'center', 'end', 'stretch', 'baseline'].map((v) => ({ label: v, value: v }))} />;
    case 'justifyContent':
      return <NativeSelect value={str} placeholder={ph ? `Inherited (${ph})` : 'Default'} disabled={disabled} onChange={(v) => set(v || undefined)} options={['start', 'center', 'end', 'between', 'around', 'evenly'].map((v) => ({ label: v, value: v }))} />;
    case 'gridColumns':
    case 'order':
    case 'zIndex':
      return <NumberInput value={typeof value === 'number' ? value : undefined} placeholder={ph} min={k === 'gridColumns' ? 1 : undefined} max={k === 'gridColumns' ? 12 : undefined} disabled={disabled} onCommit={(n) => set(n === undefined ? undefined : Math.round(n))} />;
    case 'textAlign':
      return <Segmented value={str ?? ph} disabled={disabled} onChange={(v) => set(v)} options={[A('left', <AlignLeft className="size-3.5" />), A('center', <AlignCenter className="size-3.5" />), A('right', <AlignRight className="size-3.5" />), A('justify', <AlignJustify className="size-3.5" />)]} />;
    case 'textTransform':
      return <Segmented value={str ?? ph} disabled={disabled} onChange={(v) => set(v)} options={[{ label: '—', value: 'none', title: 'None' }, { label: 'AA', value: 'uppercase', title: 'Uppercase' }, { label: 'aa', value: 'lowercase', title: 'Lowercase' }, { label: 'Aa', value: 'capitalize', title: 'Capitalize' }]} />;
    case 'fontFamily':
      return (
        <NativeSelect
          value={str}
          placeholder={ph ? `Inherited (${ph})` : 'Inherit'}
          disabled={disabled}
          onChange={(v) => set(v || undefined)}
          options={[{ label: 'Heading font', value: 'heading' }, { label: 'Body font', value: 'body' }, { label: 'Accent font', value: 'accent' }, ...(str && !['heading', 'body', 'accent'].includes(str) ? [{ label: str, value: str }] : [])]}
        />
      );
    case 'fontWeight':
      return <NativeSelect value={str} placeholder={ph ? `Inherited (${ph})` : 'Inherit'} disabled={disabled} onChange={(v) => set(v ? Number(v) : undefined)} options={[300, 400, 500, 600, 700, 800, 900].map((w) => ({ label: `${w}${w === 400 ? ' · Regular' : w === 700 ? ' · Bold' : ''}`, value: String(w) }))} />;
    case 'color':
    case 'background':
      return <ColorField value={str} placeholder={ph} disabled={disabled} onChange={(v, o) => set(v, o ? { mergeKey: `style:${nodeId}:${k}:drag` } : undefined)} />;
    case 'opacity': {
      const n = typeof value === 'number' ? value : typeof placeholder === 'number' ? placeholder : 1;
      return (
        <div className="flex items-center gap-2">
          <RangeSlider value={n} min={0} max={1} step={0.05} disabled={disabled} onChange={(v) => set(v, { mergeKey: `style:${nodeId}:opacity` })} />
          <span className="w-8 text-right font-mono text-[11px] text-fg-muted">{Math.round(n * 100)}%</span>
        </div>
      );
    }
    case 'borderRadius':
      return <TokenInput value={str} placeholder={ph ?? '0'} onCommit={set} disabled={disabled} tokens={['@radius.none', '@radius.sm', '@radius.md', '@radius.lg', '@radius.xl', '@radius.full']} listId="dl-radius" />;
    case 'boxShadow':
      return <NativeSelect value={str} placeholder={ph ? `Inherited (${ph})` : 'None'} disabled={disabled} onChange={(v) => set(v || undefined)} options={[{ label: 'None', value: 'none' }, { label: 'Small', value: '@shadow.sm' }, { label: 'Medium', value: '@shadow.md' }, { label: 'Large', value: '@shadow.lg' }, ...(str && !str.startsWith('@shadow') && str !== 'none' ? [{ label: 'Custom', value: str }] : [])]} />;
    case 'border':
      return <TokenInput value={str} placeholder={ph ?? '1px solid @color.border'} onCommit={set} disabled={disabled} tokens={['1px solid @color.border', '1px solid @color.text', '2px solid @color.primary', 'none']} listId="dl-border" />;
    case 'position':
      return <NativeSelect value={str} placeholder={ph ? `Inherited (${ph})` : 'static'} disabled={disabled} onChange={(v) => set(v || undefined)} options={['static', 'relative', 'absolute', 'sticky', 'fixed'].map((v) => ({ label: v, value: v }))} />;
    case 'overflow':
      return <NativeSelect value={str} placeholder={ph ? `Inherited (${ph})` : 'visible'} disabled={disabled} onChange={(v) => set(v || undefined)} options={['visible', 'hidden', 'clip', 'auto'].map((v) => ({ label: v, value: v }))} />;
    default:
      return <TokenInput value={str} placeholder={ph} onCommit={set} disabled={disabled} />;
  }
}

/** One responsive style property; edits apply to the active breakpoint. */
function StyleRow({ node, k, disabled }: { node: Node; k: StyleKey; disabled?: boolean }) {
  const bp = useBreakpoint();
  const value = (node.style as StyleRecord | undefined)?.[k] as Responsive<unknown> | undefined;
  const own = ownValue(value, bp);
  const inherited = inheritedValue(value, bp);
  const set = (v: unknown, opts?: { mergeKey?: string }) => setStyle(node.id, k, bp, v, opts);
  const reset = () => setStyle(node.id, k, bp, undefined);
  return (
    <Row label={label(k)} indicator={<OverrideDot value={value} bp={bp} onReset={reset} />}>
      <KeyEditor k={k} value={own} placeholder={inherited} set={set} disabled={disabled} nodeId={node.id} />
    </Row>
  );
}

/** Webflow-style box model editor for margin (outer) and padding (inner). */
function BoxModel({ node, keys, disabled }: { node: Node; keys: StyleKey[]; disabled?: boolean }) {
  const bp = useBreakpoint();
  const style = (node.style ?? {}) as StyleRecord;
  const showMargin = keys.includes('margin');
  const showPadding = keys.includes('padding');
  const [linked, setLinked] = useState(false);
  const sides = (k: 'margin' | 'padding') => {
    const v = style[k] as Responsive<string> | undefined;
    return { own: parseBox(ownValue(v, bp)), inherited: parseBox(inheritedValue(v, bp)), raw: v };
  };
  const commit = (k: 'margin' | 'padding', idx: number, val: string) => {
    const { own, inherited } = sides(k);
    const base = own.some(Boolean) ? own : inherited;
    const next = linked ? ([val, val, val, val] as [string, string, string, string]) : (base.map((s, i) => (i === idx ? val : s)) as [string, string, string, string]);
    setStyle(node.id, k, bp, formatBox(next));
  };
  const cell = (k: 'margin' | 'padding', idx: number) => {
    const { own, inherited } = sides(k);
    return (
      <input
        key={`${k}-${idx}-${own[idx]}-${bp}`}
        defaultValue={own[idx]}
        placeholder={inherited[idx] || '0'}
        list="dl-space"
        disabled={disabled}
        aria-label={`${k} ${['top', 'right', 'bottom', 'left'][idx]}`}
        onBlur={(e) => e.target.value !== own[idx] && commit(k, idx, e.target.value.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="h-5 w-12 rounded bg-transparent text-center font-mono text-[11px] text-fg outline-none placeholder:text-fg-subtle hover:bg-surface focus:bg-surface focus:ring-1 focus:ring-accent"
      />
    );
  };
  const m = sides('margin');
  const p = sides('padding');
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          {showMargin && (
            <span className="flex items-center gap-1">
              Margin <OverrideDot value={m.raw} bp={bp} onReset={() => setStyle(node.id, 'margin', bp, undefined)} />
            </span>
          )}
          {showPadding && (
            <span className="flex items-center gap-1">
              Padding <OverrideDot value={p.raw} bp={bp} onReset={() => setStyle(node.id, 'padding', bp, undefined)} />
            </span>
          )}
        </div>
        <Tip content={linked ? 'Editing all sides together' : 'Edit all sides together'}>
          <button type="button" onClick={() => setLinked((l) => !l)} className={cn('rounded p-1 text-fg-subtle hover:bg-surface-2', linked && 'text-accent')} aria-label="Link sides">
            {linked ? <Link2 className="size-3.5" /> : <Link2Off className="size-3.5" />}
          </button>
        </Tip>
      </div>
      <datalist id="dl-space">
        {['0', ...SPACE_TOKENS, 'auto'].map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className={cn('relative rounded-md border border-dashed border-border-strong bg-surface-2 p-1', !showMargin && 'border-transparent bg-transparent')}>
        {showMargin && (
          <>
            <span className="absolute left-1.5 top-0.5 text-[10px] uppercase tracking-wide text-fg-subtle">margin</span>
            <div className="flex justify-center">{cell('margin', 0)}</div>
          </>
        )}
        <div className="flex items-center gap-1">
          {showMargin && cell('margin', 3)}
          <div className={cn('relative flex-1 rounded border border-border bg-surface px-1 py-0.5', !showPadding && 'flex h-16 items-center justify-center')}>
            {showPadding ? (
              <>
                <span className="absolute left-1.5 top-0.5 text-[10px] uppercase tracking-wide text-fg-subtle">padding</span>
                <div className="flex justify-center">{cell('padding', 0)}</div>
                <div className="flex items-center justify-between">
                  {cell('padding', 3)}
                  <span className="h-4 w-8 rounded-sm bg-surface-3" />
                  {cell('padding', 1)}
                </div>
                <div className="flex justify-center">{cell('padding', 2)}</div>
              </>
            ) : (
              <span className="h-4 w-8 rounded-sm bg-surface-3" />
            )}
          </div>
          {showMargin && cell('margin', 1)}
        </div>
        {showMargin && <div className="flex justify-center">{cell('margin', 2)}</div>}
      </div>
    </div>
  );
}

/** Background image is a single object (not responsive). */
function BackgroundImageEditor({ node, disabled }: { node: Node; disabled?: boolean }) {
  const bg = (node.style as StyleRecord | undefined)?.backgroundImage as BackgroundImage | undefined;
  const set = (patch: Partial<BackgroundImage> | null) => setStyleObject(node.id, 'backgroundImage', patch === null ? undefined : { ...(bg ?? { src: '' }), ...patch });
  const pick = () => requestMedia({ kind: 'image', onSelect: ([m]) => m && set({ src: m.url, mediaId: m.id }) });
  if (!bg?.src) {
    return (
      <Row label="Image">
        <Btn size="sm" variant="secondary" className="w-full" disabled={disabled} onClick={pick} icon={<ImageIcon className="size-3.5" />}>
          Choose image
        </Btn>
      </Row>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative h-20 overflow-hidden rounded-md border border-border bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bg.src} alt="" className="size-full object-cover" style={{ objectPosition: bg.position }} />
        {bg.overlay && <div className="absolute inset-0" style={{ background: bg.overlay, opacity: bg.overlayOpacity ?? 0.4 }} />}
        <div className="absolute bottom-1 right-1 flex gap-1">
          <Btn size="xs" variant="secondary" disabled={disabled} onClick={pick}>Replace</Btn>
          <Btn size="xs" variant="secondary" disabled={disabled} onClick={() => set(null)} aria-label="Remove image" icon={<Trash2 className="size-3" />} />
        </div>
      </div>
      <Row label="Fit">
        <Segmented value={bg.size ?? 'cover'} disabled={disabled} onChange={(size) => set({ size: size as BackgroundImage['size'] })} options={[A('cover'), A('contain'), A('auto')]} />
      </Row>
      <Row label="Position">
        <NativeSelect value={bg.position ?? 'center'} disabled={disabled} onChange={(position) => set({ position })} options={['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'].map((v) => ({ label: v, value: v }))} />
      </Row>
      <Row label="Scroll">
        <Segmented value={bg.attachment ?? 'scroll'} disabled={disabled} onChange={(attachment) => set({ attachment: attachment as BackgroundImage['attachment'] })} options={[A('scroll'), { label: 'fixed', value: 'fixed', title: 'Parallax (fixed)' }]} />
      </Row>
      <Row label="Overlay">
        <ColorField value={bg.overlay} disabled={disabled} onChange={(overlay) => set({ overlay })} placeholder="None" />
      </Row>
      {bg.overlay && (
        <Row label="Overlay opacity">
          <RangeSlider value={bg.overlayOpacity ?? 0.4} min={0} max={1} step={0.05} disabled={disabled} onChange={(overlayOpacity) => set({ overlayOpacity })} />
        </Row>
      )}
    </div>
  );
}

/** Generic, registry-driven StyleProps editor for one inspector tab. */
export function StyleEditor({ nodeId, tab, disabled }: { nodeId: string; tab: 'style' | 'layout'; disabled?: boolean }) {
  const node = useDocumentStore((s) => {
    const def = s.definition;
    if (!def) return null;
    return findNodeCached(def, s.pageId, nodeId);
  });
  const [showAll, setShowAll] = useState(false);
  const bp = useBreakpoint();
  const keys = useStyleKeys(node?.type);
  if (!node) return null;
  const allowed = new Set<StyleKey>(showAll ? ALL_STYLE_KEYS : keys);
  const groups = STYLE_GROUPS.filter((g) => g.tab === tab).map((g) => ({ ...g, keys: g.keys.filter((k) => allowed.has(k)) })).filter((g) => g.keys.length);
  const hidden = ALL_STYLE_KEYS.filter((k) => !keys.includes(k) && STYLE_GROUPS.find((g) => g.keys.includes(k))!.tab === tab).length;

  return (
    <>
      {bp !== 'base' && (
        <div className="border-b border-border bg-accent-soft/60 px-3 py-1.5 text-[11px] text-accent">
          Editing <b>{BREAKPOINT_LABEL[bp]}</b> overrides — values cascade from larger breakpoints.
        </div>
      )}
      {groups.map((g) => (
        <Group key={g.id} id={`style-${g.id}`} title={g.title}>
          {g.id === 'spacing' && (g.keys.includes('padding') || g.keys.includes('margin')) && <BoxModel node={node} keys={g.keys} disabled={disabled} />}
          {g.keys
            .filter((k) => !(g.id === 'spacing' && (k === 'padding' || k === 'margin')))
            .map((k) => (k === 'backgroundImage' ? <BackgroundImageEditor key={k} node={node} disabled={disabled} /> : <StyleRow key={k} node={node} k={k} disabled={disabled} />))}
        </Group>
      ))}
      {!groups.length && <p className="px-3 py-4 text-xs text-fg-muted">This component has no {tab} properties.</p>}
      {hidden > 0 && (
        <div className="px-3 py-2">
          <Btn size="xs" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show recommended properties only' : `Show all properties (${hidden} more)`}
          </Btn>
        </div>
      )}
    </>
  );
}


function useStyleKeys(type: string | undefined): StyleKey[] {
  return useMemo(() => (type ? registry.styleKeys(type) : []), [type]);
}

function findNodeCached(def: WebsiteDefinition, pageId: string | null, id: string): Node | null {
  return findInDef(def, pageId, id);
}
