import { createElement, type CSSProperties } from 'react';
import type { RenderProps } from '../types';
import { Btn, Buttons } from '../ui/actions';
import { cx, editProp, Heading, Rich, root, toArray, type HeadingTag } from '../ui/core';
import { Icon } from '../ui/icon';
import { sanitizeHtml } from '../ui/sanitize';
import { Section } from '../ui/section';

// ---------------------------------------------------------------- structure

export function SectionRenderer(rp: RenderProps) {
  const { props, children } = rp;
  return (
    <Section rp={rp} className={cx(props.minHeight !== 'auto' && `a-section--h-${props.minHeight}`, `a-section--v-${props.verticalAlign ?? 'start'}`)} innerClassName="a-flow">
      {children}
    </Section>
  );
}

export function ContainerRenderer({ props, attrs, children }: RenderProps) {
  const tag = (props.tag as string) || 'div';
  return createElement(tag, root(attrs, 'a-box', props.width && props.width !== 'auto' && `a-box--${props.width}`), children);
}

export function GridRenderer({ props, attrs, children }: RenderProps) {
  const style = { '--cols': props.columns ?? 3, '--cols-t': props.tabletColumns ?? 2, '--cols-m': props.mobileColumns ?? 1, alignItems: props.alignItems ?? 'stretch' } as CSSProperties;
  return <div {...root(attrs, 'a-grid', `a-gap-${props.gap ?? 'md'}`)} style={style}>{children}</div>;
}

const RATIOS: Record<string, string> = { '1:1': '1fr 1fr', '1:2': '1fr 2fr', '2:1': '2fr 1fr', '1:1:1': '1fr 1fr 1fr', '5:7': '5fr 7fr', '7:5': '7fr 5fr' };

export function ColumnsRenderer({ props, attrs, children }: RenderProps) {
  const style = { '--tpl': RATIOS[props.ratio as string] ?? '1fr 1fr', alignItems: props.alignItems ?? 'center' } as CSSProperties;
  return <div {...root(attrs, 'a-columns', `a-gap-${props.gap ?? 'lg'}`, props.reverseOnMobile && 'a-columns--reverse', props.ratio === '1:1:1' && 'a-columns--three')} style={style}>{children}</div>;
}

const ALIGN: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch', between: 'space-between' };

export function StackRenderer({ props, attrs, children }: RenderProps) {
  const style: CSSProperties = { alignItems: ALIGN[props.align as string] ?? 'stretch', justifyContent: ALIGN[props.justify as string] ?? 'flex-start' };
  return <div {...root(attrs, 'a-stack', `a-stack--${props.direction ?? 'vertical'}`, `a-stack-gap-${props.gap ?? 'md'}`, props.wrap && 'a-stack--wrap')} style={style}>{children}</div>;
}

export function SpacerRenderer({ props, attrs }: RenderProps) {
  return <div {...root(attrs, 'a-spacer', `a-spacer--${props.size ?? 'md'}`)} aria-hidden="true" />;
}

export function DividerRenderer({ props, attrs, ctx }: RenderProps) {
  const style = (props.style as string) ?? 'line';
  if (style === 'label' && props.label) {
    return <div {...root(attrs, 'a-divider', 'a-divider--label')} role="separator"><span {...editProp(ctx, 'label')}>{props.label}</span></div>;
  }
  if (style === 'ornament') return <div {...root(attrs, 'a-divider', 'a-divider--ornament')} role="separator"><span aria-hidden="true">✦</span></div>;
  return <hr {...root(attrs, 'a-divider', `a-divider--${style}`)} />;
}

// ---------------------------------------------------------------- content

export function HeadingRenderer({ props, attrs, ctx }: RenderProps) {
  const level = (props.level as HeadingTag) ?? 'h2';
  return (
    <Heading
      as={level}
      text={props.text}
      size={props.size !== 'auto' ? props.size : undefined}
      {...root(attrs, props.font && props.font !== 'heading' && `a-font-${props.font}`)}
      {...editProp(ctx, 'text')}
      data-a-text=""
    />
  );
}

