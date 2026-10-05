import type { PageDocument, ScriptDefinition, SiteSettings } from '@atrium/schema';
import type { ReactNode } from 'react';
import './styles';
import { withPage } from './context';
import { NodeView } from './node-view';
import type { RenderContext } from './types';
import { Dropzone } from './ui/core';

/** Site header + <main> sections + footer for a page (respects page.layout). No <html>/<body>. */
export function PageView({ ctx, page }: { ctx: RenderContext; page: PageDocument }): ReactNode {
  const pctx = withPage(ctx, page);
  const { header, footer } = page.layout;
  return (
    <>
      <a className="a-skip" href="#main">Skip to content</a>
      {header !== 'hidden' ? <NodeView ctx={pctx} node={pctx.definition.header} /> : null}
      <main id="main" className="a-main" data-page-id={ctx.mode === 'editor' ? page.id : undefined} tabIndex={-1}>
        {page.sections.length ? page.sections.map((s) => <NodeView key={s.id} ctx={pctx} node={s} />) : <Dropzone ctx={pctx} parentId="root" label="Add a section to start building this page" />}
      </main>
      {footer !== 'hidden' ? <NodeView ctx={pctx} node={pctx.definition.footer} /> : null}
    </>
  );
}

/** Attributes for the element that wraps the site (usually <body>). */
export function siteRootAttrs(ctx: RenderContext): Record<string, string> {
  return { className: 'atrium-site', 'data-mode': ctx.mode, 'data-color-scheme': ctx.theme.colorScheme };
}

/** Third-party analytics configured in settings, expressed as consent-categorized scripts. */
export function analyticsScripts(settings: SiteSettings): ScriptDefinition[] {
  const a = settings.analytics;
  const out: ScriptDefinition[] = [];
  const safe = (id: string) => id.replace(/[^\w-]/g, '');
  if (a.googleTagManagerId) {
    const id = safe(a.googleTagManagerId);
    out.push({ id: 'atrium-gtm', name: 'Google Tag Manager', placement: 'head', consentCategory: 'analytics', enabled: true, code: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');` });
  }
  if (a.googleAnalyticsId) {
    const id = safe(a.googleAnalyticsId);
    out.push({ id: 'atrium-ga-src', name: 'Google Analytics', placement: 'head', consentCategory: 'analytics', enabled: true, async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` });
    out.push({ id: 'atrium-ga', name: 'Google Analytics config', placement: 'head', consentCategory: 'analytics', enabled: true, code: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true});` });
  }
  if (a.metaPixelId) {
    const id = safe(a.metaPixelId);
    out.push({ id: 'atrium-meta', name: 'Meta Pixel', placement: 'head', consentCategory: 'marketing', enabled: true, code: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');` });
  }
  return out;
}

/**
 * Split site scripts: `direct` can be server-rendered (necessary, or consent banner disabled);
 * `gated` must be injected by SiteRuntime once the visitor grants the category.
 */
export function partitionScripts(settings: SiteSettings): { direct: ScriptDefinition[]; gated: ScriptDefinition[] } {
  const all = [...settings.scripts, ...analyticsScripts(settings)].filter((s) => s.enabled !== false && (s.src || s.code));
  if (!settings.cookieConsent.enabled) return { direct: all, gated: [] };
  return { direct: all.filter((s) => s.consentCategory === 'necessary'), gated: all.filter((s) => s.consentCategory !== 'necessary') };
}
