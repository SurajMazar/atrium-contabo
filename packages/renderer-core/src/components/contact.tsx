import { safeHref } from '@atrium/schema';
import { MapFacade } from '../islands/map-facade';
import { resolveTemplateString } from '../props';
import type { RenderContext, RenderProps } from '../types';
import { ALink } from '../ui/actions';
import { cx, root, toArray } from '../ui/core';
import { Icon } from '../ui/icon';
import { toMedia } from '../ui/media';
import { Intro, Section } from '../ui/section';
import { formatDays, SocialList } from './site';

export function businessAddress(ctx: RenderContext): string {
  const a = ctx.settings.business.address ?? {};
  return a.formatted ?? [a.street, a.locality, a.region, a.postalCode, a.country].filter(Boolean).join(', ');
}

export function mapEmbedUrl(ctx: RenderContext, p: { provider?: string; query?: string; lat?: number; lng?: number; zoom?: number }): string {
  const zoom = p.zoom ?? 14;
  const lat = p.lat ?? ctx.settings.business.geo?.lat;
  const lng = p.lng ?? ctx.settings.business.geo?.lng;
  const q = String(resolveTemplateString(p.query ?? '', ctx.scope) || businessAddress(ctx) || ctx.settings.business.name);
  if (p.provider === 'osm' && lat !== undefined && lng !== undefined) {
    const d = (360 / 2 ** zoom) * 0.75;
    const bbox = [lng - d, lat - d / 2, lng + d, lat + d / 2].map((n) => n.toFixed(5)).join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  }
  const where = p.lat !== undefined && p.lng !== undefined ? `${p.lat},${p.lng}` : q;
  return `https://www.google.com/maps?q=${encodeURIComponent(where)}&z=${zoom}&output=embed`;
}

export function mapOpenUrl(ctx: RenderContext, query?: string): string {
  const custom = safeHref(ctx.settings.business.mapsUrl);
  if (custom) return custom;
  const geo = ctx.settings.business.geo;
  const q = query || businessAddress(ctx) || (geo ? `${geo.lat},${geo.lng}` : ctx.settings.business.name);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function MapRenderer({ props, ctx, attrs }: RenderProps) {
  const query = String(props.query ?? '');
  const facadeImage = toMedia(props.facadeImage);
  return (
    <div {...root(attrs, 'a-map-block')}>
      <MapFacade
        embedUrl={mapEmbedUrl(ctx, props)}
        title={props.title ?? 'Map'}
        height={props.height}
        rounded={props.rounded}
        facade={props.facade !== false}
        facadeImage={facadeImage ? { src: facadeImage.src, alt: facadeImage.alt } : undefined}
        openUrl={mapOpenUrl(ctx, query)}
        address={query || businessAddress(ctx)}
        editor={ctx.mode === 'editor'}
      />
    </div>
  );
}

interface ContactItem {
  icon: string;
  label: string;
  value: string;
  href?: string;
  lines?: Array<[string, string]>;
}

function contactItems(ctx: RenderContext, props: Record<string, any>): ContactItem[] {
  const b = ctx.settings.business;
  const items: ContactItem[] = [];
  if (props.showPhone && b.phone) items.push({ icon: 'phone', label: 'Telephone', value: b.phone, href: `tel:${b.phone.replace(/[^+\d]/g, '')}` });
  if (props.showWhatsapp && b.whatsapp) items.push({ icon: 'whatsapp', label: 'WhatsApp', value: b.whatsapp, href: `https://wa.me/${b.whatsapp.replace(/\D/g, '')}` });
  if (props.showEmail && b.email) items.push({ icon: 'mail', label: 'Email', value: b.email, href: `mailto:${b.email}` });
  const address = businessAddress(ctx);
  if (props.showAddress && address) items.push({ icon: 'map-pin', label: 'Address', value: address, href: mapOpenUrl(ctx) });
  if (props.showHours && b.openingHours?.length) {
    items.push({
      icon: 'clock',
      label: 'Hours',
      value: '',
      lines: b.openingHours.map((h) => [h.label ?? formatDays(h.days), h.opens === '00:00' && h.closes === '23:59' ? '24 hours' : `${h.opens} – ${h.closes}`]),
    });
  }
  for (const x of toArray<{ label: string; value: string; link?: string }>(props.extra)) {
    if (!x.label && !x.value) continue;
    const auto = (x.link !== undefined ? safeHref(x.link) : undefined) ?? (/^[^\s@]+@[^\s@]+$/.test(x.value) ? `mailto:${x.value}` : /^\+?[\d\s()-]{6,}$/.test(x.value) ? `tel:${x.value.replace(/[^+\d]/g, '')}` : undefined);
    items.push({ icon: 'arrow-up-right', label: x.label, value: x.value, href: auto });
  }
  return items;
}

function ContactItemView({ ctx, item }: { ctx: RenderContext; item: ContactItem }) {
  const external = item.href && /^https?:/.test(item.href);
  return (
    <div className="a-cinfo__item">
      <span className="a-cinfo__icon"><Icon name={item.icon} size={18} /></span>
      <div className="a-cinfo__body">
        <p className="a-cinfo__label">{item.label}</p>
        {item.lines ? (
          <ul className="a-hours">{item.lines.map(([d, h], i) => <li key={i}><span>{d}</span><span>{h}</span></li>)}</ul>
        ) : item.href ? (
          <ALink ctx={ctx} link={external ? { type: 'url', href: item.href, newTab: true } : item.href} className="a-cinfo__value a-link">{item.value}</ALink>
        ) : (
          <p className="a-cinfo__value">{item.value}</p>
        )}
      </div>
    </div>
  );
}

export function ContactInfoRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'list';
  const items = contactItems(ctx, props);
  const list = (
    <div className={cx('a-cinfo__list', variant === 'cards' && 'a-cinfo__list--cards')}>
      {items.map((it, i) => <ContactItemView key={i} ctx={ctx} item={it} />)}
    </div>
  );
  if (variant === 'split') {
    return (
      <Section rp={rp} labelled>
        <div className="a-cinfo__split">
          <div className="a-cinfo__col">
            <Intro ctx={ctx} props={props} nodeId={node.id} />
            {list}
            {props.showSocial ? <SocialList ctx={ctx} style="pills" /> : null}
          </div>
          <MapFacade embedUrl={mapEmbedUrl(ctx, { provider: 'google', zoom: props.mapZoom })} title={`Map of ${ctx.settings.business.name}`} height="lg" openUrl={mapOpenUrl(ctx)} address={businessAddress(ctx)} editor={ctx.mode === 'editor'} />
        </div>
      </Section>
    );
  }
  return (
    <Section rp={rp} labelled>
      <Intro ctx={ctx} props={props} nodeId={node.id} />
      {list}
      {props.showSocial ? <SocialList ctx={ctx} style="pills" className="a-cinfo__social" /> : null}
    </Section>
  );
}

