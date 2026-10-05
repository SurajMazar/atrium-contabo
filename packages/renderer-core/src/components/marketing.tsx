import type { CSSProperties, ReactNode } from 'react';
import { Carousel } from '../islands/carousel';
import type { RenderContext, RenderProps } from '../types';
import { ALink, Btn, Buttons } from '../ui/actions';
import { cx, editProp, formatList, Heading, Paragraphs, part, plain, Rich, subLevel, toArray, type HeadingTag } from '../ui/core';
import { Icon } from '../ui/icon';
import { AImage, Frame, gridSizes, toMedia } from '../ui/media';
import { headingId, Intro, Section } from '../ui/section';

const cols = (n: unknown, def = 3) => {
  const c = Math.max(1, Number(n ?? def));
  return { '--cols': c, '--cols-t': Math.min(c, 2), '--cols-m': 1 } as CSSProperties;
};

function IconBadge({ name, style }: { name?: string; style?: string }) {
  if (!name) return null;
  return <span className={cx('a-icon-badge', `a-icon-badge--${style ?? 'plain'}`)}><Icon name={name} size={style === 'plain' ? 28 : 22} strokeWidth={1.25} /></span>;
}

// ---------------------------------------------------------------- CTA

export function CtaRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'centered';
  const image = toMedia(props.image);
  const copy = (align: string) => (
    <>
      <Intro ctx={ctx} props={props} nodeId={node.id} align={align} className="a-cta__intro" />
      <Buttons ctx={ctx} buttons={props.buttons} align={align === 'center' ? 'center' : undefined} asPart />
    </>
  );
  if (variant === 'image-background') {
    return (
      <Section rp={rp} container={false} className="a-on-media" labelled>
        {image ? <div className="a-cta__bg" data-a-bg=""><AImage ctx={ctx} media={image} sizes="100vw" /></div> : null}
        <div className="a-overlay" style={{ '--overlay': props.overlayOpacity ?? 0.45 } as CSSProperties} />
        <div className={cx('a-container', `a-container--${props.containerWidth ?? 'default'}`, 'a-cta__inner')}>{copy('center')}</div>
      </Section>
    );
  }
  if (variant === 'split') {
    return (
      <Section rp={rp} labelled>
        <div className={cx('a-cta__split', props.imageSide === 'left' && 'a-cta__split--left')}>
          <div className="a-cta__copy">{copy('left')}</div>
          <Frame ctx={ctx} media={image} aspect="4:3" sizes="(max-width: 991px) 100vw, 50vw" rounded="sm" />
        </div>
      </Section>
    );
  }
  if (variant === 'banner') {
    return (
      <Section rp={rp} labelled>
        <div className="a-cta__banner">
          <Intro ctx={ctx} props={props} nodeId={node.id} align="left" className="a-cta__intro" />
          <Buttons ctx={ctx} buttons={props.buttons} asPart />
        </div>
      </Section>
    );
  }
  return <Section rp={rp} labelled><div className="a-cta__center">{copy('center')}</div></Section>;
}

// ---------------------------------------------------------------- features

interface FeatureItem { icon?: string; image?: unknown; eyebrow?: string; title: string; text?: string; link?: unknown; linkLabel?: string }

