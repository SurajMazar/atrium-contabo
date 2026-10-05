import type { LinkValue } from '@atrium/schema';
import type { ReactNode } from 'react';
import type { RenderContext } from '../types';
import { cx, editProp, part, Rich } from './core';
import { Icon } from './icon';

export interface ButtonData {
  label?: string;
  link?: LinkValue;
  style?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
  icon?: string;
  iconPosition?: 'start' | 'end';
}

/** <a> for a LinkValue (internal links get basePath/locale; external get rel/target). Falls back to a span. */
export function ALink({ ctx, link, className, children, label, ...rest }: { ctx: RenderContext; link?: LinkValue | null; className?: string; children: ReactNode; label?: string } & Record<string, unknown>): ReactNode {
  const res = ctx.resolveLink(link);
  if (!res) return <span className={className} {...rest}>{children}</span>;
  return (
    <a href={res.href} className={className} target={res.newTab ? '_blank' : undefined} rel={res.rel} aria-label={label} {...rest}>
      {children}
    </a>
  );
}

export function Btn({ ctx, button, size = 'md', className, editName, fullWidth, ...rest }: { ctx: RenderContext; button: ButtonData; size?: 'sm' | 'md' | 'lg'; className?: string; editName?: string; fullWidth?: boolean } & Record<string, unknown>): ReactNode {
  if (!button?.label) return null;
  const style = button.style ?? 'primary';
  const iconName = button.icon ?? (style === 'link' ? 'arrow-right' : undefined);
  const icon = iconName ? <Icon name={iconName} size={size === 'sm' ? 14 : 16} className="a-btn__icon" /> : null;
  const start = button.iconPosition === 'start';
  const res = ctx.resolveLink(button.link);
  const external = res?.newTab;
  const content = (
    <>
      {start && icon}
      <span className="a-btn__label" {...(editName ? editProp(ctx, editName) : {})}><Rich text={button.label} /></span>
      {!start && icon}
      {external ? <span className="a-sr">(opens in a new tab)</span> : null}
    </>
  );
  const cls = cx('a-btn', `a-btn--${style}`, size !== 'md' && `a-btn--${size}`, fullWidth && 'a-btn--block', className);
  if (!res) return <span className={cls} {...rest}>{content}</span>;
  return (
    <a href={res.href} className={cls} target={res.newTab ? '_blank' : undefined} rel={res.rel} {...rest}>
      {content}
    </a>
  );
}

export function Buttons({ ctx, buttons, align, className, size, editPrefix = 'buttons', asPart }: { ctx: RenderContext; buttons?: ButtonData[]; align?: string; className?: string; size?: 'sm' | 'md' | 'lg'; editPrefix?: string; asPart?: boolean }): ReactNode {
  const list = (buttons ?? []).filter((b) => b?.label);
  if (!list.length) return null;
  return (
    <div className={cx('a-actions', align && `a-actions--${align}`, className)} {...(asPart ? part : {})}>
      {list.map((b, i) => <Btn key={i} ctx={ctx} button={b} size={size} editName={`${editPrefix}.${i}.label`} />)}
    </div>
  );
}
