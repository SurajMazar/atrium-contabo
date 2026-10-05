import type { CSSProperties, ReactNode } from 'react';
import { BookingWidget } from '../islands/booking';
import { Carousel } from '../islands/carousel';
import { Tabs } from '../islands/interactive';
import type { RenderContext, RenderProps } from '../types';
import { ALink, Btn, Buttons } from '../ui/actions';
import { cx, editProp, formatList, Heading, Paragraphs, part, Rich, subLevel, toArray, type HeadingTag } from '../ui/core';
import { Icon } from '../ui/icon';
import { AImage, Frame, gridSizes, toMedia } from '../ui/media';
import { headingId, Intro, Section } from '../ui/section';

const gridVars = (n: unknown, def = 3) => {
  const c = Math.max(1, Number(n ?? def));
  return { '--cols': c, '--cols-t': Math.min(c, 2), '--cols-m': 1 } as CSSProperties;
};

// ---------------------------------------------------------------- rooms

interface Room { name: string; image?: unknown; price?: string; priceSuffix?: string; size?: string; guests?: string; bed?: string; view?: string; summary?: string; features?: string[]; slug?: string; href?: unknown }

function roomLink(ctx: RenderContext, props: Record<string, any>, r: Room): unknown {
  if (r.href) return r.href;
  if (r.slug) return ctx.collectionItemPath(String(props.collection || props.__boundCollection || 'rooms'), r.slug);
  return undefined;
}

function RoomFacts({ r }: { r: Room }) {
  const facts: Array<[string, string]> = [];
  if (r.size) facts.push(['maximize-2', r.size]);
  if (r.guests) facts.push(['users', r.guests]);
  if (r.bed) facts.push(['bed-double', r.bed]);
  if (r.view) facts.push(['mountain', r.view]);
  if (!facts.length) return null;
  return (
    <ul className="a-meta a-room__facts">
      {facts.map(([icon, label], i) => <li key={i}><Icon name={icon} size={15} />{label}</li>)}
    </ul>
  );
}

function Price({ price, suffix, from = 'From' }: { price?: string; suffix?: string; from?: string }) {
  if (!price) return null;
  return <p className="a-price a-room__price"><span className="a-room__from">{from}</span> {price}{suffix ? <small>{suffix}</small> : null}</p>;
}

