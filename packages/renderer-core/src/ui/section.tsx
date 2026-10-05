import { createElement, type CSSProperties, type ReactNode } from 'react';
import type { RenderContext, RenderProps } from '../types';
import { cx, editProp, Heading, part, Rich, type HeadingTag } from './core';

export const headingId = (nodeId: string) => `h-${nodeId}`;

export interface SectionProps {
  rp: Pick<RenderProps, 'node' | 'ctx' | 'attrs' | 'props' | 'variant'>;
  className?: string;
  children?: ReactNode;
  /** Wrap children in a container (default true). */
  container?: boolean;
  width?: string;
  innerClassName?: string;
  style?: CSSProperties;
  as?: 'section' | 'div' | 'aside';
  /** Label the landmark with the intro heading. */
  labelled?: boolean;
  extra?: Record<string, unknown>;
}

/** Standard section band: tone, vertical rhythm, container width, variant classes, nested handling. */
export function Section({ rp, className, children, container = true, width, innerClassName, style, as = 'section', labelled, extra }: SectionProps): ReactNode {
  const { node, ctx, attrs, props, variant } = rp;
  const tone = (props.tone as string) || 'default';
  const cls = cx(
    attrs.className as string,
    'a-section',
    `a-${node.type}`,
    variant && `a-${node.type}--${variant}`,
    `a-tone-${tone}`,
    `a-pt-${props.spacingTop ?? 'lg'}`,
    `a-pb-${props.spacingBottom ?? 'lg'}`,
    ctx.depth > 0 && 'a-section--nested',
    className,
  );
  const inner = container ? (
    <div className={cx('a-container', `a-container--${width ?? (props.containerWidth as string) ?? 'default'}`, innerClassName)}>{children}</div>
  ) : (
    children
  );
  return createElement(
    as,
    { ...attrs, ...extra, className: cls, style, 'aria-labelledby': labelled && props.heading ? headingId(node.id) : undefined },
    inner,
  );
}

export interface IntroProps {
  ctx: RenderContext;
  props: Record<string, any>;
  nodeId: string;
  className?: string;
  align?: string;
  /** Heading tag override (defaults to props.headingLevel ?? h2). */
  as?: HeadingTag;
  size?: string;
  children?: ReactNode;
  /** Prop names (for data-edit-prop and content). */
  keys?: { eyebrow?: string; heading?: string; subheading?: string };
  parts?: boolean;
}

/** Eyebrow + heading + supporting text with inline-edit + choreography markers. */
export function Intro({ ctx, props, nodeId, className, align, as, size, children, keys = {}, parts = true }: IntroProps): ReactNode {
  const ek = keys.eyebrow ?? 'eyebrow';
  const hk = keys.heading ?? 'heading';
  const sk = keys.subheading ?? 'subheading';
  const eyebrow = props[ek] as string | undefined;
  const heading = props[hk] as string | undefined;
  const sub = props[sk] as string | undefined;
  if (!eyebrow && !heading && !sub && !children) return null;
  const p = parts ? part : {};
  return (
    <header className={cx('a-intro', `a-intro--${align ?? props.align ?? 'left'}`, className)}>
      {eyebrow ? <p className="a-eyebrow" {...p} {...editProp(ctx, ek)}><Rich text={eyebrow} /></p> : null}
      {heading ? <Heading as={as ?? (props.headingLevel as HeadingTag) ?? 'h2'} text={heading} size={size} id={headingId(nodeId)} className="a-intro__heading" {...p} {...editProp(ctx, hk)} /> : null}
      {sub ? <p className="a-lead a-intro__sub" {...p} {...editProp(ctx, sk)}><Rich text={sub} /></p> : null}
      {children}
    </header>
  );
}
