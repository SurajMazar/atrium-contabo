import type { NavItem } from '@atrium/schema';
import type { CSSProperties, ReactNode } from 'react';
import { FormIsland } from '../islands/form';
import { HeaderBehavior } from '../islands/header-behavior';
import { MapFacade } from '../islands/map-facade';
import { publicPathFor } from '../routing';
import type { RenderContext, RenderProps } from '../types';
import { ALink, Btn } from '../ui/actions';
import { cx, editProp, Rich, root, toArray } from '../ui/core';
import { Icon, SOCIAL_LABELS } from '../ui/icon';
import { formIslandProps } from './forms';
import { mapEmbedUrl } from './contact';

// ---------------------------------------------------------------- shared bits

export function Brand({ ctx, text, className }: { ctx: RenderContext; text?: string; className?: string }) {
  const b = ctx.settings.branding;
  const name = text || b.wordmark || ctx.settings.name;
  const width = b.logoWidth ? { width: `${b.logoWidth}px` } : undefined;
  return (
    <a href={ctx.localizePath('/')} className={cx('a-brand', className)} aria-label={`${ctx.settings.name} — home`}>
      {b.logo ? (
        <>
          <img src={b.logo} alt="" className={cx('a-brand__logo', b.logoInverse && 'a-brand__logo--default')} style={width} decoding="async" />
          {b.logoInverse ? <img src={b.logoInverse} alt="" className="a-brand__logo a-brand__logo--inverse" style={width} decoding="async" /> : null}
        </>
      ) : (
        <span className="a-brand__word">{name}</span>
      )}
    </a>
  );
}