export function RoomsRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'cards';
  const items = toArray<Room>(props.items);
  const level = subLevel(props.headingLevel);
  const n = Number(props.columns ?? 3);

  const card = (r: Room, i: number, sizes: string) => {
    const href = roomLink(ctx, props, r);
    const content = (
      <>
        <Frame ctx={ctx} media={r.image} aspect={props.imageAspect} sizes={sizes} rounded="sm" />
        <div className="a-room__body">
          <div className="a-room__head">
            <Heading as={level} text={r.name} className="a-card-title a-room__name" {...editProp(ctx, `items.${i}.name`)} />
            {props.showPrice !== false ? <Price price={r.price} suffix={r.priceSuffix} /> : null}
          </div>
          {props.showFacts !== false ? <RoomFacts r={r} /> : null}
          {r.summary && variant !== 'carousel' ? <p className="a-muted a-small a-room__summary">{r.summary}</p> : null}
          {href ? <span className="a-btn a-btn--link a-room__cta"><span className="a-btn__label">{props.ctaLabel}</span><Icon name="arrow-right" size={14} className="a-btn__icon" /></span> : null}
        </div>
      </>
    );
    return href ? (
      <ALink key={i} ctx={ctx} link={href as string} className="a-card a-room a-hover-zoom">{content}</ALink>
    ) : (
      <article key={i} className="a-card a-room">{content}</article>
    );
  };

  let body: ReactNode;
  if (variant === 'editorial-list') {
    body = (
      <div className="a-rooms__list">
        {items.map((r, i) => {
          const href = roomLink(ctx, props, r);
          return (
            <article key={i} className={cx('a-room-row', i % 2 === 1 && 'a-room-row--flip')}>
              <Frame ctx={ctx} media={r.image} aspect={props.imageAspect === '4:5' ? '4:3' : props.imageAspect} sizes="(max-width: 991px) 100vw, 58vw" rounded="sm" className="a-room-row__media" />
              <div className="a-room-row__copy">
                <span className="a-room-row__num">{String(i + 1).padStart(2, '0')}</span>
                <Heading as={level} text={r.name} className="a-room-row__name" {...editProp(ctx, `items.${i}.name`)} />
                {r.summary ? <p className="a-muted">{r.summary}</p> : null}
                {props.showFacts !== false ? <RoomFacts r={r} /> : null}
                <div className="a-room-row__foot">
                  {props.showPrice !== false ? <Price price={r.price} suffix={r.priceSuffix} /> : null}
                  {href ? <Btn ctx={ctx} button={{ label: props.ctaLabel, link: href as string, style: 'outline' }} size="sm" /> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  } else if (variant === 'carousel') {
    body = (
      <Carousel label={props.heading ? String(props.heading).replace(/\*/g, '') : 'Rooms'} layout="cards" paused={ctx.mode === 'editor'}>
        {items.map((r, i) => card(r, i, gridSizes(3)))}
      </Carousel>
    );
  } else {
    body = <div className="a-grid a-rooms__grid" style={gridVars(n)}>{items.map((r, i) => card(r, i, gridSizes(n)))}</div>;
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {items.length ? body : ctx.mode === 'editor' ? <div className="a-dropzone">No rooms yet — add rooms or bind a collection.</div> : null}
      <Buttons ctx={ctx} buttons={props.buttons} align={props.align === 'center' ? 'center' : undefined} className="a-section__actions" />
    </Section>
  );
}

// ---------------------------------------------------------------- amenities

export function AmenitiesRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'icon-grid';
  const items = toArray<{ icon?: string; title: string; text?: string; image?: unknown }>(props.items);
  const n = Number(props.columns ?? 4);
  let body: ReactNode;
  if (variant === 'image-tiles') {
    body = (
      <div className="a-grid a-amenities__tiles" style={{ ...gridVars(n, 4), '--cols-m': 2 } as CSSProperties}>
        {items.map((a, i) => (
          <figure key={i} className="a-tile a-on-media">
            <Frame ctx={ctx} media={a.image} aspect="3:4" sizes={gridSizes(n)} rounded="sm" />
            <figcaption className="a-tile__caption">
              <span className="a-tile__title" {...editProp(ctx, `items.${i}.title`)}>{a.title}</span>
              {a.text ? <span className="a-tile__text">{a.text}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  } else if (variant === 'list') {
    body = (
      <ul className="a-amenities__list" style={{ '--cols': Math.min(n, 4) } as CSSProperties}>
        {items.map((a, i) => <li key={i}><Icon name={a.icon ?? 'check'} size={18} strokeWidth={1.25} /><span {...editProp(ctx, `items.${i}.title`)}>{a.title}</span></li>)}
      </ul>
    );
  } else {
    body = (
      <ul className="a-grid a-amenities__grid" style={{ ...gridVars(n, 4), '--cols-t': Math.min(n, 3), '--cols-m': 2 } as CSSProperties}>
        {items.map((a, i) => (
          <li key={i} className="a-amenity">
            <Icon name={a.icon ?? 'sparkle'} size={30} strokeWidth={1.1} className="a-amenity__icon" />
            <span className="a-amenity__title" {...editProp(ctx, `items.${i}.title`)}>{a.title}</span>
            {a.text ? <span className="a-amenity__text">{a.text}</span> : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {body}
    </Section>
  );
}

// ---------------------------------------------------------------- offers

interface Offer { title: string; image?: unknown; badge?: string; price?: string; priceNote?: string; description?: string; inclusions?: string[]; validity?: string; cta?: Record<string, any> }

export function OffersRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'cards';
  const items = toArray<Offer>(props.items);
  const level = subLevel(props.headingLevel);
  const offer = (o: Offer, i: number, opts: { sizes: string; className?: string; aspect?: string }) => (
    <article key={i} className={cx('a-offer', opts.className)}>
      <div className="a-offer__media">
        <Frame ctx={ctx} media={o.image} aspect={opts.aspect ?? props.imageAspect} sizes={opts.sizes} rounded="sm" />
        {o.badge ? <span className="a-offer__badge">{o.badge}</span> : null}
      </div>
      <div className="a-offer__body">
        <Heading as={level} text={o.title} className="a-card-title a-offer__title" {...editProp(ctx, `items.${i}.title`)} />
        {o.description ? <p className="a-muted a-small">{o.description}</p> : null}
        {formatList(o.inclusions).length ? (
          <ul className="a-check-list a-offer__incl">{formatList(o.inclusions).map((x, j) => <li key={j}><Icon name="check" size={15} /><span>{x}</span></li>)}</ul>
        ) : null}
        <div className="a-offer__foot">
          {o.price ? <p className="a-price">{o.price}{o.priceNote ? <small>{o.priceNote}</small> : null}</p> : <span />}
          {o.validity ? <p className="a-offer__valid"><Icon name="calendar" size={14} />{o.validity}</p> : null}
        </div>
        {o.cta?.label ? <Btn ctx={ctx} button={o.cta} size="sm" className="a-offer__cta" /> : null}
      </div>
    </article>
  );
  let body: ReactNode;
  if (variant === 'list') body = <div className="a-offers__list">{items.map((o, i) => offer(o, i, { sizes: '(max-width: 767px) 100vw, 40vw', className: 'a-offer--row', aspect: '4:3' }))}</div>;
  else if (variant === 'featured' && items.length > 1) {
    body = (
      <div className="a-offers__featured">
        {offer(items[0]!, 0, { sizes: '(max-width: 991px) 100vw, 60vw', className: 'a-offer--feature', aspect: '16:9' })}
        <div className="a-offers__rest">{items.slice(1).map((o, i) => offer(o, i + 1, { sizes: '(max-width: 991px) 100vw, 30vw', className: 'a-offer--compact', aspect: '3:2' }))}</div>
      </div>
    );
  } else body = <div className="a-grid a-offers__grid" style={gridVars(props.columns)}>{items.map((o, i) => offer(o, i, { sizes: gridSizes(Number(props.columns ?? 3)) }))}</div>;
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {body}
    </Section>
  );
}

// ---------------------------------------------------------------- dining

function InfoList({ items, className }: { items: Array<{ label: string; value: string }>; className?: string }) {
  if (!items.length) return null;
  return <dl className={cx('a-info', className)}>{items.map((h, i) => <div key={i}><dt>{h.label}</dt><dd>{h.value}</dd></div>)}</dl>;
}

export function DiningRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'split';
  const level = (props.headingLevel as HeadingTag) ?? 'h2';
  const highlights = toArray<{ label: string; value: string }>(props.highlights);
  const hours = toArray<{ label: string; value: string }>(props.hours);
  const copy = (
    <div className="a-dining__copy">
      {props.eyebrow ? <p className="a-eyebrow a-eyebrow--rule" {...part} {...editProp(ctx, 'eyebrow')}>{props.eyebrow}</p> : null}
      <Heading as={level} text={props.heading} id={headingId(node.id)} className="a-dining__heading" {...part} {...editProp(ctx, 'heading')} />
      {props.body ? <div {...part}><Paragraphs text={props.body} className="a-muted" ctx={ctx} editName="body" /></div> : null}
      <InfoList items={highlights} className="a-dining__highlights" />
      {hours.length ? (
        <div className="a-dining__hours" {...part}>
          <p className="a-dining__hours-title"><Icon name="clock" size={15} />Opening hours</p>
          <InfoList items={hours} className="a-info--rows" />
        </div>
      ) : null}
      <Buttons ctx={ctx} buttons={props.buttons} asPart />
    </div>
  );
  if (variant === 'feature') {
    return (
      <Section rp={rp} labelled width="wide">
        <div className={cx('a-dining__feature', props.imageSide === 'right' && 'a-dining__feature--right')}>
          <Frame ctx={ctx} media={props.image} aspect="16:10" sizes="(max-width: 991px) 100vw, 75vw" rounded="sm" className="a-dining__hero" />
          <div className="a-dining__card">{copy}</div>
        </div>
      </Section>
    );
  }
  return (
    <Section rp={rp} labelled>
      <div className={cx('a-dining__split', props.imageSide === 'right' && 'a-dining__split--right')}>
        <div className="a-dining__media">
          <Frame ctx={ctx} media={props.image} aspect="4:5" sizes="(max-width: 991px) 100vw, 45vw" rounded="sm" />
          {toMedia(props.secondaryImage) ? <Frame ctx={ctx} media={props.secondaryImage} aspect="1:1" sizes="(max-width: 991px) 40vw, 18vw" rounded="sm" className="a-dining__detail" /> : null}
        </div>
        {copy}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- menu

interface MenuCategory { name: string; description?: string; items?: Array<{ name: string; description?: string; price?: string; tags?: string[] }> }

function MenuCategoryView({ ctx, c, ci, leader, level }: { ctx: RenderContext; c: MenuCategory; ci: number; leader: boolean; level: HeadingTag }) {
  return (
    <section className="a-menu__cat" aria-labelledby={undefined}>
      <Heading as={level} text={c.name} className="a-menu__catname" {...editProp(ctx, `categories.${ci}.name`)} />
      {c.description ? <p className="a-muted a-small a-menu__catdesc">{c.description}</p> : null}
      <ul className="a-menu__items">
        {toArray<NonNullable<MenuCategory['items']>[number]>(c.items).map((it, i) => (
          <li key={i} className={cx('a-menu__item', leader && 'a-menu__item--leader')}>
            <div className="a-menu__line">
              <span className="a-menu__name" {...editProp(ctx, `categories.${ci}.items.${i}.name`)}>{it.name}</span>
              {formatList(it.tags).length ? <span className="a-menu__tags">{formatList(it.tags).map((t) => <abbr key={t} title={t}>{t}</abbr>)}</span> : null}
              {leader ? <span className="a-menu__dots" aria-hidden="true" /> : null}
              {it.price ? <span className="a-menu__price">{it.price}</span> : null}
            </div>
            {it.description ? <p className="a-menu__desc">{it.description}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MenuRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'classic';
  const cats = toArray<MenuCategory>(props.categories);
  const level = subLevel(props.headingLevel);
  let body: ReactNode;
  if (variant === 'tabs' && cats.length > 1) {
    body = <Tabs labels={cats.map((c) => c.name)} align="center" panels={cats.map((c, ci) => <MenuCategoryView key={ci} ctx={ctx} c={{ ...c, name: '' }} ci={ci} leader level={level} />)} />;
  } else {
    body = (
      <div className={cx('a-menu__cats', variant === 'grid' && 'a-menu__cats--grid')} style={{ '--cols': props.columns ?? 2 } as CSSProperties}>
        {cats.map((c, ci) => <MenuCategoryView key={ci} ctx={ctx} c={c} ci={ci} leader={variant === 'classic'} level={level} />)}
      </div>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {body}
      {props.note ? <p className="a-footnote a-menu__note">{props.note}</p> : null}
    </Section>
  );
}

// ---------------------------------------------------------------- experiences

interface Experience { title: string; image?: unknown; tag?: string; text?: string; duration?: string; price?: string; link?: unknown }

export function ExperiencesRenderer(rp: RenderProps) {
  const { props, ctx, node, attrs } = rp;
  const variant = rp.variant ?? 'cards';
  const items = toArray<Experience>(props.items);
  const level = subLevel(props.headingLevel);
  const card = (x: Experience, i: number, sizes: string) => {
    const inner = (
      <>
        <div className="a-exp__media">
          <Frame ctx={ctx} media={x.image} aspect={props.imageAspect} sizes={sizes} rounded="sm" />
          {x.tag ? <span className="a-exp__tag">{x.tag}</span> : null}
        </div>
        <div className="a-card__body">
          <Heading as={level} text={x.title} className="a-card-title" {...editProp(ctx, `items.${i}.title`)} />
          {x.text ? <p className="a-muted a-small">{x.text}</p> : null}
          {x.duration || x.price ? (
            <ul className="a-meta">
              {x.duration ? <li><Icon name="clock" size={14} />{x.duration}</li> : null}
              {x.price ? <li><Icon name="ticket" size={14} />{x.price}</li> : null}
            </ul>
          ) : null}
        </div>
      </>
    );
    return x.link ? <ALink key={i} ctx={ctx} link={x.link as string} className="a-card a-exp a-hover-zoom">{inner}</ALink> : <article key={i} className="a-card a-exp">{inner}</article>;
  };
  if (variant === 'horizontal-scroll') {
    return (
      <Section rp={rp} labelled container={false} className="a-hscroll" extra={!attrs['data-a-anim'] && ctx.animationsEnabled ? { 'data-a-anim': JSON.stringify({ preset: 'horizontal-scroll' }) } : undefined}>
        <div className="a-container a-container--wide"><Intro ctx={ctx} props={props} nodeId={node.id} /></div>
        <div className="a-hscroll__viewport">
          <div className="a-hscroll__track" data-a-track="">
            {items.map((x, i) => <div key={i} className="a-hscroll__card a-hscroll__card--md">{card(x, i, '(max-width: 767px) 80vw, 28rem')}</div>)}
          </div>
        </div>
      </Section>
    );
  }
  if (variant === 'list') {
    return (
      <Section rp={rp} labelled>
        <Intro ctx={ctx} props={props} nodeId={node.id} />
        <div className="a-exp__list">
          {items.map((x, i) => (
            <article key={i} className="a-exp-row">
              <Frame ctx={ctx} media={x.image} aspect="4:3" sizes="(max-width: 767px) 35vw, 16rem" rounded="sm" />
              <div className="a-exp-row__body">
                {x.tag ? <span className="a-tag">{x.tag}</span> : null}
                <Heading as={level} text={x.title} className="a-card-title" {...editProp(ctx, `items.${i}.title`)} />
                {x.text ? <p className="a-muted a-small">{x.text}</p> : null}
              </div>
              <ul className="a-meta a-exp-row__meta">
                {x.duration ? <li><Icon name="clock" size={14} />{x.duration}</li> : null}
                {x.price ? <li>{x.price}</li> : null}
                {x.link ? <li><ALink ctx={ctx} link={x.link as string} className="a-btn a-btn--link"><span className="a-btn__label">Details</span><Icon name="arrow-right" size={14} className="a-btn__icon" /></ALink></li> : null}
              </ul>
            </article>
          ))}
        </div>
        <Buttons ctx={ctx} buttons={props.buttons} className="a-section__actions" />
      </Section>
    );
  }
  const n = Number(props.columns ?? 3);
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <div className="a-grid a-exp__grid" style={gridVars(n)}>{items.map((x, i) => card(x, i, gridSizes(n)))}</div>
      <Buttons ctx={ctx} buttons={props.buttons} align={props.align === 'center' ? 'center' : undefined} className="a-section__actions" />
    </Section>
  );
}

// ---------------------------------------------------------------- venues

interface Venue { name: string; image?: unknown; description?: string; size?: string; capacities?: Array<{ layout: string; guests: string }>; features?: string[]; link?: unknown }

function CapacityTable({ venues, caption }: { venues: Venue[]; caption: string }) {
  const layouts = [...new Set(venues.flatMap((v) => (v.capacities ?? []).map((c) => c.layout)))];
  if (!layouts.length) return null;
  return (
    <div className="a-table-wrap a-venues__table">
      <table className="a-table">
        <caption className="a-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Space</th>
            {venues.some((v) => v.size) ? <th scope="col">Size</th> : null}
            {layouts.map((l) => <th key={l} scope="col">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {venues.map((v, i) => (
            <tr key={i}>
              <th scope="row">{v.name}</th>
              {venues.some((x) => x.size) ? <td>{v.size ?? '—'}</td> : null}
              {layouts.map((l) => <td key={l}>{v.capacities?.find((c) => c.layout === l)?.guests ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Capacities({ v }: { v: Venue }) {
  if (!v.capacities?.length) return null;
  return (
    <dl className="a-capacity">
      {v.capacities.map((c, i) => <div key={i}><dt>{c.layout}</dt><dd>{c.guests}</dd></div>)}
    </dl>
  );
}

export function VenuesRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'detailed';
  const items = toArray<Venue>(props.items);
  const level = subLevel(props.headingLevel);
  const caption = `Capacity by layout${props.heading ? ` — ${String(props.heading).replace(/\*/g, '')}` : ''}`;
  let body: ReactNode = null;
  if (variant === 'cards') {
    body = (
      <div className="a-grid a-venues__grid" style={gridVars(props.columns)}>
        {items.map((v, i) => (
          <article key={i} className="a-card a-venue">
            <Frame ctx={ctx} media={v.image} aspect="4:3" sizes={gridSizes(Number(props.columns ?? 3))} rounded="sm" />
            <div className="a-card__body">
              <div className="a-venue__head">
                <Heading as={level} text={v.name} className="a-card-title" {...editProp(ctx, `items.${i}.name`)} />
                {v.size ? <span className="a-muted a-small">{v.size}</span> : null}
              </div>
              {v.description ? <p className="a-muted a-small">{v.description}</p> : null}
              <Capacities v={v} />
              {v.link ? <ALink ctx={ctx} link={v.link as string} className="a-btn a-btn--link"><span className="a-btn__label">Explore the space</span><Icon name="arrow-right" size={14} className="a-btn__icon" /></ALink> : null}
            </div>
          </article>
        ))}
      </div>
    );
  } else if (variant === 'detailed') {
    body = (
      <div className="a-venues__detailed">
        {items.map((v, i) => (
          <article key={i} className={cx('a-venue-row', i % 2 === 1 && 'a-venue-row--flip')}>
            <Frame ctx={ctx} media={v.image} aspect="4:3" sizes="(max-width: 991px) 100vw, 55vw" rounded="sm" />
            <div className="a-venue-row__copy">
              <span className="a-room-row__num">{String(i + 1).padStart(2, '0')}</span>
              <Heading as={level} text={v.name} className="a-venue-row__name" {...editProp(ctx, `items.${i}.name`)} />
              {v.size ? <p className="a-tag">{v.size}</p> : null}
              {v.description ? <p className="a-muted">{v.description}</p> : null}
              <Capacities v={v} />
              {formatList(v.features).length ? <ul className="a-pills">{formatList(v.features).map((f) => <li key={f} className="a-pill">{f}</li>)}</ul> : null}
              {v.link ? <Btn ctx={ctx} button={{ label: 'Explore the space', link: v.link as string, style: 'outline' }} size="sm" /> : null}
            </div>
          </article>
        ))}
      </div>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {body}
      {variant === 'table' || props.showTable !== false ? <CapacityTable venues={items} caption={caption} /> : null}
    </Section>
  );
}

// ---------------------------------------------------------------- events

interface EventItem { title: string; date: string; endDate?: string; time?: string; location?: string; category?: string; image?: unknown; summary?: string; link?: unknown; slug?: string }

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function EventsRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'list';
  const dayAgo = ctx.now.getTime() - 86_400_000;
  let items = toArray<EventItem>(props.items)
    .map((e) => ({ e, d: parseDate(e.date), end: parseDate(e.endDate) }))
    .filter((x) => props.showPast || !x.d || (x.end ?? x.d).getTime() >= dayAgo)
    .sort((a, b) => (a.d?.getTime() ?? 0) - (b.d?.getTime() ?? 0));
  if (props.limit) items = items.slice(0, Number(props.limit));
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(ctx.locale, { timeZone: 'UTC', ...o }).format(d);
  const link = (e: EventItem) => e.link ?? (e.slug && props.__boundCollection ? ctx.collectionItemPath(String(props.__boundCollection), e.slug) : undefined);
  const level = subLevel(props.headingLevel);
  const range = (d: Date | null, end: Date | null) => (d ? `${fmt(d, { day: 'numeric', month: 'long', year: 'numeric' })}${end ? ` – ${fmt(end, { day: 'numeric', month: 'long' })}` : ''}` : '');
  let body: ReactNode;
  if (!items.length) body = <p className="a-muted a-events__empty">{props.emptyText}</p>;
  else if (variant === 'cards') {
    body = (
      <div className="a-grid a-events__grid" style={gridVars(props.columns)}>
        {items.map(({ e, d, end }, i) => {
          const href = link(e);
          const inner = (
            <>
              <div className="a-event-card__media">
                <Frame ctx={ctx} media={e.image} aspect="4:3" sizes={gridSizes(Number(props.columns ?? 3))} rounded="sm" />
                {d ? <time className="a-event-card__date" dateTime={e.date}><span>{fmt(d, { day: '2-digit' })}</span>{fmt(d, { month: 'short' })}</time> : null}
              </div>
              <div className="a-card__body">
                {e.category ? <span className="a-tag">{e.category}</span> : null}
                <Heading as={level} text={e.title} className="a-card-title" {...editProp(ctx, `items.${i}.title`)} />
                <ul className="a-meta">
                  {d ? <li><Icon name="calendar" size={14} />{range(d, end)}</li> : null}
                  {e.time ? <li><Icon name="clock" size={14} />{e.time}</li> : null}
                  {e.location ? <li><Icon name="map-pin" size={14} />{e.location}</li> : null}
                </ul>
                {e.summary ? <p className="a-muted a-small">{e.summary}</p> : null}
              </div>
            </>
          );
          return href ? <ALink key={i} ctx={ctx} link={href as string} className="a-card a-event-card a-hover-zoom">{inner}</ALink> : <article key={i} className="a-card a-event-card">{inner}</article>;
        })}
      </div>
    );
  } else {
    body = (
      <ul className="a-events__list">
        {items.map(({ e, d, end }, i) => {
          const href = link(e);
          return (
            <li key={i} className="a-event-row">
              {d ? (
                <time className="a-event-row__date" dateTime={e.date}>
                  <span className="a-event-row__day">{fmt(d, { day: '2-digit' })}</span>
                  <span className="a-event-row__month">{fmt(d, { month: 'short', year: 'numeric' })}</span>
                </time>
              ) : <span />}
              <div className="a-event-row__body">
                {e.category ? <span className="a-tag">{e.category}</span> : null}
                <Heading as={level} text={e.title} className="a-event-row__title" {...editProp(ctx, `items.${i}.title`)} />
                {e.summary ? <p className="a-muted a-small">{e.summary}</p> : null}
              </div>
              <ul className="a-meta a-event-row__meta">
                {end ? <li><Icon name="calendar" size={14} />{range(d, end)}</li> : null}
                {e.time ? <li><Icon name="clock" size={14} />{e.time}</li> : null}
                {e.location ? <li><Icon name="map-pin" size={14} />{e.location}</li> : null}
              </ul>
              {href ? <ALink ctx={ctx} link={href as string} className="a-event-row__link" label={`${e.title} — details`}><Icon name="arrow-up-right" size={20} /></ALink> : <span />}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {body}
      <Buttons ctx={ctx} buttons={props.buttons} className="a-section__actions" />
    </Section>
  );
}

// ---------------------------------------------------------------- attractions

export function AttractionsRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'list';
  const items = toArray<{ name: string; distance?: string; category?: string; text?: string; image?: unknown; link?: unknown }>(props.items);
  const level = subLevel(props.headingLevel);
  if (variant === 'cards') {
    const n = Number(props.columns ?? 3);
    return (
      <Section rp={rp} labelled>
        <Intro ctx={ctx} props={props} nodeId={node.id} />
        <div className="a-grid" style={gridVars(n)}>
          {items.map((a, i) => {
            const inner = (
              <>
                <Frame ctx={ctx} media={a.image} aspect="4:3" sizes={gridSizes(n)} rounded="sm" />
                <div className="a-card__body">
                  {a.category ? <span className="a-tag">{a.category}</span> : null}
                  <Heading as={level} text={a.name} className="a-card-title" {...editProp(ctx, `items.${i}.name`)} />
                  {a.distance ? <p className="a-meta"><span><Icon name="navigation" size={14} />{a.distance}</span></p> : null}
                  {a.text ? <p className="a-muted a-small">{a.text}</p> : null}
                </div>
              </>
            );
            return a.link ? <ALink key={i} ctx={ctx} link={a.link as string} className="a-card a-hover-zoom">{inner}</ALink> : <article key={i} className="a-card">{inner}</article>;
          })}
        </div>
      </Section>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <ul className="a-attractions" style={{ '--cols': props.columns ?? 2 } as CSSProperties}>
        {items.map((a, i) => (
          <li key={i} className="a-attraction">
            <div className="a-attraction__head">
              <Heading as={level} text={a.name} className="a-attraction__name" {...editProp(ctx, `items.${i}.name`)} />
              {a.distance ? <span className="a-attraction__dist">{a.distance}</span> : null}
            </div>
            {a.category ? <span className="a-tag">{a.category}</span> : null}
            {a.text ? <p className="a-muted a-small">{a.text}</p> : null}
            {a.link ? <ALink ctx={ctx} link={a.link as string} className="a-btn a-btn--link"><span className="a-btn__label">More</span><Icon name="arrow-right" size={14} className="a-btn__icon" /></ALink> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------- booking CTA

export function BookingCtaRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'bar';
  const widget = (
    <BookingWidget
      bookingUrl={props.bookingUrl}
      arrivalParam={props.arrivalParam}
      departureParam={props.departureParam}
      guestsParam={props.guestsParam}
      childrenParam={props.childrenParam}
      showChildren={props.showChildren}
      promoParam={props.promoParam}
      extraParams={props.extraParams}
      maxGuests={props.maxGuests ?? 6}
      defaultNights={props.defaultNights ?? 2}
      buttonLabel={props.buttonLabel ?? 'Check availability'}
      newTab={props.newTab}
      editor={ctx.mode === 'editor'}
      compact={variant === 'bar'}
    />
  );
  const copy = (
    <div className="a-booking__copy">
      {props.eyebrow ? <p className="a-eyebrow" {...editProp(ctx, 'eyebrow')}>{props.eyebrow}</p> : null}
      {props.heading ? <h2 className="a-heading a-booking__heading" id={headingId(node.id)} {...editProp(ctx, 'heading')}><Rich text={props.heading} /></h2> : null}
      {props.text ? <p className="a-muted a-small" {...editProp(ctx, 'text')}><Rich text={props.text} /></p> : null}
    </div>
  );
  return (
    <Section rp={rp} labelled width={variant === 'card' ? 'narrow' : props.containerWidth}>
      <div className={cx('a-booking', `a-booking--${variant}`)}>
        {copy}
        {widget}
      </div>
    </Section>
  );
}

export const HOSPITALITY_CSS = /* css */ `
/* rooms */
.atrium-site .a-room__body{display:grid;gap:.75rem}
.atrium-site .a-room__head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.35rem 1rem}
.atrium-site .a-room__from{font-family:var(--a-font-body);font-size:var(--a-text-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-room__facts{gap:.35rem 1rem}
.atrium-site .a-room__cta{justify-self:start;margin-top:.25rem}
.atrium-site .a-rooms__grid{row-gap:clamp(2.5rem,5vw,3.5rem)}
.atrium-site .a-rooms__list{display:grid;gap:clamp(4rem,9vw,8rem)}
.atrium-site .a-room-row{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,4fr);gap:clamp(2rem,6vw,6rem);align-items:end}
.atrium-site .a-room-row--flip{grid-template-columns:minmax(0,4fr) minmax(0,7fr)}
.atrium-site .a-room-row--flip .a-room-row__media{order:2}
.atrium-site .a-room-row__copy{display:grid;gap:1.1rem;justify-items:start;padding-bottom:1rem}
.atrium-site .a-room-row__num{font-family:var(--a-font-heading);font-size:var(--a-text-sm);color:var(--t-muted);letter-spacing:.1em}
.atrium-site .a-room-row__name{font-size:var(--a-text-4xl)}
.atrium-site .a-room-row__foot{display:flex;flex-wrap:wrap;align-items:center;gap:1rem 2rem;width:100%;padding-top:1.25rem;border-top:1px solid var(--t-border)}
@media (max-width:991px){.atrium-site .a-room-row,.atrium-site .a-room-row--flip{grid-template-columns:1fr}.atrium-site .a-room-row--flip .a-room-row__media{order:0}}

/* amenities */
.atrium-site .a-amenities__grid{row-gap:clamp(2rem,4vw,3rem);border-top:1px solid var(--t-border);padding-top:clamp(2rem,4vw,3rem)}
.atrium-site .a-amenity{display:grid;gap:.75rem;align-content:start}
.atrium-site .a-amenity__icon{color:var(--t-accent)}
.atrium-site .a-amenity__title{font-family:var(--a-font-heading);font-size:var(--a-text-lg);line-height:1.25}
.atrium-site .a-amenity__text{font-size:var(--a-text-sm);color:var(--t-muted)}
.atrium-site .a-amenities__list{display:grid;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:0 clamp(1.5rem,4vw,3rem);border-top:1px solid var(--t-border)}
.atrium-site .a-amenities__list li{display:flex;align-items:center;gap:.85rem;padding-block:.95rem;border-bottom:1px solid var(--t-border);font-size:var(--a-text-sm)}
.atrium-site .a-amenities__list .a-icon{color:var(--t-accent)}
@media (max-width:767px){.atrium-site .a-amenities__list{grid-template-columns:1fr 1fr}}
.atrium-site .a-tile{position:relative;margin:0;overflow:hidden;border-radius:var(--a-radius-sm)}
.atrium-site .a-tile::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 45%,color-mix(in srgb,var(--a-color-inverse) 75%,transparent));pointer-events:none}
.atrium-site .a-tile__caption{position:absolute;left:0;right:0;bottom:0;z-index:1;display:grid;gap:.25rem;padding:1.25rem;color:var(--a-color-inverse-text)}
.atrium-site .a-tile__title{font-family:var(--a-font-heading);font-size:var(--a-text-xl)}
.atrium-site .a-tile__text{font-size:var(--a-text-xs);opacity:.85}

/* offers */
.atrium-site .a-offer{display:flex;flex-direction:column;gap:1.25rem;min-width:0}
.atrium-site .a-offer__media{position:relative}
.atrium-site .a-offer__badge{position:absolute;top:1rem;left:1rem;z-index:2;padding:.4rem .8rem;background:var(--a-color-background);color:var(--a-color-text);font-size:var(--a-text-xs);font-weight:600;letter-spacing:.1em;text-transform:uppercase;border-radius:var(--a-radius-full)}
.atrium-site .a-offer__body{display:grid;gap:.9rem;align-content:start;flex:1}
.atrium-site .a-offer__incl{font-size:var(--a-text-sm)}
.atrium-site .a-offer__foot{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem 1rem;padding-top:.9rem;border-top:1px solid var(--t-border)}
.atrium-site .a-offer__valid{display:inline-flex;align-items:center;gap:.4rem;font-size:var(--a-text-xs);color:var(--t-muted)}
.atrium-site .a-offer__cta{justify-self:start}
.atrium-site .a-offers__list{display:grid;gap:clamp(2rem,4vw,3rem)}
.atrium-site .a-offer--row{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(1.5rem,4vw,3.5rem);align-items:center;padding-bottom:clamp(2rem,4vw,3rem);border-bottom:1px solid var(--t-border)}
.atrium-site .a-offers__featured{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:clamp(2rem,4vw,3.5rem)}
.atrium-site .a-offers__rest{display:grid;gap:clamp(2rem,4vw,3rem);align-content:start}
.atrium-site .a-offer--feature .a-offer__title{font-size:var(--a-text-3xl)}
@media (max-width:991px){.atrium-site .a-offers__featured,.atrium-site .a-offer--row{grid-template-columns:1fr}}

/* dining */
.atrium-site .a-dining__split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(2.5rem,7vw,7rem);align-items:center}
.atrium-site .a-dining__split--right .a-dining__media{order:2}
.atrium-site .a-dining__media{position:relative;padding-bottom:12%}
.atrium-site .a-dining__media>.a-frame:first-child{width:86%}
.atrium-site .a-dining__split--right .a-dining__media>.a-frame:first-child{margin-left:auto}
.atrium-site .a-dining__detail{position:absolute!important;right:0;bottom:0;width:40%;box-shadow:0 0 0 clamp(.5rem,1vw,.85rem) var(--t-bg)}
.atrium-site .a-dining__split--right .a-dining__detail{right:auto;left:0}
.atrium-site .a-dining__copy{display:grid;gap:clamp(1rem,2vw,1.4rem);justify-items:start}
.atrium-site .a-dining__heading{font-size:var(--a-text-4xl)}
.atrium-site .a-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:1rem 2rem;width:100%}
.atrium-site .a-info dt{font-size:var(--a-text-xs);letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-info dd{margin:.3rem 0 0;font-family:var(--a-font-heading);font-size:var(--a-text-lg)}
.atrium-site .a-dining__highlights{padding-block:1.1rem;border-block:1px solid var(--t-border)}
.atrium-site .a-dining__hours{display:grid;gap:.75rem;width:100%}
.atrium-site .a-dining__hours-title{display:inline-flex;align-items:center;gap:.5rem;font-size:var(--a-text-xs);font-weight:600;letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase}
.atrium-site .a-info--rows{grid-template-columns:1fr;gap:0}
.atrium-site .a-info--rows div{display:flex;justify-content:space-between;gap:1rem;padding-block:.55rem;border-bottom:1px dashed var(--t-border)}
.atrium-site .a-info--rows dt{font-size:var(--a-text-sm);letter-spacing:0;text-transform:none;color:var(--t-text)}
.atrium-site .a-info--rows dd{margin:0;font-family:var(--a-font-body);font-size:var(--a-text-sm);color:var(--t-muted);font-variant-numeric:tabular-nums}
.atrium-site .a-dining__feature{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));align-items:center}
.atrium-site .a-dining__hero{grid-column:1/10;grid-row:1}
.atrium-site .a-dining__card{grid-column:8/13;grid-row:1;position:relative;z-index:2;padding:clamp(1.75rem,4vw,3.25rem);background:var(--t-bg);border-radius:var(--a-radius-sm);box-shadow:var(--a-shadow-md)}
.atrium-site .a-dining__feature--right .a-dining__hero{grid-column:4/13}
.atrium-site .a-dining__feature--right .a-dining__card{grid-column:1/6}
.atrium-site .a-tone-surface .a-dining__card{background:var(--a-color-background)}
@media (max-width:991px){.atrium-site .a-dining__split{grid-template-columns:1fr}.atrium-site .a-dining__split--right .a-dining__media{order:0}.atrium-site .a-dining__feature{display:block}.atrium-site .a-dining__card{margin:-3rem 1rem 0}}

/* menu */
.atrium-site .a-menu__cats{display:grid;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr));gap:clamp(2.5rem,5vw,4rem) clamp(2.5rem,7vw,6rem)}
@media (max-width:767px){.atrium-site .a-menu__cats{grid-template-columns:1fr}}
.atrium-site .a-menu__cat{display:grid;gap:1rem;align-content:start}
.atrium-site .a-menu__catname{font-size:var(--a-text-2xl);padding-bottom:.75rem;border-bottom:1px solid var(--t-border)}
.atrium-site .a-menu__catname:empty{display:none}
.atrium-site .a-menu__items{display:grid;gap:1.25rem}
.atrium-site .a-menu__item{display:grid;gap:.3rem}
.atrium-site .a-menu__line{display:flex;align-items:baseline;gap:.6rem}
.atrium-site .a-menu__name{font-family:var(--a-font-heading);font-size:var(--a-text-lg);line-height:1.25}
.atrium-site .a-menu__tags{display:inline-flex;gap:.3rem}
.atrium-site .a-menu__tags abbr{padding:.05rem .35rem;border:1px solid var(--t-border);border-radius:var(--a-radius-full);font-size:.65rem;font-weight:600;letter-spacing:.05em;text-decoration:none;color:var(--t-muted)}
.atrium-site .a-menu__dots{flex:1;min-width:1.5rem;border-bottom:1px dotted color-mix(in srgb,var(--t-text) 35%,transparent);transform:translateY(-.3em)}
.atrium-site .a-menu__item:not(.a-menu__item--leader) .a-menu__price{margin-left:auto}
.atrium-site .a-menu__price{font-variant-numeric:tabular-nums;font-weight:500}
.atrium-site .a-menu__desc{font-size:var(--a-text-sm);color:var(--t-muted);max-width:34rem}
.atrium-site .a-menu__cats--grid .a-menu__cat{padding:clamp(1.5rem,3vw,2.25rem);background:var(--t-surface);border-radius:var(--a-radius-md)}
.atrium-site .a-menu__note{text-align:center;margin-top:clamp(2rem,4vw,3rem)}

/* experiences */
.atrium-site .a-exp__media{position:relative}
.atrium-site .a-exp__tag{position:absolute;top:1rem;left:1rem;z-index:2;padding:.35rem .75rem;border-radius:var(--a-radius-full);background:color-mix(in srgb,var(--a-color-background) 92%,transparent);color:var(--a-color-text);font-size:var(--a-text-xs);font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.atrium-site .a-exp__grid{row-gap:clamp(2.5rem,5vw,3.5rem)}
.atrium-site .a-exp__list{display:grid;border-top:1px solid var(--t-border)}
.atrium-site .a-exp-row{display:grid;grid-template-columns:minmax(7rem,14rem) minmax(0,1fr) auto;gap:clamp(1rem,3vw,2.5rem);align-items:center;padding-block:1.5rem;border-bottom:1px solid var(--t-border)}
.atrium-site .a-exp-row__body{display:grid;gap:.4rem}
.atrium-site .a-exp-row__meta{flex-direction:column;align-items:flex-end;gap:.5rem}
@media (max-width:767px){.atrium-site .a-exp-row{grid-template-columns:7rem 1fr}.atrium-site .a-exp-row__meta{grid-column:1/-1;flex-direction:row;align-items:center}}
.atrium-site .a-hscroll{overflow:hidden}
.atrium-site .a-hscroll__viewport{overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity;padding-inline:max(var(--a-gutter),calc((100vw - var(--a-container-wide)) / 2))}
.atrium-site .a-hscroll__viewport::-webkit-scrollbar{display:none}
html.a-motion-ready .atrium-site .a-hscroll[data-a-anim] .a-hscroll__viewport{overflow:visible;scroll-snap-type:none}
.atrium-site .a-hscroll__track{display:flex;gap:var(--a-gap);width:max-content;padding-right:var(--a-gutter)}
.atrium-site .a-hscroll__card{flex:none;scroll-snap-align:start}
.atrium-site .a-hscroll__card--sm{width:clamp(14rem,22vw,19rem)}.atrium-site .a-hscroll__card--md{width:clamp(16rem,28vw,26rem)}.atrium-site .a-hscroll__card--lg{width:clamp(18rem,40vw,36rem)}

/* venues */
.atrium-site .a-venue__head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}
.atrium-site .a-capacity{display:flex;flex-wrap:wrap;gap:.75rem 1.75rem;padding-block:.9rem;border-block:1px solid var(--t-border);width:100%}
.atrium-site .a-capacity div{display:grid;gap:.15rem}
.atrium-site .a-capacity dt{font-size:var(--a-text-xs);letter-spacing:.1em;text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-capacity dd{margin:0;font-family:var(--a-font-heading);font-size:var(--a-text-xl)}
.atrium-site .a-venues__detailed{display:grid;gap:clamp(4rem,9vw,7rem)}
.atrium-site .a-venue-row{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:clamp(2rem,6vw,5.5rem);align-items:center}
.atrium-site .a-venue-row--flip{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
.atrium-site .a-venue-row--flip>.a-frame{order:2}
.atrium-site .a-venue-row__copy{display:grid;gap:1rem;justify-items:start}
.atrium-site .a-venue-row__name{font-size:var(--a-text-4xl)}
.atrium-site .a-pills{display:flex;flex-wrap:wrap;gap:.5rem}
.atrium-site .a-venues__table{margin-top:clamp(3rem,6vw,5rem)}
@media (max-width:991px){.atrium-site .a-venue-row,.atrium-site .a-venue-row--flip{grid-template-columns:1fr}.atrium-site .a-venue-row--flip>.a-frame{order:0}}

/* events */
.atrium-site .a-events__list{display:grid;border-top:1px solid var(--t-border)}
.atrium-site .a-event-row{display:grid;grid-template-columns:7rem minmax(0,1fr) minmax(0,auto) 2.5rem;gap:clamp(1rem,3vw,2.5rem);align-items:center;padding-block:clamp(1.25rem,2.5vw,1.75rem);border-bottom:1px solid var(--t-border)}
.atrium-site .a-event-row__date{display:grid;line-height:1}
.atrium-site .a-event-row__day{font-family:var(--a-font-heading);font-size:var(--a-text-4xl)}
.atrium-site .a-event-row__month{margin-top:.35rem;font-size:var(--a-text-xs);letter-spacing:.12em;text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-event-row__body{display:grid;gap:.35rem}
.atrium-site .a-event-row__title{font-size:var(--a-text-xl)}
.atrium-site .a-event-row__meta{flex-direction:column;align-items:flex-start;gap:.3rem}
.atrium-site .a-event-row__link{display:grid;place-items:center;width:2.5rem;height:2.5rem;border:1px solid var(--t-border);border-radius:50%;transition:background-color .3s,color .3s}
.atrium-site .a-event-row__link:hover{background:var(--t-text);color:var(--t-bg)}
.atrium-site .a-event-row__link::after{content:"";position:absolute;inset:0}
.atrium-site .a-event-row{position:relative}
@media (max-width:767px){.atrium-site .a-event-row{grid-template-columns:4.5rem 1fr}.atrium-site .a-event-row__meta{grid-column:2}.atrium-site .a-event-row__link{display:none}}
.atrium-site .a-event-card__media{position:relative}
.atrium-site .a-event-card__date{position:absolute;top:1rem;left:1rem;z-index:2;display:grid;justify-items:center;min-width:3.5rem;padding:.5rem .6rem;background:var(--a-color-background);color:var(--a-color-text);border-radius:var(--a-radius-sm);font-size:var(--a-text-xs);letter-spacing:.1em;text-transform:uppercase;line-height:1.1}
.atrium-site .a-event-card__date span{font-family:var(--a-font-heading);font-size:var(--a-text-2xl);letter-spacing:0}
.atrium-site .a-events__empty{padding:2rem 0;border-block:1px solid var(--t-border)}

/* attractions */
.atrium-site .a-attractions{display:grid;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr));gap:0 clamp(2rem,6vw,5rem);border-top:1px solid var(--t-border)}
.atrium-site .a-attraction{display:grid;gap:.5rem;align-content:start;padding-block:1.5rem;border-bottom:1px solid var(--t-border)}
.atrium-site .a-attraction__head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}
.atrium-site .a-attraction__name{font-size:var(--a-text-xl)}
.atrium-site .a-attraction__dist{flex:none;font-size:var(--a-text-xs);color:var(--t-muted);letter-spacing:.04em;text-align:right}
@media (max-width:767px){.atrium-site .a-attractions{grid-template-columns:1fr}}

/* booking */
.atrium-site .a-booking{display:grid;gap:1.5rem}
.atrium-site .a-booking__copy{display:grid;gap:.5rem}
.atrium-site .a-booking__heading{font-size:var(--a-text-2xl)}
.atrium-site .a-booking__form{display:flex;flex-wrap:wrap;align-items:flex-end;gap:1rem}
.atrium-site .a-booking__field{display:grid;gap:.4rem;flex:1 1 9rem;min-width:0}
.atrium-site .a-booking__field label{font-size:var(--a-text-xs);font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-booking__field :is(input,select){width:100%;min-height:3rem;padding:.7rem .9rem;border:1px solid color-mix(in srgb,var(--t-text) 22%,transparent);border-radius:var(--a-radius-sm);background:var(--t-bg);color:var(--t-text);font-size:var(--a-text-sm);appearance:none}
.atrium-site .a-booking__field :is(input,select):focus{outline:none;border-color:var(--t-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--t-accent) 18%,transparent)}
.atrium-site .a-booking__submit .a-btn{min-height:3rem}
.atrium-site .a-booking__error{flex-basis:100%;font-size:var(--a-text-sm);color:var(--a-color-danger)}
.atrium-site .a-booking--bar{grid-template-columns:minmax(12rem,auto) minmax(0,1fr);align-items:end;gap:1.5rem clamp(2rem,4vw,4rem)}
.atrium-site .a-booking--inline{grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);align-items:center;gap:clamp(2rem,5vw,5rem)}
.atrium-site .a-booking--card{padding:clamp(1.75rem,4vw,3rem);border:1px solid var(--t-border);border-radius:var(--a-radius-md);background:var(--t-bg);box-shadow:var(--a-shadow-sm)}
.atrium-site .a-booking--card .a-booking__form{display:grid;grid-template-columns:1fr 1fr}
.atrium-site .a-booking--card .a-booking__submit{grid-column:1/-1}
.atrium-site .a-booking--card .a-booking__submit .a-btn{width:100%}
@media (max-width:991px){.atrium-site .a-booking--bar,.atrium-site .a-booking--inline{grid-template-columns:1fr}}
@media (max-width:540px){.atrium-site .a-booking__field{flex-basis:calc(50% - .5rem)}.atrium-site .a-booking__submit{flex-basis:100%}.atrium-site .a-booking__submit .a-btn{width:100%}}
`;