export function FeaturesRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'grid';
  const items = toArray<FeatureItem>(props.items);
  const level = subLevel(props.headingLevel);
  const num = (i: number) => (props.numbered ? <span className="a-feature__num">{String(i + 1).padStart(2, '0')}</span> : null);
  const more = (it: FeatureItem, i: number) =>
    it.link ? (
      <ALink ctx={ctx} link={it.link as string} className="a-feature__more a-btn a-btn--link">
        <span className="a-btn__label" {...editProp(ctx, `items.${i}.linkLabel`)}>{it.linkLabel || 'Learn more'}</span>
        <Icon name="arrow-right" size={14} className="a-btn__icon" />
      </ALink>
    ) : null;

  let body: ReactNode;
  if (variant === 'alternating') {
    body = (
      <div className="a-features__alt">
        {items.map((it, i) => (
          <article key={i} className={cx('a-feature-row', i % 2 === 1 && 'a-feature-row--flip')}>
            <Frame ctx={ctx} media={it.image} aspect={props.imageAspect} sizes="(max-width: 991px) 100vw, 50vw" rounded="sm" className="a-feature-row__media" />
            <div className="a-feature-row__copy">
              {num(i) ?? (it.eyebrow ? <span className="a-eyebrow">{it.eyebrow}</span> : null)}
              <Heading as={level} text={it.title} className="a-feature-row__title" {...editProp(ctx, `items.${i}.title`)} />
              {it.text ? <Paragraphs text={it.text} className="a-muted" editName={`items.${i}.text`} ctx={ctx} /> : null}
              {more(it, i)}
            </div>
          </article>
        ))}
      </div>
    );
  } else if (variant === 'list') {
    body = (
      <ol className="a-features__list">
        {items.map((it, i) => (
          <li key={i} className="a-feature-line">
            <span className="a-feature-line__num">{it.icon ? <IconBadge name={it.icon} style={props.iconStyle} /> : String(i + 1).padStart(2, '0')}</span>
            <Heading as={level} text={it.title} className="a-feature-line__title" {...editProp(ctx, `items.${i}.title`)} />
            <div className="a-feature-line__body">
              {it.text ? <p className="a-muted" {...editProp(ctx, `items.${i}.text`)}><Rich text={it.text} /></p> : null}
              {more(it, i)}
            </div>
          </li>
        ))}
      </ol>
    );
  } else if (variant === 'cards') {
    body = (
      <div className="a-grid a-features__cards" style={cols(props.columns)}>
        {items.map((it, i) => {
          const inner = (
            <>
              <Frame ctx={ctx} media={it.image} aspect={props.imageAspect} sizes={gridSizes(Number(props.columns ?? 3))} rounded="sm" />
              <div className="a-card__body">
                {it.eyebrow ? <span className="a-tag">{it.eyebrow}</span> : null}
                <Heading as={level} text={it.title} className="a-card-title" {...editProp(ctx, `items.${i}.title`)} />
                {it.text ? <p className="a-muted a-small" {...editProp(ctx, `items.${i}.text`)}><Rich text={it.text} /></p> : null}
                {it.link ? <span className="a-feature__more a-btn a-btn--link"><span className="a-btn__label">{it.linkLabel || 'Discover'}</span><Icon name="arrow-right" size={14} className="a-btn__icon" /></span> : null}
              </div>
            </>
          );
          return it.link ? <ALink key={i} ctx={ctx} link={it.link as string} className="a-card a-hover-zoom">{inner}</ALink> : <article key={i} className="a-card">{inner}</article>;
        })}
      </div>
    );
  } else if (variant === 'icon-row') {
    body = (
      <ul className="a-features__row" style={{ '--cols': Math.max(1, Number(props.columns ?? items.length)) } as CSSProperties}>
        {items.map((it, i) => (
          <li key={i} className="a-feature-chip">
            <IconBadge name={it.icon ?? 'sparkle'} style={props.iconStyle === 'plain' ? 'circle' : props.iconStyle} />
            <span className="a-feature-chip__title" {...editProp(ctx, `items.${i}.title`)}>{it.title}</span>
            {it.text ? <span className="a-muted a-small">{it.text}</span> : null}
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <div className="a-grid a-features__grid" style={cols(props.columns)}>
        {items.map((it, i) => (
          <article key={i} className="a-feature">
            {num(i)}
            {it.image && !it.icon ? <Frame ctx={ctx} media={it.image} aspect="3:2" sizes={gridSizes(Number(props.columns ?? 3))} rounded="sm" /> : <IconBadge name={it.icon} style={props.iconStyle} />}
            <Heading as={level} text={it.title} className="a-feature__title" {...editProp(ctx, `items.${i}.title`)} />
            {it.text ? <p className="a-muted" {...editProp(ctx, `items.${i}.text`)}><Rich text={it.text} /></p> : null}
            {more(it, i)}
          </article>
        ))}
      </div>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {body}
      <Buttons ctx={ctx} buttons={props.buttons} align={props.align} className="a-section__actions" />
    </Section>
  );
}

// ---------------------------------------------------------------- stats

export function StatsRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'inline';
  const items = toArray<{ value: string; label: string; description?: string; prefix?: string; suffix?: string }>(props.items);
  const n = Math.max(1, Number(props.columns ?? items.length ?? 4));
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <dl className={cx('a-stats', `a-stats--${variant}`, props.dividers !== false && 'a-stats--dividers')} style={{ '--cols': n, '--cols-t': Math.min(n, 2), '--cols-m': variant === 'large' ? 1 : 2 } as CSSProperties}>
        {items.map((s, i) => (
          <div key={i} className="a-stat">
            <dt className="a-stat__label" {...editProp(ctx, `items.${i}.label`)}>{s.label}</dt>
            <dd className="a-stat__value">
              {s.prefix ? <span className="a-stat__affix">{s.prefix}</span> : null}
              <span {...editProp(ctx, `items.${i}.value`)}>{s.value}</span>
              {s.suffix ? <span className="a-stat__affix">{s.suffix}</span> : null}
            </dd>
            {s.description ? <dd className="a-stat__desc">{s.description}</dd> : null}
          </div>
        ))}
      </dl>
    </Section>
  );
}

// ---------------------------------------------------------------- testimonials

interface Testimonial { quote: string; author: string; role?: string; avatar?: unknown; rating?: number; source?: string }

function Stars({ rating }: { rating?: number }) {
  if (!rating) return null;
  const r = Math.round(Math.max(0, Math.min(5, rating)));
  return (
    <span className="a-stars" role="img" aria-label={`Rated ${r} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => <Icon key={i} name="star" size={14} className={i < r ? 'is-on' : undefined} />)}
    </span>
  );
}

function TestimonialCard({ ctx, t, i, showRating, large }: { ctx: RenderContext; t: Testimonial; i: number; showRating: boolean; large?: boolean }) {
  return (
    <figure className={cx('a-testimonial', large && 'a-testimonial--large')}>
      {showRating ? <Stars rating={t.rating} /> : null}
      <blockquote className="a-testimonial__quote" {...editProp(ctx, `items.${i}.quote`)}><p><Rich text={t.quote} /></p></blockquote>
      <figcaption className="a-testimonial__by">
        {toMedia(t.avatar) ? <AImage ctx={ctx} media={t.avatar} className="a-testimonial__avatar" sizes="3rem" alt="" /> : null}
        <span>
          <span className="a-testimonial__author" {...editProp(ctx, `items.${i}.author`)}>{t.author}</span>
          {t.role || t.source ? <span className="a-testimonial__role">{[t.role, t.source].filter(Boolean).join(' · ')}</span> : null}
        </span>
      </figcaption>
    </figure>
  );
}

export function TestimonialsRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'carousel';
  const items = toArray<Testimonial>(props.items);
  const showRating = props.showRating !== false;
  let body: ReactNode;
  if (variant === 'single' || items.length === 1) {
    body = items[0] ? <TestimonialCard ctx={ctx} t={items[0]} i={0} showRating={showRating} large /> : null;
  } else if (variant === 'grid') {
    body = <div className="a-grid a-testimonials__grid" style={cols(props.columns)}>{items.map((t, i) => <TestimonialCard key={i} ctx={ctx} t={t} i={i} showRating={showRating} />)}</div>;
  } else {
    body = (
      <Carousel label="Testimonials" layout="full" autoplay={props.autoplay} interval={8} paused={ctx.mode === 'editor'} className="a-testimonials__carousel">
        {items.map((t, i) => <TestimonialCard key={i} ctx={ctx} t={t} i={i} showRating={showRating} large />)}
      </Carousel>
    );
  }
  return (
    <Section rp={rp} labelled width={variant === 'grid' ? props.containerWidth : props.containerWidth === 'default' ? 'narrow' : props.containerWidth}>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {body}
    </Section>
  );
}

// ---------------------------------------------------------------- FAQ

export function FaqList({ ctx, items, allowMultiple, openFirst, groupName, editBase = 'items', titleKey = 'question', bodyKey = 'answer', boxed }: { ctx: RenderContext; items: Array<Record<string, string>>; allowMultiple?: boolean; openFirst?: boolean; groupName: string; editBase?: string; titleKey?: string; bodyKey?: string; boxed?: boolean }) {
  return (
    <div className={cx('a-accordion', boxed && 'a-accordion--boxed')}>
      {items.map((it, i) => (
        <details key={i} className="a-accordion__item" open={openFirst && i === 0 ? true : undefined} {...(allowMultiple === false ? { name: groupName } : {})}>
          <summary className="a-accordion__summary">
            <span {...editProp(ctx, `${editBase}.${i}.${titleKey}`)}><Rich text={it[titleKey]} /></span>
            <span className="a-accordion__icon" aria-hidden="true" />
          </summary>
          <div className="a-accordion__body">
            <Paragraphs text={it[bodyKey]} ctx={ctx} editName={`${editBase}.${i}.${bodyKey}`} />
          </div>
        </details>
      ))}
    </div>
  );
}

export function FaqRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'two-column';
  const items = toArray<Record<string, string>>(props.items);
  const list = <FaqList ctx={ctx} items={items} allowMultiple={props.allowMultiple} openFirst={props.openFirst} groupName={`faq-${node.id}`} />;
  if (variant === 'two-column') {
    return (
      <Section rp={rp} labelled>
        <div className="a-faq__split">
          <div className="a-faq__aside">
            <Intro ctx={ctx} props={props} nodeId={node.id} align="left" />
            {props.cta?.label ? <Btn ctx={ctx} button={props.cta} editName="cta.label" /> : null}
          </div>
          {list}
        </div>
      </Section>
    );
  }
  return (
    <Section rp={rp} labelled width={props.containerWidth === 'default' ? 'narrow' : props.containerWidth}>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {list}
      {props.cta?.label ? <div className="a-faq__cta"><Btn ctx={ctx} button={props.cta} /></div> : null}
    </Section>
  );
}

// ---------------------------------------------------------------- pricing

interface Plan { name: string; price: string; period?: string; description?: string; features?: string[]; cta?: Record<string, any>; highlighted?: boolean; badge?: string }

const isYes = (v: string) => /^(yes|true|✓|y|included|1)$/i.test(v.trim());
const isNo = (v: string) => /^(no|false|—|-|x|n|0|)$/i.test(v.trim());

export function Mark({ value }: { value: string }) {
  if (isYes(value)) return <span className="a-mark a-mark--yes"><Icon name="check" size={18} label="Included" /></span>;
  if (isNo(value)) return <span className="a-mark a-mark--no"><Icon name="minus" size={18} label="Not included" /></span>;
  return <>{value}</>;
}

export function PricingRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'cards';
  const plans = toArray<Plan>(props.plans);
  const level = subLevel(props.headingLevel);
  if (variant === 'table') {
    let rows = toArray<{ label: string; values: unknown }>(props.comparisonRows).map((r) => ({ label: r.label, values: formatList(r.values) }));
    if (!rows.length) {
      const all = [...new Set(plans.flatMap((p) => formatList(p.features)))];
      rows = all.map((f) => ({ label: f, values: plans.map((p) => (formatList(p.features).includes(f) ? 'yes' : 'no')) }));
    }
    return (
      <Section rp={rp} labelled>
        <Intro ctx={ctx} props={props} nodeId={node.id} />
        <div className="a-table-wrap">
          <table className="a-table a-pricing__table">
            <thead>
              <tr>
                <th scope="col"><span className="a-sr">Feature</span></th>
                {plans.map((p, i) => (
                  <th key={i} scope="col" className={cx(p.highlighted && 'is-highlight')}>
                    <span className="a-pricing__tname">{p.name}</span>
                    <span className="a-price">{p.price}{p.period ? <small>{p.period}</small> : null}</span>
                    {p.cta?.label ? <Btn ctx={ctx} button={p.cta} size="sm" /> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{r.label}</th>
                  {plans.map((p, j) => <td key={j} className={cx(p.highlighted && 'is-highlight')}><Mark value={r.values[j] ?? ''} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {props.footnote ? <p className="a-footnote">{props.footnote}</p> : null}
      </Section>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <div className="a-grid a-pricing__cards" style={cols(plans.length || 3)}>
        {plans.map((p, i) => (
          <article key={i} className={cx('a-plan', p.highlighted && 'a-plan--highlight')}>
            <header className="a-plan__head">
              <div className="a-plan__top">
                <Heading as={level} text={p.name} className="a-plan__name" {...editProp(ctx, `plans.${i}.name`)} />
                {p.badge ? <span className="a-pill">{p.badge}</span> : null}
              </div>
              <p className="a-plan__price"><span {...editProp(ctx, `plans.${i}.price`)}>{p.price}</span>{p.period ? <small>{p.period}</small> : null}</p>
              {p.description ? <p className="a-muted a-small">{p.description}</p> : null}
            </header>
            <ul className="a-check-list a-plan__features">
              {formatList(p.features).map((f, j) => <li key={j}><Icon name="check" size={16} /><span>{f}</span></li>)}
            </ul>
            {p.cta?.label ? <Btn ctx={ctx} button={p.cta} fullWidth className="a-plan__cta" /> : null}
          </article>
        ))}
      </div>
      {props.footnote ? <p className="a-footnote">{props.footnote}</p> : null}
    </Section>
  );
}

// ---------------------------------------------------------------- team

export function TeamRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'grid';
  const members = toArray<{ name: string; role?: string; bio?: string; photo?: unknown; links?: Array<{ label: string; url: string }> }>(props.members);
  const level = subLevel(props.headingLevel);
  const links = (m: (typeof members)[number]) =>
    m.links?.length ? <ul className="a-member__links">{m.links.map((l, j) => <li key={j}><a href={l.url} target="_blank" rel="noopener noreferrer" className="a-link">{l.label}</a></li>)}</ul> : null;
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {variant === 'list' ? (
        <div className="a-team__list">
          {members.map((m, i) => (
            <article key={i} className="a-member-row">
              <Frame ctx={ctx} media={m.photo} aspect={props.portraitAspect} sizes="(max-width: 767px) 40vw, 18rem" rounded="sm" />
              <div className="a-member-row__body">
                <Heading as={level} text={m.name} className="a-member__name" {...editProp(ctx, `members.${i}.name`)} />
                {m.role ? <p className="a-tag">{m.role}</p> : null}
                {m.bio ? <Paragraphs text={m.bio} className="a-muted" /> : null}
                {links(m)}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="a-grid a-team__grid" style={{ ...cols(props.columns, 4), '--cols-m': 2 } as CSSProperties}>
          {members.map((m, i) => (
            <article key={i} className="a-member">
              <Frame ctx={ctx} media={m.photo} aspect={props.portraitAspect} sizes={gridSizes(Number(props.columns ?? 4))} rounded="sm" />
              <div className="a-member__body">
                <Heading as={level} text={m.name} className="a-member__name" {...editProp(ctx, `members.${i}.name`)} />
                {m.role ? <p className="a-muted a-small">{m.role}</p> : null}
                {m.bio ? <p className="a-small a-member__bio">{m.bio}</p> : null}
                {links(m)}
              </div>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- timeline

export function TimelineRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'vertical';
  const items = toArray<{ date?: string; title: string; text?: string; image?: unknown }>(props.items);
  const level = subLevel(props.headingLevel);
  return (
    <Section rp={rp} labelled width={variant === 'steps' ? props.containerWidth : props.containerWidth === 'default' && variant === 'vertical' ? 'narrow' : props.containerWidth}>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <ol className={cx('a-timeline', `a-timeline--${variant}`)} style={variant === 'steps' ? ({ '--cols': Math.min(items.length || 1, 4) } as CSSProperties) : undefined}>
        {items.map((it, i) => (
          <li key={i} className="a-timeline__item">
            <span className="a-timeline__dot" aria-hidden="true">{variant === 'steps' ? String(i + 1).padStart(2, '0') : null}</span>
            <div className="a-timeline__body">
              {it.date ? <p className="a-timeline__date" {...editProp(ctx, `items.${i}.date`)}>{it.date}</p> : null}
              <Heading as={level} text={it.title} className="a-timeline__title" {...editProp(ctx, `items.${i}.title`)} />
              {it.text ? <p className="a-muted" {...editProp(ctx, `items.${i}.text`)}><Rich text={it.text} /></p> : null}
              {toMedia(it.image) ? <Frame ctx={ctx} media={it.image} aspect="3:2" sizes="(max-width: 767px) 100vw, 30rem" rounded="sm" className="a-timeline__img" /> : null}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ---------------------------------------------------------------- comparison table

export function ComparisonTableRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const columns = toArray<{ label: string; highlighted?: boolean }>(props.columns);
  const rows = toArray<{ label: string; values: unknown; note?: string }>(props.rows);
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      <div className="a-table-wrap">
        <table className={cx('a-table', props.stickyHeader !== false && 'a-table--sticky')}>
          {props.caption ? <caption className="a-sr">{props.caption}</caption> : !props.heading ? null : <caption className="a-sr">{plain(props.heading)}</caption>}
          <thead>
            <tr>
              <th scope="col"><span className="a-sr">Attribute</span></th>
              {columns.map((c, i) => <th key={i} scope="col" className={cx(c.highlighted && 'is-highlight')}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const values = formatList(r.values);
              return (
                <tr key={i}>
                  <th scope="row">{r.label}{r.note ? <span className="a-table__note">{r.note}</span> : null}</th>
                  {columns.map((c, j) => <td key={j} className={cx(c.highlighted && 'is-highlight')}><Mark value={values[j] ?? ''} /></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- content split

export function ContentSplitRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'standard';
  const facts = toArray<{ label: string; value: string }>(props.facts);
  const side = props.imageSide === 'right' ? 'right' : 'left';
  const level = (props.headingLevel as HeadingTag) ?? 'h2';
  const copy = (
    <div className={cx('a-split__copy', `a-split__copy--${props.verticalAlign ?? 'center'}`)}>
      {props.eyebrow ? <p className="a-eyebrow a-eyebrow--rule" {...part} {...editProp(ctx, 'eyebrow')}><Rich text={props.eyebrow} /></p> : null}
      <Heading as={level} text={props.heading} className="a-split__heading" id={headingId(node.id)} {...part} {...editProp(ctx, 'heading')} />
      {props.body ? <div {...part}><Paragraphs text={props.body} className="a-split__body" ctx={ctx} editName="body" /></div> : null}
      {facts.length ? (
        <dl className="a-facts" {...part}>
          {facts.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      ) : null}
      {props.signature ? <p className="a-split__signature" {...part}>{props.signature}</p> : null}
      <Buttons ctx={ctx} buttons={props.buttons} asPart />
    </div>
  );
  const sizes = variant === 'full-bleed' ? '(max-width: 991px) 100vw, 55vw' : '(max-width: 991px) 100vw, 50vw';
  const media =
    variant === 'collage' ? (
      <div className="a-split__collage">
        <Frame ctx={ctx} media={props.image} aspect={props.imageAspect} sizes={sizes} rounded="sm" className="a-split__main" />
        {toMedia(props.secondaryImage) ? <Frame ctx={ctx} media={props.secondaryImage} aspect="1:1" sizes="(max-width: 991px) 50vw, 22vw" rounded="sm" className="a-split__secondary" /> : null}
      </div>
    ) : (
      <Frame ctx={ctx} media={props.image} aspect={variant === 'full-bleed' ? undefined : props.imageAspect} sizes={sizes} rounded={variant === 'full-bleed' ? 'none' : 'sm'} className="a-split__media" />
    );
  return (
    <Section rp={rp} labelled container={variant !== 'full-bleed'} className={cx(`a-split--${side}`)}>
      {variant === 'full-bleed' ? (
        <div className="a-split__bleed">
          <div className="a-split__bleed-media" data-a-bg="">{media}</div>
          <div className="a-split__bleed-copy">{copy}</div>
        </div>
      ) : variant === 'overlap' ? (
        <div className="a-split__overlap">
          {media}
          <div className="a-split__panel">{copy}</div>
        </div>
      ) : (
        <div className="a-split__grid">
          {media}
          {copy}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- text section

export function TextSectionRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'intro';
  const level = (props.headingLevel as HeadingTag) ?? 'h2';
  if (variant === 'two-column') {
    return (
      <Section rp={rp} labelled>
        <div className="a-text2">
          <div className="a-text2__head">
            {props.eyebrow ? <p className="a-eyebrow a-eyebrow--rule" {...editProp(ctx, 'eyebrow')}>{props.eyebrow}</p> : null}
            <Heading as={level} text={props.heading} id={headingId(node.id)} className="a-text2__heading" {...editProp(ctx, 'heading')} data-a-text="" />
          </div>
          <div className="a-text2__body">
            <Paragraphs text={props.body} className="a-text2__prose" ctx={ctx} editName="body" />
            <Buttons ctx={ctx} buttons={props.buttons} />
          </div>
        </div>
      </Section>
    );
  }
  const statement = variant === 'statement';
  return (
    <Section rp={rp} labelled width={statement ? (props.containerWidth === 'default' ? 'default' : props.containerWidth) : 'narrow'}>
      <div className={cx('a-textsec', statement && 'a-textsec--statement', `a-textsec--${props.align ?? 'center'}`)}>
        {props.eyebrow ? <p className="a-eyebrow" {...editProp(ctx, 'eyebrow')}><Rich text={props.eyebrow} /></p> : null}
        <Heading as={level} text={props.heading} id={headingId(node.id)} className={cx('a-textsec__heading', statement && 'a-textsec__statement')} {...editProp(ctx, 'heading')} data-a-text="" />
        {props.body ? <Paragraphs text={props.body} className="a-textsec__body" ctx={ctx} editName="body" /> : null}
        <Buttons ctx={ctx} buttons={props.buttons} align={props.align === 'left' ? undefined : 'center'} />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- benefits

export function BenefitsRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'with-image';
  const items = toArray<{ title: string; text?: string; icon?: string }>(props.items);
  const level = subLevel(props.headingLevel);
  const list = (
    <ul className={cx('a-benefits', `a-benefits--${variant}`)} style={variant !== 'with-image' ? ({ '--cols': props.columns ?? 2, '--cols-t': Math.min(Number(props.columns ?? 2), 2) } as CSSProperties) : undefined}>
      {items.map((b, i) => (
        <li key={i} className="a-benefit">
          <span className="a-benefit__icon"><Icon name={b.icon ?? 'check'} size={variant === 'grid' ? 24 : 16} strokeWidth={variant === 'grid' ? 1.25 : 1.75} /></span>
          <span className="a-benefit__body">
            {variant === 'grid' ? <Heading as={level} text={b.title} className="a-benefit__title" {...editProp(ctx, `items.${i}.title`)} /> : <span className="a-benefit__title" {...editProp(ctx, `items.${i}.title`)}><Rich text={b.title} /></span>}
            {b.text ? <span className="a-benefit__text">{b.text}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
  if (variant === 'with-image') {
    return (
      <Section rp={rp} labelled>
        <div className={cx('a-split__grid', props.imageSide !== 'left' && 'a-split__grid--flip')}>
          <Frame ctx={ctx} media={props.image} aspect="4:5" sizes="(max-width: 991px) 100vw, 45vw" rounded="sm" className="a-split__media" />
          <div className="a-split__copy">
            <Intro ctx={ctx} props={props} nodeId={node.id} align="left" />
            {list}
            <Buttons ctx={ctx} buttons={props.buttons} />
          </div>
        </div>
      </Section>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {list}
      <Buttons ctx={ctx} buttons={props.buttons} align={props.align} className="a-section__actions" />
    </Section>
  );
}

export const MARKETING_CSS = /* css */ `
.atrium-site .a-section__actions{margin-top:clamp(2rem,4vw,3rem)}
.atrium-site .a-footnote{margin-top:1.5rem;font-size:var(--a-text-xs);color:var(--t-muted)}
.atrium-site .a-card{position:relative;display:flex;flex-direction:column;gap:1.1rem;min-width:0;color:inherit}
.atrium-site .a-card__body{display:grid;gap:.55rem;align-content:start}
.atrium-site .a-icon-badge{display:inline-flex;align-items:center;justify-content:center;color:var(--t-accent)}
.atrium-site .a-icon-badge--circle,.atrium-site .a-icon-badge--square{width:3.25rem;height:3.25rem;border:1px solid var(--t-border);background:color-mix(in srgb,var(--t-accent) 6%,transparent)}
.atrium-site .a-icon-badge--circle{border-radius:50%}.atrium-site .a-icon-badge--square{border-radius:var(--a-radius-md)}

/* cta */
.atrium-site .a-cta__center{display:grid;justify-items:center;gap:1.5rem;text-align:center}
.atrium-site .a-cta__center .a-intro{margin-bottom:0}
.atrium-site .a-cta .a-intro__heading{font-size:var(--a-text-5xl)}
.atrium-site .a-cta__banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1.5rem 3rem}
.atrium-site .a-cta__banner .a-intro{margin:0;max-width:40rem}
.atrium-site .a-cta__banner .a-intro__heading{font-size:var(--a-text-3xl)}
.atrium-site .a-cta__split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(2rem,6vw,6rem);align-items:center}
.atrium-site .a-cta__split--left .a-frame{order:-1}
.atrium-site .a-cta__copy{display:grid;gap:1.5rem}.atrium-site .a-cta__copy .a-intro{margin:0}
.atrium-site .a-cta--image-background{overflow:hidden;color:var(--a-color-inverse-text);background:var(--a-color-inverse)}
.atrium-site .a-cta__bg{position:absolute;inset:0}
.atrium-site .a-cta__bg .a-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.atrium-site .a-cta__inner{position:relative;z-index:2;display:grid;justify-items:center;gap:1.5rem;text-align:center;padding-block:clamp(2rem,8vw,6rem)}
.atrium-site .a-cta__inner .a-intro{margin:0}
@media (max-width:991px){.atrium-site .a-cta__split{grid-template-columns:1fr}.atrium-site .a-cta__split--left .a-frame{order:0}}

/* features */
.atrium-site .a-feature{display:grid;gap:1rem;align-content:start}
.atrium-site .a-feature__title{font-size:var(--a-text-xl)}
.atrium-site .a-feature__num{font-family:var(--a-font-heading);font-size:var(--a-text-sm);color:var(--t-muted);letter-spacing:.08em}
.atrium-site .a-feature__more{justify-self:start;margin-top:.25rem}
.atrium-site .a-features__grid{row-gap:clamp(2.5rem,5vw,4rem)}
.atrium-site .a-features__list{display:grid;border-top:1px solid var(--t-border)}
.atrium-site .a-feature-line{display:grid;grid-template-columns:4.5rem minmax(0,1fr) minmax(0,1.2fr);gap:1.5rem clamp(1.5rem,4vw,4rem);align-items:baseline;padding-block:clamp(1.5rem,3vw,2.25rem);border-bottom:1px solid var(--t-border)}
.atrium-site .a-feature-line__num{font-family:var(--a-font-heading);color:var(--t-muted)}
.atrium-site .a-feature-line__title{font-size:var(--a-text-2xl)}
.atrium-site .a-feature-line__body{display:grid;gap:.75rem}
@media (max-width:767px){.atrium-site .a-feature-line{grid-template-columns:3rem 1fr}.atrium-site .a-feature-line__body{grid-column:2}}
.atrium-site .a-features__alt{display:grid;gap:clamp(4rem,10vw,8rem)}
.atrium-site .a-feature-row{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:clamp(2rem,6vw,6rem);align-items:center}
.atrium-site .a-feature-row--flip{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
.atrium-site .a-feature-row--flip .a-feature-row__media{order:2}
.atrium-site .a-feature-row__copy{display:grid;gap:1.1rem;justify-items:start}
.atrium-site .a-feature-row__title{font-size:var(--a-text-3xl)}
@media (max-width:991px){.atrium-site .a-feature-row,.atrium-site .a-feature-row--flip{grid-template-columns:1fr}.atrium-site .a-feature-row--flip .a-feature-row__media{order:0}}
.atrium-site .a-features__cards{row-gap:clamp(2.5rem,5vw,3.5rem)}
.atrium-site .a-features__row{display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:1.5rem;border-block:1px solid var(--t-border);padding-block:clamp(1.5rem,3vw,2.5rem)}
.atrium-site .a-feature-chip{display:grid;justify-items:center;gap:.75rem;text-align:center}
.atrium-site .a-feature-chip__title{font-weight:500;font-size:var(--a-text-sm);letter-spacing:.02em}
@media (max-width:991px){.atrium-site .a-features__row{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:540px){.atrium-site .a-features__row{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* stats */
.atrium-site .a-stats{display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:clamp(1.5rem,3vw,2.5rem)}
.atrium-site .a-stat{display:flex;flex-direction:column-reverse;justify-content:flex-end;gap:.6rem;min-width:0}
.atrium-site .a-stat__desc{order:-1;font-size:var(--a-text-sm);color:var(--t-muted)}
.atrium-site .a-stat__value{display:flex;align-items:baseline;gap:.15em;margin:0;font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);font-size:var(--a-text-5xl);line-height:1;letter-spacing:-.02em;font-variant-numeric:lining-nums}
.atrium-site .a-stat__affix{font-size:.5em;color:var(--t-muted)}
.atrium-site .a-stat__label{font-size:var(--a-text-sm);color:var(--t-muted);line-height:1.45}
.atrium-site .a-stats--dividers.a-stats--inline .a-stat+.a-stat{padding-left:clamp(1.5rem,3vw,2.5rem);border-left:1px solid var(--t-border)}
.atrium-site .a-stats--cards .a-stat{padding:clamp(1.5rem,3vw,2.25rem);background:var(--t-surface);border-radius:var(--a-radius-md)}
.atrium-site .a-stats--large{gap:0}
.atrium-site .a-stats--large .a-stat{padding:clamp(1.5rem,3vw,2.5rem) clamp(1rem,2vw,2rem) clamp(1.5rem,3vw,2.5rem) 0;border-top:1px solid var(--t-border)}
.atrium-site .a-stats--large .a-stat__value{font-size:clamp(3.5rem,8vw,7.5rem)}
@media (max-width:991px){.atrium-site .a-stats{grid-template-columns:repeat(var(--cols-t,2),minmax(0,1fr))}.atrium-site .a-stats--dividers.a-stats--inline .a-stat:nth-child(odd){padding-left:0;border-left:0}}
@media (max-width:540px){.atrium-site .a-stats{grid-template-columns:repeat(var(--cols-m,2),minmax(0,1fr))}}

/* testimonials */
.atrium-site .a-testimonial{display:grid;gap:1.4rem;margin:0;align-content:start}
.atrium-site .a-testimonial__quote{font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);font-size:var(--a-text-xl);line-height:1.4;letter-spacing:var(--a-tracking-heading)}
.atrium-site .a-testimonial--large{justify-items:center;text-align:center}
.atrium-site .a-testimonial--large .a-testimonial__quote{font-size:var(--a-text-3xl);line-height:1.3;text-wrap:balance;max-width:48rem}
.atrium-site .a-testimonial__quote p::before{content:"\\201C"}.atrium-site .a-testimonial__quote p::after{content:"\\201D"}
.atrium-site .a-testimonial__by{display:flex;align-items:center;gap:.85rem;font-size:var(--a-text-sm)}
.atrium-site .a-testimonial__by>span{display:grid;gap:.15rem}
.atrium-site .a-testimonial--large .a-testimonial__by{justify-content:center;text-align:left}
.atrium-site .a-testimonial__avatar{width:3rem;height:3rem;border-radius:50%;object-fit:cover}
.atrium-site .a-testimonial__author{font-weight:600;letter-spacing:.02em}
.atrium-site .a-testimonial__role{color:var(--t-muted);font-size:var(--a-text-xs)}
.atrium-site .a-testimonials__grid .a-testimonial{padding:clamp(1.5rem,3vw,2.25rem);border:1px solid var(--t-border);border-radius:var(--a-radius-md)}
.atrium-site .a-testimonials__grid .a-testimonial__quote{font-size:var(--a-text-lg)}
.atrium-site .a-testimonials__carousel .a-carousel__controls{justify-content:center;gap:2rem}
.atrium-site .a-stars{display:inline-flex;gap:.15rem;color:var(--t-muted)}
.atrium-site .a-stars .is-on{color:var(--a-color-accent);fill:currentColor}

/* faq & accordion */
.atrium-site .a-faq__split{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(2rem,7vw,7rem);align-items:start}
.atrium-site .a-faq__aside{display:grid;gap:1.5rem;justify-items:start;position:sticky;top:calc(var(--a-header-h) + 2rem)}
.atrium-site .a-faq__aside .a-intro{margin:0}
.atrium-site .a-faq__cta{margin-top:2rem;text-align:center}
@media (max-width:991px){.atrium-site .a-faq__split{grid-template-columns:1fr}.atrium-site .a-faq__aside{position:static}}
.atrium-site .a-accordion{border-top:1px solid var(--t-border)}
.atrium-site .a-accordion__item{border-bottom:1px solid var(--t-border)}
.atrium-site .a-accordion__summary{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding:1.4rem 0;cursor:pointer;list-style:none;font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);font-size:var(--a-text-xl);line-height:1.3}
.atrium-site .a-accordion__summary::-webkit-details-marker{display:none}
.atrium-site .a-accordion__summary:hover{color:color-mix(in srgb,var(--t-text) 75%,transparent)}
.atrium-site .a-accordion__icon{position:relative;flex:none;width:1rem;height:1rem}
.atrium-site .a-accordion__icon::before,.atrium-site .a-accordion__icon::after{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:currentColor;transition:transform .35s var(--a-ease)}
.atrium-site .a-accordion__icon::after{transform:rotate(90deg)}
.atrium-site .a-accordion__item[open] .a-accordion__icon::after{transform:rotate(0)}
.atrium-site .a-accordion__body{padding:0 2.5rem 1.6rem 0;color:var(--t-muted);max-width:44rem}
.atrium-site .a-accordion__item[open] .a-accordion__body{animation:a-acc .4s var(--a-ease)}
@keyframes a-acc{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.atrium-site .a-accordion--boxed{display:grid;gap:.75rem;border:0}
.atrium-site .a-accordion--boxed .a-accordion__item{padding-inline:1.5rem;border:1px solid var(--t-border);border-radius:var(--a-radius-md);background:var(--t-surface)}

/* tables & pricing */
.atrium-site .a-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.atrium-site .a-table{width:100%;min-width:36rem;border-collapse:collapse;font-size:var(--a-text-sm)}
.atrium-site .a-table :is(th,td){padding:1rem 1.25rem;text-align:left;border-bottom:1px solid var(--t-border);vertical-align:middle}
.atrium-site .a-table thead th{font-weight:600;font-size:var(--a-text-xs);letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted);vertical-align:bottom}
.atrium-site .a-table tbody th{font-weight:500}
.atrium-site .a-table td{text-align:center}
.atrium-site .a-table thead th:not(:first-child){text-align:center}
.atrium-site .a-table .is-highlight{background:color-mix(in srgb,var(--t-accent) 6%,transparent)}
.atrium-site .a-table thead .is-highlight{color:var(--t-text)}
.atrium-site .a-table--sticky thead th{position:sticky;top:var(--a-header-h);background:var(--t-bg);z-index:1}
.atrium-site .a-table__note{display:block;font-weight:400;font-size:var(--a-text-xs);color:var(--t-muted)}
.atrium-site .a-mark{display:inline-flex;justify-content:center}
.atrium-site .a-mark--yes{color:var(--t-accent)}.atrium-site .a-mark--no{color:var(--t-muted);opacity:.6}
.atrium-site .a-pricing__table thead th{text-transform:none;letter-spacing:0;color:var(--t-text)}
.atrium-site .a-pricing__table thead th>*{display:block;margin-inline:auto}
.atrium-site .a-pricing__table thead th>*+*{margin-top:.5rem}
.atrium-site .a-pricing__tname{font-family:var(--a-font-heading);font-size:var(--a-text-xl)}
.atrium-site .a-plan{display:flex;flex-direction:column;gap:1.75rem;padding:clamp(1.75rem,3vw,2.5rem);border:1px solid var(--t-border);border-radius:var(--a-radius-md);background:var(--t-bg)}
.atrium-site .a-plan--highlight{background:var(--a-color-inverse);color:var(--a-color-inverse-text);border-color:var(--a-color-inverse);--t-text:var(--a-color-inverse-text);--t-muted:color-mix(in srgb,var(--a-color-inverse-text) 70%,transparent);--t-border:color-mix(in srgb,var(--a-color-inverse-text) 18%,transparent);--t-accent:var(--a-color-accent);--t-btn-bg:var(--a-color-inverse-text);--t-btn-text:var(--a-color-inverse);--t-bg:var(--a-color-inverse)}
.atrium-site .a-plan__head{display:grid;gap:.75rem}
.atrium-site .a-plan__top{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.atrium-site .a-plan__name{font-size:var(--a-text-xl)}
.atrium-site .a-plan__price{display:flex;align-items:baseline;gap:.5rem;font-family:var(--a-font-heading);font-size:var(--a-text-5xl);line-height:1;letter-spacing:-.02em}
.atrium-site .a-plan__price small{font-family:var(--a-font-body);font-size:var(--a-text-sm);letter-spacing:0;color:var(--t-muted)}
.atrium-site .a-plan__features{flex:1;font-size:var(--a-text-sm)}
.atrium-site .a-plan__cta{margin-top:auto}

/* team */
.atrium-site .a-member{display:grid;gap:1rem;align-content:start}
.atrium-site .a-member__body{display:grid;gap:.25rem}
.atrium-site .a-member__name{font-size:var(--a-text-lg)}
.atrium-site .a-member__bio{margin-top:.5rem;color:var(--t-muted)}
.atrium-site .a-member__links{display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin-top:.5rem;font-size:var(--a-text-sm)}
.atrium-site .a-team__list{display:grid;border-top:1px solid var(--t-border)}
.atrium-site .a-member-row{display:grid;grid-template-columns:minmax(8rem,14rem) minmax(0,1fr);gap:clamp(1.5rem,4vw,3.5rem);padding-block:clamp(1.75rem,3vw,2.5rem);border-bottom:1px solid var(--t-border);align-items:start}
.atrium-site .a-member-row__body{display:grid;gap:.75rem;max-width:44rem}
.atrium-site .a-member-row .a-member__name{font-size:var(--a-text-2xl)}
@media (max-width:540px){.atrium-site .a-member-row{grid-template-columns:7rem 1fr}}

/* timeline */
.atrium-site .a-timeline{position:relative;display:grid;gap:clamp(2rem,4vw,3rem)}
.atrium-site .a-timeline--vertical,.atrium-site .a-timeline--alternating{padding-left:2.25rem}
.atrium-site .a-timeline--vertical::before,.atrium-site .a-timeline--alternating::before{content:"";position:absolute;left:.35rem;top:.5rem;bottom:.5rem;width:1px;background:var(--t-border)}
.atrium-site .a-timeline__item{position:relative;display:grid}
.atrium-site .a-timeline__dot{position:absolute;left:-2.25rem;top:.45rem;width:.75rem;height:.75rem;border-radius:50%;background:var(--t-bg);border:1px solid var(--t-text)}
.atrium-site .a-timeline__body{display:grid;gap:.5rem}
.atrium-site .a-timeline__date{font-size:var(--a-text-xs);font-weight:600;letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-timeline__title{font-size:var(--a-text-2xl)}
.atrium-site .a-timeline__img{margin-top:.75rem;max-width:30rem}
@media (min-width:992px){
  .atrium-site .a-timeline--alternating{padding-left:0}
  .atrium-site .a-timeline--alternating::before{left:50%}
  .atrium-site .a-timeline--alternating .a-timeline__item{width:50%;padding-right:3.5rem}
  .atrium-site .a-timeline--alternating .a-timeline__item:nth-child(even){margin-left:50%;padding:0 0 0 3.5rem}
  .atrium-site .a-timeline--alternating .a-timeline__dot{left:auto;right:-.375rem}
  .atrium-site .a-timeline--alternating .a-timeline__item:nth-child(even) .a-timeline__dot{left:-.375rem;right:auto}
  .atrium-site .a-timeline--alternating .a-timeline__item:nth-child(odd){text-align:right}
  .atrium-site .a-timeline--alternating .a-timeline__item:nth-child(odd) .a-timeline__img{margin-left:auto}
}
.atrium-site .a-timeline--steps{grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:clamp(1.5rem,3vw,2.5rem)}
.atrium-site .a-timeline--steps .a-timeline__item{padding-top:1.5rem;border-top:1px solid var(--t-border)}
.atrium-site .a-timeline--steps .a-timeline__dot{position:static;width:auto;height:auto;border:0;border-radius:0;background:none;margin-bottom:1rem;font-family:var(--a-font-heading);font-size:var(--a-text-sm);color:var(--t-muted)}
.atrium-site .a-timeline--steps .a-timeline__title{font-size:var(--a-text-xl)}
@media (max-width:991px){.atrium-site .a-timeline--steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:540px){.atrium-site .a-timeline--steps{grid-template-columns:1fr}}

/* content split */
.atrium-site .a-split__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(2.5rem,7vw,7rem);align-items:center}
.atrium-site .a-split--right .a-split__grid>.a-split__copy,.atrium-site .a-split__grid--flip>.a-split__copy{order:-1}
.atrium-site .a-split__copy{display:grid;gap:clamp(1rem,2vw,1.4rem);justify-items:start;align-self:center}
.atrium-site .a-split__copy--start{align-self:start}.atrium-site .a-split__copy--end{align-self:end}
.atrium-site .a-split__heading{font-size:var(--a-text-4xl)}
.atrium-site .a-split__body{color:var(--t-muted);max-width:36rem}
.atrium-site .a-split__copy .a-actions{margin-top:.5rem}
.atrium-site .a-split__signature{font-family:var(--a-font-heading);font-style:italic;font-size:var(--a-text-lg)}
.atrium-site .a-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:1.25rem 2rem;width:100%;padding-block:1.25rem;border-block:1px solid var(--t-border)}
.atrium-site .a-facts dt{font-size:var(--a-text-xs);letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-facts dd{margin:.35rem 0 0;font-family:var(--a-font-heading);font-size:var(--a-text-xl)}
.atrium-site .a-split__collage{position:relative;padding:0 18% 14% 0}
.atrium-site .a-split--right .a-split__collage{padding:0 0 14% 18%}
.atrium-site .a-split__secondary{position:absolute!important;right:0;bottom:0;width:46%;box-shadow:0 0 0 clamp(.5rem,1vw,.85rem) var(--t-bg)}
.atrium-site .a-split--right .a-split__secondary{right:auto;left:0}
.atrium-site .a-split__overlap{position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));align-items:center}
.atrium-site .a-split__overlap>.a-frame{grid-column:1/9;grid-row:1}
.atrium-site .a-split__panel{grid-column:7/13;grid-row:1;position:relative;z-index:2;padding:clamp(1.75rem,4vw,3.5rem);background:var(--t-bg);border-radius:var(--a-radius-sm);box-shadow:var(--a-shadow-md)}
.atrium-site .a-split--right .a-split__overlap>.a-frame{grid-column:5/13}
.atrium-site .a-split--right .a-split__panel{grid-column:1/7}
.atrium-site .a-tone-surface .a-split__panel{background:var(--a-color-background)}
.atrium-site .a-split__bleed{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:stretch;min-height:36rem}
.atrium-site .a-split--right .a-split__bleed-media{order:2}
.atrium-site .a-split__bleed-media{position:relative;min-height:24rem}
.atrium-site .a-split__bleed-media .a-frame{position:absolute;inset:0}
.atrium-site .a-split__bleed-media .a-img{position:absolute!important;inset:0;height:100%!important}
.atrium-site .a-split__bleed-copy{display:flex;align-items:center;padding:clamp(2.5rem,7vw,7rem) var(--a-gutter)}
.atrium-site .a-split__bleed-copy .a-split__copy{max-width:34rem}
.atrium-site .a-content-split--full-bleed{padding-block:0}
@media (max-width:991px){
  .atrium-site .a-split__grid{grid-template-columns:1fr}
  .atrium-site .a-split--right .a-split__grid>.a-split__copy,.atrium-site .a-split__grid--flip>.a-split__copy{order:0}
  .atrium-site .a-split__overlap{display:block}
  .atrium-site .a-split__panel{margin:-4rem 1rem 0}
  .atrium-site .a-split__bleed{grid-template-columns:1fr}
  .atrium-site .a-split--right .a-split__bleed-media{order:0}
}

/* text section */
.atrium-site .a-textsec{display:grid;gap:clamp(1rem,2vw,1.5rem)}
.atrium-site .a-textsec--center{text-align:center;justify-items:center}
.atrium-site .a-textsec__heading{font-size:var(--a-text-4xl)}
.atrium-site .a-textsec__body{font-size:var(--a-text-lg);color:var(--t-muted);max-width:40rem}
.atrium-site .a-textsec--center .a-textsec__body{margin-inline:auto}
.atrium-site .a-textsec__statement{font-size:clamp(2rem,4.4vw,4rem);line-height:1.12;letter-spacing:-.015em;max-width:24ch}
.atrium-site .a-textsec--center .a-textsec__statement{margin-inline:auto}
.atrium-site .a-textsec--statement .a-textsec__body{font-size:var(--a-text-base)}
.atrium-site .a-text2{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(2rem,7vw,7rem);align-items:start}
.atrium-site .a-text2__head{display:grid;gap:1rem}
.atrium-site .a-text2__heading{font-size:var(--a-text-4xl)}
.atrium-site .a-text2__body{display:grid;gap:1.75rem;justify-items:start}
.atrium-site .a-text2__prose{font-size:var(--a-text-lg);line-height:1.7;color:var(--t-muted)}
.atrium-site .a-text2__prose.a-prose p:first-child{color:var(--t-text)}
@media (max-width:991px){.atrium-site .a-text2{grid-template-columns:1fr}}

/* benefits */
.atrium-site .a-benefits{display:grid;gap:1rem 2.5rem;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr))}
.atrium-site .a-benefits--with-image{grid-template-columns:1fr;gap:0;border-top:1px solid var(--t-border);width:100%}
.atrium-site .a-benefits--with-image .a-benefit,.atrium-site .a-benefits--list .a-benefit{padding-block:1rem;border-bottom:1px solid var(--t-border)}
.atrium-site .a-benefits--list{column-gap:clamp(2rem,5vw,4rem);row-gap:0;border-top:1px solid var(--t-border)}
.atrium-site .a-benefit{display:flex;gap:1rem;align-items:flex-start}
.atrium-site .a-benefit__icon{display:inline-flex;margin-top:.2em;color:var(--t-accent)}
.atrium-site .a-benefit__body{display:grid;gap:.3rem}
.atrium-site .a-benefit__text{font-size:var(--a-text-sm);color:var(--t-muted)}
.atrium-site .a-benefits--grid{gap:clamp(2rem,4vw,3rem)}
.atrium-site .a-benefits--grid .a-benefit{flex-direction:column;gap:1rem}
.atrium-site .a-benefits--grid .a-benefit__title{font-size:var(--a-text-xl)}
@media (max-width:767px){.atrium-site .a-benefits{grid-template-columns:1fr}}
`;