export function SocialList({ ctx, className, size = 18, networks, style = 'icons' }: { ctx: RenderContext; className?: string; size?: number; networks?: string[]; style?: string }) {
  const links = ctx.settings.social.filter((s) => s.visible !== false && s.url && (!networks?.length || networks.includes(s.network)));
  if (!links.length) return null;
  return (
    <ul className={cx('a-social', `a-social--${style}`, className)}>
      {links.map((s) => {
        const label = s.label ?? SOCIAL_LABELS[s.network] ?? s.network;
        return (
          <li key={s.id}>
            <a href={s.url} target={s.newTab === false ? undefined : '_blank'} rel="noopener noreferrer" aria-label={style === 'icons' ? label : undefined}>
              {style !== 'labels' ? <Icon name={s.icon ?? s.network} size={size} strokeWidth={1.5} /> : null}
              {style !== 'icons' ? <span>{label}</span> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function currentPath(ctx: RenderContext): string | undefined {
  if (!ctx.page) return undefined;
  return `${ctx.basePath}${publicPathFor(ctx.definition, ctx.page, ctx.locale, ctx.collectionItem)}`.replace(/(.)\/$/, '$1');
}

function isCurrent(ctx: RenderContext, item: NavItem, here?: string): boolean {
  if (!here || !item.link) return false;
  const href = ctx.resolveLink(item.link)?.href;
  if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) return false;
  const clean = href.split('#')[0]!.replace(/(.)\/$/, '$1');
  const home = ctx.localizePath('/');
  return clean === here || (clean !== home && here.startsWith(`${clean}/`));
}

function NavLink({ ctx, item, className, here, children }: { ctx: RenderContext; item: NavItem; className?: string; here?: string; children?: ReactNode }) {
  const current = isCurrent(ctx, item, here);
  return (
    <ALink ctx={ctx} link={item.link} className={cx(className, item.highlight && 'is-highlight', current && 'is-current')} aria-current={current ? 'page' : undefined}>
      {children ?? item.label}
    </ALink>
  );
}

function LanguageSwitcher({ ctx, className }: { ctx: RenderContext; className?: string }) {
  if (ctx.locales.length < 2) return null;
  return (
    <ul className={cx('a-langs', className)} aria-label="Language">
      {ctx.locales.map((loc) => {
        const href = ctx.page ? `${ctx.basePath}${publicPathFor(ctx.definition, ctx.page, loc, ctx.collectionItem)}` : ctx.localizePath('/', loc);
        return (
          <li key={loc}>
            <a href={href} hrefLang={loc} lang={loc} aria-current={loc === ctx.locale ? 'true' : undefined} className={loc === ctx.locale ? 'is-current' : undefined}>
              {loc.toUpperCase()}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- header

function DesktopNav({ ctx, items, here, uid, className }: { ctx: RenderContext; items: NavItem[]; here?: string; uid: string; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cx('a-nav', className)}>
      {items.map((item) => {
        const kids = item.children ?? [];
        const subId = `${uid}-${item.id}`;
        return (
          <li key={item.id} className={cx('a-nav__item', kids.length > 0 && 'has-children', item.mega && 'is-mega')}>
            {item.link ? <NavLink ctx={ctx} item={item} className="a-nav__link" here={here} /> : <span className="a-nav__link">{item.label}</span>}
            {kids.length ? (
              <>
                <button type="button" className="a-nav__caret" aria-expanded="false" aria-controls={subId} data-a-sub-toggle="">
                  <Icon name="chevron-down" size={14} />
                  <span className="a-sr">{`Show ${item.label} submenu`}</span>
                </button>
                <div className="a-nav__panel" id={subId}>
                  <ul className="a-nav__sub">
                    {kids.map((k) => (
                      <li key={k.id}>
                        <NavLink ctx={ctx} item={k} className="a-nav__sublink" here={here}>
                          {item.mega && k.image ? <img src={k.image} alt="" loading="lazy" decoding="async" className="a-nav__thumb" /> : null}
                          <span className="a-nav__sublabel">{k.label}</span>
                          {k.description ? <span className="a-nav__desc">{k.description}</span> : null}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function MobileNav({ ctx, items, here }: { ctx: RenderContext; items: NavItem[]; here?: string }) {
  return (
    <ul className="a-mnav">
      {items.map((item) => (
        <li key={item.id}>
          {item.children?.length ? (
            <details className="a-mnav__group">
              <summary>
                <span>{item.label}</span>
                <Icon name="plus" size={16} />
              </summary>
              <ul>
                {item.link ? <li><NavLink ctx={ctx} item={item} here={here}>{`All ${item.label.toLowerCase()}`}</NavLink></li> : null}
                {item.children.map((k) => <li key={k.id}><NavLink ctx={ctx} item={k} here={here} /></li>)}
              </ul>
            </details>
          ) : (
            <NavLink ctx={ctx} item={item} className="a-mnav__link" here={here} />
          )}
        </li>
      ))}
    </ul>
  );
}

function ContactBits({ ctx, className }: { ctx: RenderContext; className?: string }) {
  const b = ctx.settings.business;
  if (!b.phone && !b.email) return null;
  return (
    <ul className={cx('a-header__contact', className)}>
      {b.phone ? <li><a href={`tel:${b.phone.replace(/[^+\d]/g, '')}`}><Icon name="phone" size={14} />{b.phone}</a></li> : null}
      {b.email ? <li><a href={`mailto:${b.email}`}><Icon name="mail" size={14} />{b.email}</a></li> : null}
    </ul>
  );
}

export function SiteHeaderRenderer({ node, props, variant = 'classic', ctx, attrs }: RenderProps) {
  const items = ctx.definition.navigation.menus[props.menu ?? 'primary'] ?? [];
  const here = currentPath(ctx);
  const overlay = ctx.headerOverlay && props.transparentOnHero !== false;
  const uid = `nav-${node.id}`;
  const drawerId = `${uid}-drawer`;
  const cta = props.cta?.label ? <Btn ctx={ctx} button={props.cta} size="sm" className="a-header__cta" editName="cta.label" /> : null;
  const half = Math.ceil(items.length / 2);
  const showUtility = variant === 'stacked' || (props.showContact && variant !== 'minimal');
  return (
    <header
      {...root(attrs, 'a-header', `a-header--${variant}`, props.sticky !== false && 'a-header--sticky', overlay && 'a-header--overlay', showUtility && 'a-header--has-utility')}
      data-hide-on-scroll={props.hideOnScroll ? '' : undefined}
    >
      {showUtility ? (
        <div className="a-header__utility">
          <div className={cx('a-container', `a-container--${props.width ?? 'wide'}`, 'a-header__utility-inner')}>
            <ContactBits ctx={ctx} />
            <div className="a-header__utility-end">
              {props.showSocial ? <SocialList ctx={ctx} size={15} /> : null}
              {props.showLanguageSwitcher ? <LanguageSwitcher ctx={ctx} /> : null}
            </div>
          </div>
        </div>
      ) : null}
      <div className={cx('a-container', `a-container--${props.width ?? 'wide'}`, 'a-header__bar')}>
        {variant === 'centered' ? (
          <>
            <nav className="a-header__nav a-header__nav--left" aria-label="Primary"><DesktopNav ctx={ctx} items={items.slice(0, half)} here={here} uid={uid} /></nav>
            <Brand ctx={ctx} text={props.logoText} className="a-header__brand" />
            <div className="a-header__end">
              <nav className="a-header__nav a-header__nav--right" aria-label="Primary (continued)"><DesktopNav ctx={ctx} items={items.slice(half)} here={here} uid={uid} /></nav>
              {cta}
            </div>
          </>
        ) : (
          <>
            <Brand ctx={ctx} text={props.logoText} className="a-header__brand" />
            {variant !== 'minimal' ? <nav className="a-header__nav" aria-label="Primary"><DesktopNav ctx={ctx} items={items} here={here} uid={uid} /></nav> : null}
            <div className="a-header__end">
              {props.showSocial && !showUtility ? <SocialList ctx={ctx} size={16} className="a-header__social" /> : null}
              {props.showLanguageSwitcher && !showUtility ? <LanguageSwitcher ctx={ctx} className="a-header__langs" /> : null}
              {cta}
            </div>
          </>
        )}
        <button type="button" className="a-header__toggle" aria-expanded="false" aria-controls={drawerId} aria-label="Open menu" data-a-nav-toggle="">
          <span className="a-burger" aria-hidden="true"><span /><span /></span>
        </button>
      </div>
      <div className="a-header__drawer a-tone-inverse" id={drawerId} data-a-nav-drawer="" hidden>
        <div className="a-container a-header__drawer-inner">
          <nav aria-label="Menu"><MobileNav ctx={ctx} items={items} here={here} /></nav>
          <div className="a-header__drawer-foot">
            {props.cta?.label ? <Btn ctx={ctx} button={{ ...props.cta, style: 'primary' }} /> : null}
            <ContactBits ctx={ctx} className="a-header__contact--drawer" />
            <SocialList ctx={ctx} size={18} />
            {props.showLanguageSwitcher ? <LanguageSwitcher ctx={ctx} /> : null}
          </div>
        </div>
      </div>
      <HeaderBehavior hideOnScroll={!!props.hideOnScroll} editor={ctx.mode === 'editor'} />
    </header>
  );
}

// ---------------------------------------------------------------- footer

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function formatDays(days: string[]): string {
  if (days.length === 7) return 'Daily';
  const idx = days.map((d) => ORDER.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
  if (contiguous && idx.length > 2) return `${DAY_LABEL[ORDER[idx[0]!]!]}–${DAY_LABEL[ORDER[idx[idx.length - 1]!]!]}`;
  return idx.map((i) => DAY_LABEL[ORDER[i]!]).join(', ');
}

export function ContactDetails({ ctx, className, hours = true }: { ctx: RenderContext; className?: string; hours?: boolean }) {
  const b = ctx.settings.business;
  const address = b.address?.formatted ?? [b.address?.street, b.address?.locality, b.address?.region, b.address?.postalCode, b.address?.country].filter(Boolean).join(', ');
  return (
    <address className={cx('a-contact-details', className)}>
      {address ? <p>{b.mapsUrl ? <a href={b.mapsUrl} target="_blank" rel="noopener noreferrer" className="a-link">{address}</a> : address}</p> : null}
      {b.phone ? <p><a href={`tel:${b.phone.replace(/[^+\d]/g, '')}`} className="a-link">{b.phone}</a></p> : null}
      {b.email ? <p><a href={`mailto:${b.email}`} className="a-link">{b.email}</a></p> : null}
      {hours && b.openingHours?.length ? (
        <ul className="a-hours">
          {b.openingHours.map((h, i) => <li key={i}><span>{h.label ?? formatDays(h.days)}</span><span>{h.opens === '00:00' && h.closes === '23:59' ? '24 hours' : `${h.opens} – ${h.closes}`}</span></li>)}
        </ul>
      ) : null}
    </address>
  );
}

function FooterColumns({ ctx, columns }: { ctx: RenderContext; columns: Array<{ title: string; menu?: string; links?: Array<{ label: string; link: string }> }> }) {
  return (
    <>
      {columns.map((col, i) => {
        const items: Array<{ id: string; label: string; link?: unknown }> = col.menu
          ? (ctx.definition.navigation.menus[col.menu] ?? [])
          : toArray<{ label: string; link: string }>(col.links).map((l, j) => ({ id: `l${j}`, label: l.label, link: l.link }));
        return (
          <nav key={i} className="a-footer__col" aria-label={col.title}>
            <p className="a-footer__title">{col.title}</p>
            <ul>
              {items.map((it) => <li key={it.id}><ALink ctx={ctx} link={it.link as string} className="a-link">{it.label}</ALink></li>)}
            </ul>
          </nav>
        );
      })}
    </>
  );
}

export function SiteFooterRenderer({ node, props, variant = 'columns', ctx, attrs }: RenderProps) {
  const legal = ctx.definition.navigation.menus[props.legalMenu ?? 'legal'] ?? [];
  const columns = toArray<{ title: string; menu?: string; links?: Array<{ label: string; link: string }> }>(props.columns);
  const consent = ctx.settings.cookieConsent.enabled;
  const nl = props.showNewsletter && props.newsletterFormId ? formIslandProps(ctx, node.id, String(props.newsletterFormId), { layout: 'inline', submitLabel: 'Subscribe' }) : null;
  const bottom = (
    <div className="a-footer__bottom">
      <p className="a-footer__copy" {...editProp(ctx, 'copyright')}>{props.copyright}</p>
      <ul className="a-footer__legal">
        {legal.map((l) => <li key={l.id}><ALink ctx={ctx} link={l.link} className="a-link">{l.label}</ALink></li>)}
        {consent ? <li><button type="button" className="a-link a-footer__consent" data-a-consent-open="">Cookie settings</button></li> : null}
      </ul>
    </div>
  );
  const newsletter = nl ? (
    <div className="a-footer__newsletter">
      <p className="a-footer__title">{props.newsletterHeading}</p>
      <FormIsland {...nl} />
    </div>
  ) : null;
  const map = props.showMap ? (
    <div className="a-footer__map"><MapFacade embedUrl={mapEmbedUrl(ctx, { provider: 'google', query: '{{business.address}}', zoom: 13 })} title="Map" height="sm" rounded="sm" editor={ctx.mode === 'editor'} /></div>
  ) : null;

  if (variant === 'centered') {
    const menu = columns[0]?.menu ? ctx.definition.navigation.menus[columns[0].menu] ?? [] : ctx.definition.navigation.menus.primary ?? [];
    return (
      <footer {...root(attrs, 'a-footer', 'a-footer--centered', `a-tone-${props.tone ?? 'inverse'}`)}>
        <div className="a-container a-container--wide">
          <Brand ctx={ctx} className="a-footer__brand" />
          {props.description ? <p className="a-footer__desc" {...editProp(ctx, 'description')}><Rich text={props.description} /></p> : null}
          <nav aria-label="Footer"><ul className="a-footer__inline">{menu.map((m) => <li key={m.id}><ALink ctx={ctx} link={m.link} className="a-link">{m.label}</ALink></li>)}</ul></nav>
          {props.showContact ? <ContactDetails ctx={ctx} hours={false} className="a-footer__contact--inline" /> : null}
          {newsletter}
          {props.showSocial ? <SocialList ctx={ctx} size={20} /> : null}
          {bottom}
        </div>
      </footer>
    );
  }

  return (
    <footer {...root(attrs, 'a-footer', `a-footer--${variant}`, `a-tone-${props.tone ?? 'inverse'}`)}>
      <div className="a-container a-container--wide">
        {variant === 'statement' && props.statement ? (
          <div className="a-footer__statement">
            <p className="a-heading a-footer__statement-text" {...editProp(ctx, 'statement')}><Rich text={props.statement} /></p>
            {props.cta?.label ? <Btn ctx={ctx} button={props.cta} size="lg" editName="cta.label" /> : null}
          </div>
        ) : null}
        <div className="a-footer__grid" style={{ '--fcols': columns.length } as CSSProperties}>
          <div className="a-footer__about">
            <Brand ctx={ctx} className="a-footer__brand" />
            {props.description ? <p className="a-footer__desc" {...editProp(ctx, 'description')}><Rich text={props.description} /></p> : null}
            {props.showSocial ? <SocialList ctx={ctx} size={18} /> : null}
          </div>
          <FooterColumns ctx={ctx} columns={columns} />
          {props.showContact ? (
            <div className="a-footer__col">
              <p className="a-footer__title">Contact</p>
              <ContactDetails ctx={ctx} />
            </div>
          ) : null}
          {newsletter}
        </div>
        {map}
        {bottom}
      </div>
    </footer>
  );
}

export const SITE_CSS = /* css */ `
.atrium-site .a-brand{display:inline-flex;align-items:center;flex:none;min-height:2.5rem}
.atrium-site .a-brand__logo{height:auto;max-height:2.75rem;width:auto;max-width:12rem}
.atrium-site .a-brand__logo--inverse{display:none}
.atrium-site .a-brand__word{font-family:var(--a-font-heading);font-weight:var(--a-weight-heading);font-size:var(--a-text-xl);letter-spacing:var(--a-tracking-heading);line-height:1;white-space:nowrap}
.atrium-site .a-social{display:flex;flex-wrap:wrap;gap:.35rem}
.atrium-site .a-social a{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-width:2.25rem;min-height:2.25rem;border-radius:var(--a-radius-full);color:inherit;opacity:.85;transition:opacity .3s,background-color .3s}
.atrium-site .a-social a:hover{opacity:1;background:color-mix(in srgb,currentColor 10%,transparent)}
.atrium-site .a-social--labels a,.atrium-site .a-social--pills a{padding:.4rem .9rem}
.atrium-site .a-social--pills a{border:1px solid var(--t-border);font-size:var(--a-text-sm)}
.atrium-site .a-langs{display:flex;gap:.25rem;font-size:var(--a-text-xs);letter-spacing:.1em}
.atrium-site .a-langs a{padding:.35rem .5rem;opacity:.6}.atrium-site .a-langs a.is-current,.atrium-site .a-langs a:hover{opacity:1}

/* header */
.atrium-site .a-header{--hdr-bg:var(--a-color-background);--hdr-fg:var(--a-color-text);position:relative;z-index:50;width:100%;background:var(--hdr-bg);color:var(--hdr-fg);
  border-bottom:1px solid color-mix(in srgb,var(--a-color-border) 70%,transparent);transition:background-color .45s var(--a-ease),color .45s var(--a-ease),transform .5s var(--a-ease),box-shadow .45s,border-color .45s}
.atrium-site .a-header--sticky{position:sticky;top:0}
.atrium-site .a-header--overlay{--hdr-bg:transparent;--hdr-fg:var(--a-color-inverse-text);position:absolute;top:0;left:0;right:0;border-bottom-color:color-mix(in srgb,var(--a-color-inverse-text) 16%,transparent)}
.atrium-site .a-header--overlay.a-header--sticky{position:fixed}
.atrium-site .a-header--overlay .a-brand__logo--inverse{display:block}.atrium-site .a-header--overlay .a-brand__logo--default{display:none}
.atrium-site .a-header--overlay{--t-btn-bg:var(--a-color-inverse-text);--t-btn-text:var(--a-color-inverse);--t-text:var(--a-color-inverse-text);--t-border:color-mix(in srgb,var(--a-color-inverse-text) 30%,transparent)}
.atrium-site .a-header.is-scrolled{--hdr-bg:color-mix(in srgb,var(--a-color-background) 94%,transparent);--hdr-fg:var(--a-color-text);box-shadow:0 1px 0 var(--a-color-border);border-bottom-color:transparent;-webkit-backdrop-filter:saturate(1.4) blur(10px);backdrop-filter:saturate(1.4) blur(10px)}
.atrium-site .a-header--overlay.is-scrolled{--t-btn-bg:var(--a-color-primary);--t-btn-text:var(--a-color-primary-contrast);--t-text:var(--a-color-text);--t-border:var(--a-color-border)}
.atrium-site .a-header--overlay.is-scrolled .a-brand__logo--inverse{display:none}.atrium-site .a-header--overlay.is-scrolled .a-brand__logo--default{display:block}
.atrium-site .a-header.is-hidden{transform:translateY(-100%)}
.atrium-site .a-header.is-open{--hdr-bg:var(--a-color-inverse);--hdr-fg:var(--a-color-inverse-text);transform:none;-webkit-backdrop-filter:none;backdrop-filter:none}
.atrium-site .a-header__bar{display:flex;align-items:center;gap:clamp(1rem,3vw,2.5rem);min-height:var(--a-header-h)}
.atrium-site .a-header__brand{margin-right:auto}
.atrium-site .a-header--centered .a-header__bar{display:grid;grid-template-columns:1fr auto 1fr}
.atrium-site .a-header--centered .a-header__brand{margin:0;justify-self:center}
.atrium-site .a-header--centered .a-header__nav--left{justify-self:start}
.atrium-site .a-header--centered .a-header__end{justify-self:end}
.atrium-site .a-header__end{display:flex;align-items:center;gap:clamp(.75rem,2vw,1.5rem)}
.atrium-site .a-header__utility{font-size:var(--a-text-xs);border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
.atrium-site .a-header__utility-inner{display:flex;justify-content:space-between;align-items:center;gap:1rem;min-height:2.4rem}
.atrium-site .a-header__utility-end{display:flex;align-items:center;gap:1rem}
.atrium-site .a-header__contact{display:flex;flex-wrap:wrap;gap:.25rem 1.5rem}
.atrium-site .a-header__contact a{display:inline-flex;align-items:center;gap:.45rem;opacity:.85}.atrium-site .a-header__contact a:hover{opacity:1}
.atrium-site .a-nav{display:flex;align-items:center;gap:clamp(.25rem,1.6vw,1.6rem)}
.atrium-site .a-nav__item{position:relative;display:flex;align-items:center}
.atrium-site .a-nav__link{position:relative;display:inline-flex;align-items:center;padding:.6rem .15rem;font-size:var(--a-text-sm);font-weight:500;letter-spacing:.02em;white-space:nowrap}
.atrium-site .a-nav__link::after{content:"";position:absolute;left:0;right:0;bottom:.3rem;height:1px;background:currentColor;transform:scaleX(0);transform-origin:right;transition:transform .45s var(--a-ease)}
.atrium-site .a-nav__link:hover::after,.atrium-site .a-nav__link.is-current::after{transform:scaleX(1);transform-origin:left}
.atrium-site .a-nav__link.is-highlight{padding-inline:.9rem;border:1px solid var(--t-border);border-radius:var(--a-radius-full)}
.atrium-site .a-nav__link.is-highlight::after{display:none}
.atrium-site .a-nav__caret{display:inline-flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;margin-left:.1rem;padding:0;border:0;background:none;opacity:.7;transition:transform .3s,opacity .3s}
.atrium-site .a-nav__item.is-open>.a-nav__caret{transform:rotate(180deg);opacity:1}
.atrium-site .a-nav__panel{position:absolute;top:100%;left:-1.25rem;min-width:15rem;padding-top:.6rem;opacity:0;visibility:hidden;transform:translateY(6px);transition:opacity .3s var(--a-ease),transform .3s var(--a-ease),visibility 0s .3s;z-index:60}
.atrium-site .a-nav__item.has-children:hover>.a-nav__panel,.atrium-site .a-nav__item.has-children:focus-within>.a-nav__panel,.atrium-site .a-nav__item.is-open>.a-nav__panel{opacity:1;visibility:visible;transform:none;transition-delay:0s}
.atrium-site .a-nav__sub{display:grid;gap:.1rem;padding:.6rem;background:var(--a-color-background);color:var(--a-color-text);border:1px solid var(--a-color-border);border-radius:var(--a-radius-md);box-shadow:var(--a-shadow-md)}
.atrium-site .a-nav__sublink{display:grid;gap:.15rem;padding:.6rem .8rem;border-radius:var(--a-radius-sm);font-size:var(--a-text-sm);transition:background-color .25s}
.atrium-site .a-nav__sublink:hover,.atrium-site .a-nav__sublink.is-current{background:var(--a-color-surface)}
.atrium-site .a-nav__desc{font-size:var(--a-text-xs);color:var(--a-color-muted);line-height:1.4}
.atrium-site .a-nav__item.is-mega>.a-nav__panel{left:50%;transform:translate(-50%,6px);min-width:min(46rem,80vw)}
.atrium-site .a-nav__item.is-mega:hover>.a-nav__panel,.atrium-site .a-nav__item.is-mega:focus-within>.a-nav__panel,.atrium-site .a-nav__item.is-mega.is-open>.a-nav__panel{transform:translate(-50%,0)}
.atrium-site .a-nav__item.is-mega .a-nav__sub{grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.4rem;padding:1rem}
.atrium-site .a-nav__thumb{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:var(--a-radius-sm);margin-bottom:.5rem}
.atrium-site .a-nav__item.is-mega .a-nav__sublabel{font-family:var(--a-font-heading);font-size:var(--a-text-lg)}
.atrium-site .a-header__toggle{display:none;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;margin-right:-.5rem;padding:0;border:0;background:none;color:inherit}
.atrium-site .a-burger{position:relative;display:block;width:1.5rem;height:.75rem}
.atrium-site .a-burger span{position:absolute;left:0;right:0;height:1.5px;background:currentColor;transition:transform .4s var(--a-ease),top .4s var(--a-ease)}
.atrium-site .a-burger span:first-child{top:0}.atrium-site .a-burger span:last-child{top:calc(100% - 1.5px)}
.atrium-site .a-header.is-open .a-burger span:first-child{top:calc(50% - .75px);transform:rotate(45deg)}
.atrium-site .a-header.is-open .a-burger span:last-child{top:calc(50% - .75px);transform:rotate(-45deg)}
.atrium-site .a-header__drawer{position:fixed;inset:0;top:0;z-index:-1;overflow-y:auto;padding-top:calc(var(--a-header-h) + 1.5rem);background:var(--a-color-inverse);color:var(--a-color-inverse-text);animation:a-drawer-in .45s var(--a-ease-out)}
.atrium-site .a-header__drawer[hidden]{display:none}
@keyframes a-drawer-in{from{opacity:0;transform:translateY(-1rem)}to{opacity:1;transform:none}}
.atrium-site .a-header__drawer-inner{display:flex;flex-direction:column;gap:2.5rem;min-height:calc(100% - 2rem);padding-bottom:2.5rem}
.atrium-site .a-mnav{display:grid;border-top:1px solid var(--t-border)}
.atrium-site .a-mnav>li{border-bottom:1px solid var(--t-border)}
.atrium-site .a-mnav__link,.atrium-site .a-mnav__group>summary{display:flex;align-items:center;justify-content:space-between;padding:1rem 0;font-family:var(--a-font-heading);font-size:var(--a-text-2xl);line-height:1.1;cursor:pointer;list-style:none}
.atrium-site .a-mnav__group>summary::-webkit-details-marker{display:none}
.atrium-site .a-mnav__group[open]>summary .a-icon{transform:rotate(45deg)}
.atrium-site .a-mnav__group .a-icon{transition:transform .3s}
.atrium-site .a-mnav__group ul{display:grid;gap:.15rem;padding:0 0 1rem}
.atrium-site .a-mnav__group ul a{display:block;padding:.45rem 0;font-size:var(--a-text-lg);opacity:.85}
.atrium-site .a-mnav a.is-current{opacity:1;font-style:italic}
.atrium-site .a-header__drawer-foot{display:grid;gap:1.5rem;justify-items:start;margin-top:auto}
.atrium-site .a-header__contact--drawer{flex-direction:column;font-size:var(--a-text-sm)}
.atrium-site .a-header--minimal .a-header__toggle{display:inline-flex}
.atrium-site .a-header--minimal .a-header__drawer-inner{max-width:calc(var(--a-container-default) + 2 * var(--a-gutter))}
@media (max-width:1279px){.atrium-site .a-header--centered .a-nav{gap:.9rem}}
@media (max-width:1100px){
  .atrium-site .a-header__nav,.atrium-site .a-header__social,.atrium-site .a-header__langs{display:none}
  .atrium-site .a-header__toggle{display:inline-flex}
  .atrium-site .a-header--centered .a-header__bar{grid-template-columns:auto 1fr auto}
  .atrium-site .a-header--centered .a-header__brand{justify-self:start}
}
@media (max-width:767px){
  .atrium-site{--a-header-h:4rem}
  .atrium-site .a-header__cta{display:none}
  .atrium-site .a-header__utility{display:none}
}

/* footer */
.atrium-site .a-footer{position:relative;background:var(--t-bg);color:var(--t-text);padding-block:clamp(3.5rem,8vw,6.5rem) 2rem;font-size:var(--a-text-sm)}
.atrium-site .a-footer .a-container{display:flex;flex-direction:column;gap:clamp(2.5rem,6vw,4.5rem)}
.atrium-site .a-footer__statement{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:2rem;padding-bottom:clamp(2.5rem,6vw,4.5rem);border-bottom:1px solid var(--t-border)}
.atrium-site .a-footer__statement-text{font-size:clamp(2.4rem,6vw,5.5rem);line-height:1;max-width:16ch}
.atrium-site .a-footer__grid{display:grid;grid-template-columns:minmax(14rem,1.4fr) repeat(auto-fit,minmax(9rem,1fr));gap:clamp(2rem,4vw,3.5rem)}
.atrium-site .a-footer__about{display:grid;gap:1.1rem;align-content:start;max-width:22rem}
.atrium-site .a-footer__brand .a-brand__word{font-size:var(--a-text-2xl)}
.atrium-site .a-footer__desc{color:var(--t-muted);line-height:1.65}
.atrium-site .a-footer__title{margin-bottom:1rem;font-size:var(--a-text-xs);font-weight:600;letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-footer__col ul{display:grid;gap:.6rem}
.atrium-site .a-footer__col a{opacity:.9}
.atrium-site .a-footer .a-social{margin-left:-.5rem}
.atrium-site .a-contact-details{display:grid;gap:.55rem;font-style:normal;line-height:1.55}
.atrium-site .a-hours{display:grid;gap:.3rem;margin-top:.5rem;color:var(--t-muted)}
.atrium-site .a-hours li{display:flex;justify-content:space-between;gap:1.5rem}
.atrium-site .a-footer__newsletter{grid-column:span 2;max-width:26rem}
.atrium-site .a-footer__map{max-width:100%}
.atrium-site .a-footer__bottom{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem 2rem;padding-top:1.75rem;border-top:1px solid var(--t-border);color:var(--t-muted);font-size:var(--a-text-xs)}
.atrium-site .a-footer__legal{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem}
.atrium-site .a-footer__consent{padding:0;border:0;background:none;font:inherit;color:inherit;cursor:pointer}
.atrium-site .a-footer--centered .a-container{align-items:center;text-align:center;gap:2rem}
.atrium-site .a-footer--centered .a-footer__desc{max-width:34rem}
.atrium-site .a-footer__inline{display:flex;flex-wrap:wrap;justify-content:center;gap:.6rem 2rem;font-size:var(--a-text-base)}
.atrium-site .a-footer--centered .a-footer__bottom{width:100%}
.atrium-site .a-footer__contact--inline{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 2rem}
.atrium-site .a-footer--centered .a-social{margin:0;justify-content:center}
@media (max-width:991px){.atrium-site .a-footer__grid{grid-template-columns:1fr 1fr}.atrium-site .a-footer__about{grid-column:1/-1}.atrium-site .a-footer__newsletter{grid-column:1/-1}}
@media (max-width:540px){.atrium-site .a-footer__grid{grid-template-columns:1fr}.atrium-site .a-footer__bottom{flex-direction:column}}
`;
