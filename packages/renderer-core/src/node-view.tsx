import { animationAttrs } from '@atrium/animations';
import { nodeClass } from '@atrium/design-tokens';
import type { Node } from '@atrium/schema';
import { memo, type ReactNode } from 'react';
import { applyBinding, applyTranslations, interpolateProps, parseWithSchema, visibilityOf } from './props';
import { getRenderer } from './registry';
import type { RenderContext } from './types';
import { Dropzone, EditorNotice } from './ui/core';

export interface ResolvedNode {
  props: Record<string, any>;
  variant?: string;
  attrs: Record<string, unknown>;
  hidden: boolean;
}

/** Compute the final props + root attributes for a node (exported for tests and custom hosts). */
export function resolveNode(ctx: RenderContext, node: Node): ResolvedNode {
  const def = ctx.registry.get(node.type);
  const hidden = visibilityOf(node, ctx) === 'hidden';
  let props: Record<string, unknown> = node.props ?? {};
  props = applyTranslations(props, node, ctx);
  props = interpolateProps(props, ctx.scope);
  props = applyBinding(props, node, def, ctx);
  props = parseWithSchema(def, props);
  let variant = node.variant;
  if (def?.variants?.length && (!variant || !def.variants.some((v) => v.id === variant))) variant = def.defaultVariant ?? def.variants[0]!.id;
  const editor = ctx.mode === 'editor';
  const attrs: Record<string, unknown> = {
    className: nodeClass(node.id),
    ...(node.anchor ? { id: node.anchor } : {}),
    ...(editor ? { 'data-node-id': node.id, 'data-node-type': node.type } : {}),
    ...(editor && hidden ? { 'data-node-hidden': '' } : {}),
    ...(ctx.animationsEnabled && node.animation ? animationAttrs(node.animation) : {}),
  };
  return { props: props as Record<string, any>, variant, attrs, hidden };
}

function UnknownNode({ ctx, node, children }: { ctx: RenderContext; node: Node; children?: ReactNode }) {
  if (ctx.mode !== 'editor') return <>{children}</>;
  return (
    <div className={`a-unknown ${nodeClass(node.id)}`} data-node-id={node.id} data-node-type={node.type}>
      <EditorNotice ctx={ctx}>Unknown component “{node.type}”</EditorNotice>
      {children}
    </div>
  );
}

/**
 * Renders one node: global-section refs, visibility, translations, `{{…}}` interpolation,
 * collection bindings, schema defaults and root attributes, then the registered renderer.
 */
export function NodeView({ ctx, node }: { ctx: RenderContext; node: Node }): ReactNode {
  if (node.type === 'global-section') {
    const gs = node.ref ? ctx.globalSections.get(node.ref) : undefined;
    if (!gs) {
      return ctx.mode === 'editor' ? (
        <div className={`a-unknown ${nodeClass(node.id)}`} data-node-id={node.id} data-node-type={node.type}>
          <EditorNotice ctx={ctx}>Global section not found — choose one in the inspector.</EditorNotice>
        </div>
      ) : null;
    }
    if (visibilityOf(node, ctx) === 'hidden' && ctx.mode !== 'editor') return null;
    if (ctx.mode === 'editor') {
      return (
        <div className={`a-global ${nodeClass(node.id)}`} data-node-id={node.id} data-node-type={node.type} data-global-ref={gs.id} {...(node.hidden ? { 'data-node-hidden': '' } : {})}>
          <EditorNodeView ctx={ctx} node={gs.node} />
        </div>
      );
    }
    return <NodeView ctx={ctx} node={node.anchor && !gs.node.anchor ? { ...gs.node, anchor: node.anchor } : gs.node} />;
  }

  const resolved = resolveNode(ctx, node);
  if (resolved.hidden && ctx.mode !== 'editor') return null;
  const Renderer = getRenderer(node.type);
  const def = ctx.registry.get(node.type);
  const childCtx = childContext(ctx);
  const Child = nodeComponent(ctx);
  let children: ReactNode = null;
  if (node.children?.length) {
    children = node.children.map((child) => <Child key={child.id} ctx={childCtx} node={child} />);
  } else if (def?.children) {
    children = <Dropzone ctx={ctx} parentId={node.id} />;
  }
  if (!Renderer) return <UnknownNode ctx={ctx} node={node}>{children}</UnknownNode>;
  return (
    <Renderer node={node} props={resolved.props} variant={resolved.variant} ctx={ctx} attrs={resolved.attrs}>
      {children}
    </Renderer>
  );
}

// ── Editor performance ───────────────────────────────────────────────────────
// The builder re-renders on every edit. With immer's structural sharing, untouched
// nodes keep their identity, so a memoized NodeView only re-renders the edited
// branch — provided the context object is stable too (child contexts are cached).

const childContexts = new WeakMap<RenderContext, RenderContext>();

/** Stable `{ ...ctx, depth: depth + 1 }` per parent context (keeps memoization effective). */
export function childContext(ctx: RenderContext): RenderContext {
  let c = childContexts.get(ctx);
  if (!c) {
    c = { ...ctx, depth: ctx.depth + 1 };
    childContexts.set(ctx, c);
  }
  return c;
}

/** Memoized NodeView for the editor canvas: skips nodes whose identity and context are unchanged. */
export const EditorNodeView = memo(NodeView, (a, b) => a.node === b.node && a.ctx === b.ctx);

/** Server/static renders use the plain component; the editor uses the memoized one. */
export function nodeComponent(ctx: RenderContext): typeof NodeView {
  return ctx.mode === 'editor' ? (EditorNodeView as unknown as typeof NodeView) : NodeView;
}