export function SocialLinksRenderer({ props, ctx, attrs }: RenderProps) {
  const sizes: Record<string, number> = { sm: 16, md: 20, lg: 26 };
  return (
    <div {...root(attrs, 'a-social-links', `a-social-links--${props.align ?? 'left'}`)}>
      {props.label ? <p className="a-eyebrow">{props.label}</p> : null}
      <SocialList ctx={ctx} size={sizes[props.size as string] ?? 20} networks={props.networks} style={props.style} />
    </div>
  );
}

export const CONTACT_CSS = /* css */ `
.atrium-site .a-map{position:relative;overflow:hidden;width:100%;background:var(--t-surface);border:1px solid var(--t-border)}
.atrium-site .a-map--sm{height:16rem}.atrium-site .a-map--md{height:clamp(20rem,40vw,28rem)}.atrium-site .a-map--lg{height:clamp(24rem,55vw,38rem)}
.atrium-site .a-map__frame{position:absolute;inset:0;width:100%;height:100%;border:0}
.atrium-site .a-map__facade{position:absolute;inset:0;display:grid;place-items:center}
.atrium-site .a-map__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.6)}
.atrium-site .a-map__pattern{position:absolute;inset:0;opacity:.55;background-color:var(--a-color-surface);
  background-image:linear-gradient(color-mix(in srgb,var(--a-color-text) 7%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--a-color-text) 7%,transparent) 1px,transparent 1px),
  radial-gradient(circle at 30% 40%,color-mix(in srgb,var(--a-color-primary) 14%,transparent),transparent 40%),radial-gradient(circle at 70% 65%,color-mix(in srgb,var(--a-color-accent) 14%,transparent),transparent 45%);
  background-size:2.5rem 2.5rem,2.5rem 2.5rem,100% 100%,100% 100%}
.atrium-site .a-map__card{position:relative;display:grid;justify-items:center;gap:.75rem;max-width:min(24rem,88%);padding:1.5rem 1.75rem;text-align:center;background:var(--a-color-background);color:var(--a-color-text);border-radius:var(--a-radius-md);box-shadow:var(--a-shadow-md);--t-text:var(--a-color-text);--t-btn-bg:var(--a-color-primary);--t-btn-text:var(--a-color-primary-contrast)}
.atrium-site .a-map__pin{color:var(--a-color-primary)}
.atrium-site .a-map__address{font-size:var(--a-text-sm);line-height:1.5}
.atrium-site .a-map__actions{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1.25rem}
.atrium-site .a-map__note{font-size:.7rem;color:var(--a-color-muted)}
.atrium-site .a-cinfo__list{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:clamp(1.5rem,3vw,2.5rem) clamp(1.5rem,4vw,3.5rem)}
.atrium-site .a-cinfo__item{display:flex;gap:1rem;align-items:flex-start}
.atrium-site .a-cinfo__icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:2.6rem;height:2.6rem;border:1px solid var(--t-border);border-radius:50%;color:var(--t-accent)}
.atrium-site .a-cinfo__body{display:grid;gap:.3rem;min-width:0;flex:1}
.atrium-site .a-cinfo__label{font-size:var(--a-text-xs);letter-spacing:var(--a-tracking-eyebrow);text-transform:uppercase;color:var(--t-muted)}
.atrium-site .a-cinfo__value{font-size:var(--a-text-lg);line-height:1.45;overflow-wrap:anywhere;align-self:start;justify-self:start}
.atrium-site .a-cinfo__list--cards .a-cinfo__item{flex-direction:column;padding:clamp(1.5rem,3vw,2.25rem);background:var(--t-surface);border:1px solid var(--t-border);border-radius:var(--a-radius-md)}
.atrium-site .a-cinfo__split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:clamp(2.5rem,6vw,6rem);align-items:start}
.atrium-site .a-cinfo__split .a-cinfo__list{grid-template-columns:1fr;gap:1.75rem}
.atrium-site .a-cinfo__col{display:grid;gap:2rem}
.atrium-site .a-cinfo__col .a-intro{margin-bottom:0}
.atrium-site .a-cinfo__social{margin-top:2.5rem}
@media (max-width:991px){.atrium-site .a-cinfo__split{grid-template-columns:1fr}}
.atrium-site .a-social-links{display:grid;gap:.75rem}
.atrium-site .a-social-links--center{justify-items:center}.atrium-site .a-social-links--center .a-social{justify-content:center}
.atrium-site .a-social-links--right{justify-items:end}.atrium-site .a-social-links--right .a-social{justify-content:flex-end}
`;
