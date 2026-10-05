import { Fragment, createElement, type ReactNode } from 'react';
import type { RenderContext } from '../types';

export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}

/** Merge renderer classes into the NodeView-provided root attributes. */
export function root(attrs: Record<string, unknown>, ...classes: Array<string | false | null | undefined>): Record<string, any> {
  return { ...attrs, className: cx(attrs.className as string | undefined, ...classes) };
}

/** `data-edit-prop` marker for inline editing (editor mode only). */
export function editProp(ctx: Pick<RenderContext, 'mode'>, name: string): Record<string, string> {
  return ctx.mode === 'editor' ? { 'data-edit-prop': name } : {};
}

/** Choreography hook for editorial/cinematic presets. */
export const part = { 'data-a-part': '' } as const;

const EMPHASIS = /\*([^*\n]+)\*/g;

/** Inline text with `*emphasis*` → <em> and single newlines → <br>. */
export function Rich({ text }: { text?: string | null }): ReactNode {
  if (!text) return null;
  const out: ReactNode[] = [];
  const lines = String(text).split('\n');
  lines.forEach((line, li) => {
    let last = 0;
    let m: RegExpExecArray | null;
    EMPHASIS.lastIndex = 0;
    let i = 0;
    while ((m = EMPHASIS.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index));
      out.push(<em key={`e${li}-${i++}`}>{m[1]}</em>);
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push(line.slice(last));
    if (li < lines.length - 1) out.push(<br key={`b${li}`} />);
  });
  return <>{out.map((n, i) => (typeof n === 'string' ? <Fragment key={`t${i}`}>{n}</Fragment> : n))}</>;
}

/** Plain text without emphasis markers (for alt/aria/meta). */
export function plain(text?: string | null): string {
  return (text ?? '').replace(EMPHASIS, '$1').replace(/\s+/g, ' ').trim();
}

/** Body copy: blank lines separate paragraphs. */
export function Paragraphs({ text, className, editName, ctx }: { text?: string | null; className?: string; editName?: string; ctx?: Pick<RenderContext, 'mode'> }): ReactNode {
  if (!text) return null;
  const paras = String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const edit = editName && ctx ? editProp(ctx, editName) : {};
  if (paras.length === 1) return <p className={className} {...edit}><Rich text={paras[0]} /></p>;
  return (
    <div className={cx('a-prose', className)} {...edit}>
      {paras.map((p, i) => <p key={i}><Rich text={p} /></p>)}
    </div>
  );
}

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'div';

export function Heading({ as = 'h2', text, className, size, ...rest }: { as?: HeadingTag; text?: string | null; className?: string; size?: string } & Record<string, unknown>): ReactNode {
  if (!text) return null;
  return createElement(as, { className: cx('a-heading', size && `a-heading--${size}`, className), ...rest }, <Rich text={text} />);
}

/** Next heading level down (h2 → h3), capped at h6. */
export function subLevel(level: string | undefined, by = 1): HeadingTag {
  const n = Math.min(6, Math.max(1, Number(String(level ?? 'h2').slice(1)) + by));
  return `h${n}` as HeadingTag;
}

export function Dropzone({ ctx, parentId, label }: { ctx: RenderContext; parentId: string; label?: string }): ReactNode {
  if (ctx.mode !== 'editor' || !ctx.editor.showEmptyPlaceholders) return null;
  return (
    <div className="a-dropzone" data-drop-zone="" data-parent-id={parentId}>
      <span>{label ?? 'Drop blocks here'}</span>
    </div>
  );
}

/** Editor-only hint (e.g. "Select a form"); renders nothing on the public site. */
export function EditorNotice({ ctx, children }: { ctx: RenderContext; children: ReactNode }): ReactNode {
  if (ctx.mode !== 'editor') return null;
  return <div className="a-editor-notice" role="note">{children}</div>;
}

export function aspectStyle(aspect?: string): Record<string, string> | undefined {
  if (!aspect || aspect === 'auto') return undefined;
  const [w, h] = aspect.split(':');
  return { aspectRatio: `${w} / ${h}` };
}

export function formatList(values: unknown): string[] {
  if (Array.isArray(values)) return values.map((v) => String(v)).filter(Boolean);
  if (typeof values === 'string') return values.split('\n').map((s) => s.trim()).filter(Boolean);
  return [];
}

export function toArray<T = Record<string, any>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
