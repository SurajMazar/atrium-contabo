/**
 * Site chrome: header (site-header), navigation menus, and the two global sections every page
 * references — the footer (Footer.tsx) and the floating contact rail + mobile app bar
 * (WhatsAppButton.tsx, BottomNav.tsx).
 */
import { box, button, heading, image, node, section, setScope, text, type N } from './nodes.ts';
import { LUCIDE, maskCss } from './icons.ts';
import { PAGE_IDS, type Ctx } from './context.ts';
import { contactLink, lgIcon, mq, MD, LG } from './sections.ts';

const routeToPage = (href: string) => {
  const [path, hash] = href.split('#');
  const key = path === '/' ? 'home' : path!.replace(/^\//, '');
  return PAGE_IDS[key] ? (hash ? { type: 'page', pageId: PAGE_IDS[key], anchor: hash } : { type: 'page', pageId: PAGE_IDS[key] }) : href;
};

export function menus(c: Ctx) {
  return {
    primary: c.data.NAV.map((item: { label: string; href: string; caption: string }, i: number) => ({ id: `nav-${i + 1}`, label: item.label, link: routeToPage(item.href), description: item.caption })),
    explore: c.data.FOOTER_LINKS.explore.map((item: { label: string; href: string }, i: number) => ({ id: `explore-${i + 1}`, label: item.label, link: routeToPage(item.href) })),
    services: c.data.FOOTER_LINKS.services.map((item: { label: string; href: string }, i: number) => ({ id: `services-${i + 1}`, label: item.label, link: routeToPage(item.href) })),
  };
}

export function header(c: Ctx): N {
  setScope('header');
  return node('site-header', {
    menu: 'primary',
    cta: { label: 'Book Now', link: c.pageLink('contact'), style: 'primary', iconPosition: 'end' },
    sticky: true,
    transparentOnHero: true,
    hideOnScroll: false,
    showSocial: false,
    showContact: false,
    showLanguageSwitcher: false,
    width: 'wide',
  }, undefined, { id: 'lg-header', variant: 'classic', name: 'Header' });
}

/** Placeholder site-footer (the visible footer is the global section; see README). */
export function siteFooter(c: Ctx): N {
  return node('site-footer', { description: `${c.data.SITE.tagline}. A luxury banquet venue in Kathmandu for weddings, receptions and celebrations of up to 800 guests.`, columns: [{ title: 'Explore', menu: 'explore', links: [] }], tone: 'inverse', copyright: `© {{year}} ${c.data.SITE.name}. All rights reserved.` }, undefined, { id: 'lg-site-footer', variant: 'columns', name: 'Footer (unused)' });
}

export function footerSection(c: Ctx): N {
  setScope('footer');
  const d = c.data;
  const C = d.CONTACT;
  const title = (t: string) => node('heading', { text: t, level: 'h2', size: 'sm', font: 'body' }, undefined, { css: '&{margin-bottom:1.5rem;font-family:var(--a-font-body);font-size:.8125rem!important;line-height:1.125rem!important;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--lg-gold)}' });
  const brand: N[] = [];
  if (c.cfg.footerLogo) {
    brand.push(image({ src: c.asset(c.cfg.footerLogo.src), alt: d.SITE.name, width: c.cfg.footerLogo.width, height: c.cfg.footerLogo.height, mimeType: 'image/png' }, { css: `&{width:12rem}${mq(MD, '&{width:14rem}')}& .a-frame{background:transparent}` }));
  } else {
    brand.push(text(d.SITE.name, 'base', { css: '&{font-family:var(--a-font-heading);font-size:var(--lg-headline-lg);line-height:1.16;color:var(--lg-gold)}' }));
  }
  brand.push(
    text(`${d.SITE.tagline}. A luxury banquet venue in Kathmandu for weddings, receptions and celebrations of up to 800 guests.`, 'base', { css: `&{margin-top:${c.cfg.footerLogo ? '2rem' : '1.5rem'};max-width:24rem;color:color-mix(in srgb,var(--lg-cream) 80%,transparent)}` }),
    box([button('Plan Your Event', c.pageLink('contact'), 'secondary')], { css: '&{margin-top:2.5rem;align-items:flex-start}' }),
    box(d.SOCIAL.map((s: { label: string; href: string; icon: string }) =>
      button(s.label, { type: 'url', href: s.href, newTab: true }, 'ghost', {
        icon: LUCIDE[s.icon], iconPosition: 'start',
        css: `&{padding:.625rem!important;font-size:0!important;gap:0}& .a-btn__label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}& .a-btn__icon{width:22px;height:22px;color:inherit}${maskCss(s.icon, '& .a-btn__icon')}`,
      })), { tag: 'nav', name: 'Social', css: '&{margin:2rem -.625rem 0;display:flex;flex-direction:row;align-items:center}' }),
  );
  const explore = box([
    title('Explore'),
    box(d.FOOTER_LINKS.explore.map((l: { label: string; href: string }) => button(l.label, routeToPage(l.href), 'ghost')), { css: '&{display:flex;flex-direction:column;align-items:flex-start;gap:1rem}' }),
  ], { tag: 'nav', css: mq(MD, '&{grid-column:7 / span 3}') });
  const contact = box([
    title('Contact'),
    box([
      contactLink(C.landline, { type: 'tel', phone: C.landline }, 'phone', 16),
      contactLink(C.mobile, { type: 'tel', phone: C.mobile }, 'phone', 16),
      contactLink(C.email, { type: 'email', email: C.email }, 'mail', 16),
      box([lgIcon('pin', 16, 'inherit'), text(`${C.address.locality}, ${C.address.country}`, 'base', { css: '&{color:inherit}' })], { css: '&{display:inline-flex;flex-direction:row;align-items:center;gap:.75rem}' }),
    ], { css: '&{display:flex;flex-direction:column;align-items:flex-start;gap:1rem;color:color-mix(in srgb,var(--lg-cream) 80%,transparent)}' }),
  ], { css: mq(MD, '&{grid-column:10 / span 3}') });
  const small = 'font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:color-mix(in srgb,var(--lg-cream) 65%,transparent)';
  return section([
    box([
      box([box(brand, { css: mq(MD, '&{grid-column:span 5 / span 5}') }), explore, contact], { css: `&{display:grid;gap:4rem}${mq(MD, '&{grid-template-columns:repeat(12,minmax(0,1fr));gap:2rem}')}` }),
      box([
        text(`© {{year}} ${d.SITE.name}. All rights reserved.`, 'sm', { css: `&{${small}}` }),
        text(`${C.address.locality} · ${C.address.country}`, 'sm', { css: `&{${small}}` }),
      ], { css: `&{margin-top:5rem;display:flex;flex-direction:column;gap:1rem;border-top:1px solid color-mix(in srgb,var(--lg-cream) 20%,transparent);padding-top:2rem}${mq(MD, '&{flex-direction:row;align-items:center;justify-content:space-between}')}` }),
    ], { css: `&{padding:6rem 0}${mq(MD, '&{padding:8rem 0}')}` }),
  ], {
    id: 'lg-footer',
    name: 'Site footer',
    tone: 'inverse',
    top: 'none',
    css: `&{background:var(--lg-charcoal);color:var(--lg-cream);padding-bottom:calc(3.5rem + env(safe-area-inset-bottom))!important}${mq(LG, '&{padding-bottom:0!important}')}`,
  });
}

const BRAND: Record<string, string> = {
  whatsapp: '&{background:#25d366}&:hover{background:#1da851}',
  facebook: '&{background:#1877f2}&:hover{filter:brightness(.9)}',
  instagram: '&{background:linear-gradient(to top right,#fcaf45,#e1306c,#833ab4)}&:hover{filter:brightness(.9)}',
  tiktok: '&{background:#000}&:hover{filter:brightness(1.5)}',
};

function floatLink(label: string, link: unknown, name: string): N {
  return button(label, link, 'ghost', {
    icon: LUCIDE[name], iconPosition: 'start', name: `Float — ${label}`,
    css: `&{display:flex!important;align-items:center;gap:0!important;padding:.625rem!important;color:#fff!important;--b-fg:#fff;font-size:.8125rem!important;line-height:1.125rem!important;font-weight:600!important;letter-spacing:.16em!important;text-transform:uppercase!important;box-shadow:0 8px 32px rgba(var(--lg-shadow-rgb),.28);transition:background-color .3s,filter .3s;opacity:0;animation:lg-float-in .6s var(--lg-ease-luxe) forwards}${mq(LG, '&{padding:.875rem!important}')}
${BRAND[name]}
& .a-btn__icon{width:20px;height:20px;color:#fff}${mq(LG, '& .a-btn__icon{width:24px;height:24px}')}${maskCss(name, '& .a-btn__icon')}
& .a-btn__label{max-width:0;margin-left:0;overflow:hidden;white-space:nowrap;opacity:0;transition:max-width .3s,margin .3s,opacity .3s}
&:is(:hover,:focus-visible) .a-btn__label{max-width:9rem;margin-left:.75rem;opacity:1}`,
  });
}

export function floatingSection(c: Ctx): N {
  setScope('float');
  const d = c.data;
  const C = d.CONTACT;
  const items = [
    { label: 'Book Now', link: c.pageLink('contact'), icon: 'calendar', primary: true },
    { label: 'Call Now', link: { type: 'tel', phone: C.mobile }, icon: 'phone' },
    { label: 'Packages', link: c.pageLink('packages'), icon: 'menu-card' },
    { label: 'About Us', link: c.pageLink('about'), icon: 'hall' },
  ];
  const tabs = items.map((it) =>
    button(it.label, it.link, 'ghost', {
      icon: LUCIDE[it.icon], iconPosition: 'start', name: `App bar — ${it.label}`,
      css: `&{display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:.375rem!important;min-height:3.5rem!important;padding:.625rem .25rem!important;border-right:1px solid color-mix(in srgb,var(--lg-charcoal) 10%,transparent);--b-fg:var(--lg-charcoal);font-size:.6875rem!important;line-height:1!important;letter-spacing:.08em!important;text-transform:uppercase!important;font-weight:400!important;text-align:center;transition:background-color .3s}&:last-child{border-right:0}&:active{background:var(--lg-surface-mid)}&[aria-current=page]{--b-fg:var(--lg-gold-ink)}
& .a-btn__icon{width:22px!important;height:22px!important;color:${it.primary ? 'var(--lg-gold-ink)' : 'var(--lg-charcoal)'}!important}&[aria-current=page] .a-btn__icon{color:var(--lg-gold-ink)!important}${maskCss(it.icon, '& .a-btn__icon')}`,
    }),
  );
  const stack = box([
    box(d.SOCIAL.map((s: { label: string; href: string; icon: string }) => floatLink(s.label, { type: 'url', href: s.href, newTab: true }, s.icon)), { tag: 'nav', name: 'Social', css: '&{display:flex;flex-direction:column;align-items:flex-end}' }),
    floatLink('WhatsApp us', { type: 'whatsapp', phone: C.whatsapp, message: C.whatsappMessage }, 'whatsapp'),
  ], {
    id: 'lg-float-stack',
    name: 'Floating contact stack',
    css: `&{position:fixed;right:1rem;bottom:calc(4.5rem + env(safe-area-inset-bottom));z-index:40;display:flex;flex-direction:column;align-items:flex-end}${mq(LG, '&{right:2rem;bottom:2rem}')}
& .a-btn:nth-last-child(1){animation-delay:1.6s}& nav .a-btn:nth-child(3){animation-delay:1.68s}& nav .a-btn:nth-child(2){animation-delay:1.76s}& nav .a-btn:nth-child(1){animation-delay:1.84s}
@keyframes lg-float-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){& .a-btn{animation:none!important;opacity:1!important}}`,
  });
  const bar = box(tabs, {
    id: 'lg-bottom-nav',
    tag: 'nav',
    name: 'Mobile app bar',
    css: `&{position:fixed;left:0;right:0;bottom:0;z-index:50;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid color-mix(in srgb,var(--lg-charcoal) 20%,transparent);background:color-mix(in srgb,var(--lg-cream) 95%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);padding-bottom:env(safe-area-inset-bottom)}${mq(LG, '&{display:none}')}`,
  });
  return section([stack, bar], { id: 'lg-floating', name: 'Floating contact & app bar', tone: 'transparent', top: 'none', css: '&{padding:0!important;position:static}&>.a-container{padding:0;max-width:none}' });
}