export function TextRenderer({ props, attrs, ctx }: RenderProps) {
  const paras = String(props.text ?? '').split(/\n\s*\n/).filter(Boolean);
  const cls = cx('a-text', `a-text--${props.size ?? 'base'}`, props.muted && 'a-muted', props.eyebrow && 'a-eyebrow');
  if (paras.length <= 1) return <p {...root(attrs, cls)} {...editProp(ctx, 'text')} data-a-text=""><Rich text={props.text} /></p>;
  return <div {...root(attrs, cls, 'a-prose')} {...editProp(ctx, 'text')}>{paras.map((p, i) => <p key={i}><Rich text={p} /></p>)}</div>;
}

export function RichTextRenderer({ props, attrs, ctx }: RenderProps) {
  const html = sanitizeHtml(String(props.html ?? ''));
  return <div {...root(attrs, 'a-richtext', `a-richtext--${props.measure ?? 'default'}`, props.dropCap && 'a-richtext--dropcap')} {...editProp(ctx, 'html')} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ButtonRenderer({ props, attrs, ctx }: RenderProps) {
  const { className, ...rest } = attrs as Record<string, any>;
  return <Btn ctx={ctx} button={props} size={props.size} fullWidth={props.fullWidth} className={className} editName="label" {...rest} />;
}

export function ButtonGroupRenderer({ props, attrs, ctx }: RenderProps) {
  return <div {...root(attrs, 'a-button-group')}><Buttons ctx={ctx} buttons={props.buttons} align={props.align} /></div>;
}

export function IconRenderer({ props, attrs }: RenderProps) {
  return <span {...root(attrs, 'a-icon-el')}><Icon name={props.name} size={props.size} strokeWidth={props.strokeWidth} label={props.label} /></span>;
}

export function BadgeRenderer({ props, attrs, ctx }: RenderProps) {
  return <span {...root(attrs, 'a-badge', `a-badge--${props.style ?? 'subtle'}`)} {...editProp(ctx, 'text')}>{props.text}</span>;
}

export function QuoteRenderer({ props, attrs, ctx }: RenderProps) {
  return (
    <figure {...root(attrs, 'a-quote', `a-quote--${props.size ?? 'lg'}`)}>
      <blockquote {...editProp(ctx, 'text')} data-a-text=""><p><Rich text={props.text} /></p></blockquote>
      {props.author ? (
        <figcaption className="a-quote__by">
          <span className="a-quote__author" {...editProp(ctx, 'author')}>{props.author}</span>
          {props.role ? <span className="a-quote__role">{props.role}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function ListRenderer({ props, attrs }: RenderProps) {
  const style = (props.style as string) ?? 'check';
  const items = toArray<{ text: string; icon?: string }>(props.items);
  const Tag = style === 'number' ? 'ol' : 'ul';
  return (
    <Tag {...root(attrs, 'a-list', `a-list--${style}`)} style={{ '--cols': props.columns ?? 1 } as CSSProperties}>
      {items.map((it, i) => (
        <li key={i}>
          {style === 'check' ? <Icon name="check" size={16} className="a-list__mark" /> : style === 'icon' ? <Icon name={it.icon ?? 'sparkle'} size={18} className="a-list__mark" /> : null}
          <span><Rich text={it.text} /></span>
        </li>
      ))}
    </Tag>
  );
}

export const BASICS_CSS = /* css */ `
.atrium-site .a-flow{display:flex;flex-direction:column;gap:var(--a-space-6)}
.atrium-site .a-flow>.a-columns,.atrium-site .a-flow>.a-grid{width:100%}
.atrium-site .a-section--h-half{min-height:50vh;display:flex}
.atrium-site .a-section--h-screen{min-height:100svh;display:flex}
.atrium-site .a-section--h-half>.a-container,.atrium-site .a-section--h-screen>.a-container{display:flex;flex-direction:column}
.atrium-site .a-section--v-center>.a-container{justify-content:center}
.atrium-site .a-section--v-end>.a-container{justify-content:flex-end}
.atrium-site .a-box{display:flex;flex-direction:column;gap:var(--a-space-4);min-width:0}
.atrium-site .a-box--narrow{max-width:var(--a-container-narrow);margin-inline:auto;width:100%}
.atrium-site .a-box--default{max-width:var(--a-container-default);margin-inline:auto;width:100%}
.atrium-site .a-box--wide{max-width:var(--a-container-wide);margin-inline:auto;width:100%}
.atrium-site .a-columns{display:grid;grid-template-columns:var(--tpl);gap:var(--gap,var(--a-gap))}
.atrium-site .a-columns>*{min-width:0}
@media (max-width:991px){.atrium-site .a-columns--three{grid-template-columns:1fr 1fr}}
@media (max-width:767px){.atrium-site .a-columns,.atrium-site .a-columns--three{grid-template-columns:1fr}.atrium-site .a-columns--reverse>:first-child{order:2}}
.atrium-site .a-stack{display:flex;flex-direction:column;min-width:0}
.atrium-site .a-stack--horizontal{flex-direction:row}
.atrium-site .a-stack--wrap{flex-wrap:wrap}
.atrium-site .a-stack-gap-none{gap:0}.atrium-site .a-stack-gap-xs{gap:var(--a-space-1_5)}.atrium-site .a-stack-gap-sm{gap:var(--a-space-3)}
.atrium-site .a-stack-gap-md{gap:var(--a-space-5)}.atrium-site .a-stack-gap-lg{gap:var(--a-space-8)}.atrium-site .a-stack-gap-xl{gap:var(--a-space-12)}
@media (max-width:767px){.atrium-site .a-stack--horizontal:not(.a-stack--wrap){flex-wrap:wrap}}
.atrium-site .a-spacer--xs{height:var(--a-space-2)}.atrium-site .a-spacer--sm{height:var(--a-space-4)}.atrium-site .a-spacer--md{height:var(--a-space-8)}
.atrium-site .a-spacer--lg{height:var(--a-space-12)}.atrium-site .a-spacer--xl{height:var(--a-space-20)}.atrium-site .a-spacer--2xl{height:var(--a-space-32)}
.atrium-site .a-divider{border:0;margin:var(--a-space-6) 0;color:var(--t-muted)}
.atrium-site hr.a-divider--line{border-top:1px solid var(--t-border)}
.atrium-site hr.a-divider--short{width:4rem;border-top:1px solid currentColor;opacity:.6}
.atrium-site .a-divider--ornament{text-align:center;letter-spacing:1em;font-size:var(--a-text-sm)}
.atrium-site .a-divider--label{display:flex;align-items:center;gap:1.25rem;font-size:var(--a-text-xs);letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase}
.atrium-site .a-divider--label::before,.atrium-site .a-divider--label::after{content:"";flex:1;border-top:1px solid var(--t-border)}
.atrium-site .a-font-body{font-family:var(--a-font-body)}.atrium-site .a-font-accent{font-family:var(--a-font-accent);text-transform:none}
.atrium-site .a-text--sm{font-size:var(--a-text-sm)}.atrium-site .a-text--lg{font-size:var(--a-text-lg)}.atrium-site .a-text--xl{font-size:var(--a-text-xl);line-height:1.5}
.atrium-site .a-text{max-width:42rem}
.atrium-site .a-richtext{max-width:42rem}
.atrium-site .a-richtext--narrow{max-width:34rem}.atrium-site .a-richtext--full{max-width:none}
.atrium-site .a-richtext>*+*{margin-top:1.1em}
.atrium-site .a-richtext :is(h2,h3,h4){font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);line-height:1.15;letter-spacing:var(--a-tracking-heading);margin-top:1.8em}
.atrium-site .a-richtext h2{font-size:var(--a-text-3xl)}.atrium-site .a-richtext h3{font-size:var(--a-text-2xl)}.atrium-site .a-richtext h4{font-size:var(--a-text-xl)}
.atrium-site .a-richtext a{text-decoration:underline;text-underline-offset:.2em;text-decoration-thickness:1px}
.atrium-site .a-richtext ul{list-style:disc;padding-left:1.25em}.atrium-site .a-richtext ol{list-style:decimal;padding-left:1.25em}
.atrium-site .a-richtext li+li{margin-top:.4em}
.atrium-site .a-richtext blockquote{border-left:1px solid var(--t-border);padding-left:1.5em;font-family:var(--a-font-heading);font-size:var(--a-text-xl);font-style:italic}
.atrium-site .a-richtext img{border-radius:var(--a-radius-sm)}
.atrium-site .a-richtext table{width:100%;border-collapse:collapse;font-size:var(--a-text-sm)}
.atrium-site .a-richtext :is(th,td){padding:.7em .5em;border-bottom:1px solid var(--t-border);text-align:left}
.atrium-site .a-richtext--dropcap>p:first-of-type::first-letter{float:left;font-family:var(--a-font-heading);font-size:4.4em;line-height:.85;padding:.06em .1em 0 0}
.atrium-site .a-button-group{display:block}
.atrium-site .a-icon-el{display:inline-flex;color:var(--t-accent)}
.atrium-site .a-badge{display:inline-flex;align-items:center;align-self:flex-start;padding:.35em .8em;font-size:var(--a-text-xs);font-weight:600;letter-spacing:.08em;text-transform:uppercase;border-radius:var(--a-radius-full)}
.atrium-site .a-badge--subtle{background:color-mix(in srgb,var(--t-accent) 12%,transparent);color:var(--t-text)}
.atrium-site .a-badge--outline{border:1px solid var(--t-border)}
.atrium-site .a-badge--solid{background:var(--t-btn-bg);color:var(--t-btn-text)}
.atrium-site .a-quote{display:grid;gap:var(--a-space-5);max-width:52rem}
.atrium-site .a-quote blockquote{font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);line-height:1.25;letter-spacing:var(--a-tracking-heading);text-wrap:balance}
.atrium-site .a-quote--md blockquote{font-size:var(--a-text-xl)}.atrium-site .a-quote--lg blockquote{font-size:var(--a-text-3xl)}.atrium-site .a-quote--xl blockquote{font-size:var(--a-text-4xl)}
.atrium-site .a-quote blockquote p::before{content:"\\201C"}.atrium-site .a-quote blockquote p::after{content:"\\201D"}
.atrium-site .a-quote__by{display:flex;flex-wrap:wrap;gap:.25rem .75rem;font-size:var(--a-text-sm)}
.atrium-site .a-quote__author{font-weight:600}.atrium-site .a-quote__role{color:var(--t-muted)}
.atrium-site .a-list{display:grid;gap:.7rem 2.5rem;grid-template-columns:repeat(var(--cols,1),minmax(0,1fr))}
@media (max-width:767px){.atrium-site .a-list{grid-template-columns:1fr}}
.atrium-site .a-list li{display:flex;gap:.75rem;align-items:flex-start}
.atrium-site .a-list__mark{margin-top:.3em;color:var(--t-accent)}
.atrium-site .a-list--bullet li::before{content:"";flex:none;width:.35rem;height:.35rem;margin-top:.62em;border-radius:50%;background:currentColor;opacity:.55}
.atrium-site .a-list--number{counter-reset:a-li}
.atrium-site .a-list--number li{counter-increment:a-li}
.atrium-site .a-list--number li::before{content:counter(a-li,decimal-leading-zero);flex:none;min-width:1.75rem;font-family:var(--a-font-heading);color:var(--t-muted)}
`;
