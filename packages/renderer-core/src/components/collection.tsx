import type { CSSProperties, ReactNode } from 'react';
import { collectionRows, type ItemRow } from '../props';
import type { RenderContext, RenderProps } from '../types';
import { ALink, Buttons } from '../ui/actions';
import { cx, editProp, Heading, subLevel, toArray } from '../ui/core';
import { Icon } from '../ui/icon';
import { Frame, gridSizes, toMedia } from '../ui/media';
import { Intro, Section } from '../ui/section';

export interface ListItem { title: string; image?: unknown; text?: string; meta?: string; tag?: string; date?: string; href?: unknown; slug?: string }

const pick = (row: ItemRow, keys: string[]): unknown => {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  return undefined;
};
const str = (v: unknown) => (v === undefined || v === null ? undefined : typeof v === 'object' ? undefined : String(v));

/** Auto-map a collection's items to list items (used when `collection` is set without an explicit binding). */
export function autoMapCollection(ctx: RenderContext, collection: string): ListItem[] {
  const col = ctx.collections.get(collection);
  if (!col) return [];
  return collectionRows(ctx, collection).map((row) => ({
    title: str(pick(row, [col.titleField, 'title', 'name'])) ?? row.slug,
    image: pick(row, ['image', 'cover', 'photo', 'thumbnail']),
    text: str(pick(row, ['summary', 'excerpt', 'description'])),
    tag: str(pick(row, ['category', 'tag', 'industry', 'type'])),
    meta: str(pick(row, ['meta', 'client', 'location', 'author'])),
    date: str(pick(row, ['date', 'publishedAt'])),
    slug: row.slug,
  }));
}

export function CollectionListRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'grid';
  const collection = (props.__boundCollection as string | undefined) ?? (props.collection as string | undefined);
  let items: ListItem[] = node.binding ? toArray<ListItem>(props.items) : props.collection ? autoMapCollection(ctx, String(props.collection)) : toArray<ListItem>(props.items);
  const current = ctx.collectionItem;
  if (props.excludeCurrent !== false && current && current.collection === collection) items = items.filter((i) => i.slug !== current.item.slug);
  if (props.limit) items = items.slice(0, Number(props.limit));
  const level = subLevel(props.headingLevel);
  const hrefOf = (it: ListItem) => it.href ?? (it.slug && collection ? ctx.collectionItemPath(collection, it.slug) : undefined);
  const fmtDate = (d?: string) => {
    if (!d) return undefined;
    const t = Date.parse(d);
    return Number.isNaN(t) ? d : new Intl.DateTimeFormat(ctx.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(t));
  };
  const n = Number(props.columns ?? 3);
  const card = (it: ListItem, i: number, opts: { sizes: string; aspect?: string; className?: string }) => {
    const href = hrefOf(it);
    const meta = [it.meta, fmtDate(it.date)].filter(Boolean);
    const inner = (
      <>
        {toMedia(it.image) && variant !== 'minimal' ? <Frame ctx={ctx} media={it.image} aspect={opts.aspect ?? props.imageAspect} sizes={opts.sizes} rounded="sm" /> : null}
        <div className="a-card__body">
          {it.tag ? <span className="a-tag">{it.tag}</span> : null}
          <Heading as={level} text={it.title} className="a-card-title" {...editProp(ctx, `items.${i}.title`)} />
          {it.text && variant !== 'minimal' ? <p className="a-muted a-small a-clist__text">{it.text}</p> : null}
          {meta.length ? <p className="a-meta">{meta.map((m, j) => <span key={j}>{m}</span>)}</p> : null}
          {href && variant !== 'minimal' ? <span className="a-btn a-btn--link a-clist__more"><span className="a-btn__label">{props.linkLabel}</span><Icon name="arrow-right" size={14} className="a-btn__icon" /></span> : null}
        </div>
        {variant === 'minimal' && href ? <Icon name="arrow-up-right" size={20} className="a-clist__arrow" /> : null}
      </>
    );
    const cls = cx('a-card', 'a-clist__item', opts.className);
    return href ? <ALink key={it.slug ?? i} ctx={ctx} link={href as string} className={cx(cls, 'a-hover-zoom')}>{inner}</ALink> : <article key={it.slug ?? i} className={cls}>{inner}</article>;
  };

  let body: ReactNode;
  if (!items.length) body = <p className="a-muted a-clist__empty">{props.emptyText}</p>;
  else if (variant === 'list') body = <div className="a-clist__list">{items.map((it, i) => card(it, i, { sizes: '(max-width: 767px) 40vw, 22rem', className: 'a-clist__row', aspect: '4:3' }))}</div>;
  else if (variant === 'minimal') body = <div className="a-clist__minimal">{items.map((it, i) => card(it, i, { sizes: '1px', className: 'a-clist__line' }))}</div>;
  else if (variant === 'featured') {
    body = (
      <div className="a-clist__featured">
        {card(items[0]!, 0, { sizes: '(max-width: 991px) 100vw, 60vw', className: 'a-clist__lead', aspect: '16:10' })}
        <div className="a-clist__side">{items.slice(1, 4).map((it, i) => card(it, i + 1, { sizes: '(max-width: 991px) 40vw, 14rem', className: 'a-clist__row a-clist__row--compact', aspect: '4:3' }))}</div>
      </div>
    );
  } else body = <div className="a-grid a-clist__grid" style={{ '--cols': n, '--cols-t': Math.min(n, 2), '--cols-m': 1 } as CSSProperties}>{items.map((it, i) => card(it, i, { sizes: gridSizes(n) }))}</div>;

  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {body}
      <Buttons ctx={ctx} buttons={props.buttons} align={props.align === 'center' ? 'center' : undefined} className="a-section__actions" />
    </Section>
  );
}

export const COLLECTION_CSS = /* css */ `
.atrium-site .a-clist__grid{row-gap:clamp(2.5rem,5vw,3.5rem)}
.atrium-site .a-clist__text{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.atrium-site .a-clist__more{justify-self:start}
.atrium-site .a-clist__list{display:grid;border-top:1px solid var(--t-border)}
.atrium-site .a-clist__row{display:grid;grid-template-columns:minmax(8rem,20rem) minmax(0,1fr);gap:clamp(1.25rem,4vw,3rem);align-items:center;padding-block:clamp(1.25rem,3vw,2rem);border-bottom:1px solid var(--t-border)}
.atrium-site .a-clist__row--compact{grid-template-columns:8rem minmax(0,1fr);gap:1.25rem;padding-block:1.25rem}
.atrium-site .a-clist__row--compact .a-card-title{font-size:var(--a-text-lg)}
.atrium-site .a-clist__minimal{display:grid;border-top:1px solid var(--t-border)}
.atrium-site .a-clist__line{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1.5rem;padding-block:1.4rem;border-bottom:1px solid var(--t-border)}
.atrium-site .a-clist__line .a-card__body{grid-template-columns:8rem minmax(0,1fr) auto;align-items:baseline;gap:1rem 2rem}
.atrium-site .a-clist__line .a-card-title{font-size:var(--a-text-2xl)}
.atrium-site .a-clist__arrow{transition:transform .4s var(--a-ease)}
.atrium-site .a-clist__line:hover .a-clist__arrow{transform:translate(3px,-3px)}
.atrium-site .a-clist__featured{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:clamp(2rem,5vw,4rem);align-items:start}
.atrium-site .a-clist__lead .a-card-title{font-size:var(--a-text-3xl)}
.atrium-site .a-clist__side{display:grid;border-top:1px solid var(--t-border)}
.atrium-site .a-clist__empty{padding:2rem 0;border-block:1px solid var(--t-border)}
@media (max-width:991px){.atrium-site .a-clist__featured{grid-template-columns:1fr}}
@media (max-width:767px){.atrium-site .a-clist__row{grid-template-columns:7rem 1fr}.atrium-site .a-clist__line .a-card__body{grid-template-columns:1fr}}
`;
