import { ANIMATION_BOOT_SCRIPT } from '@atrium/animations';
import { registry } from '@atrium/component-registry';
import {
  buildJsonLd, buildMetadata, createRenderContext, findNotFoundPage, isRedirect, jsonLdScript, PageView, pageHasAnimations, partitionScripts,
  RENDERER_CSS_HASH, resolvePageForPath, siteRootAttrs, SiteStyles, type RenderContext,
} from '@atrium/renderer-core';
import { SiteRuntime } from '@atrium/renderer-core/client';
import { ClientLinks } from './client-links';
import { PageDocumentSchema, type PageDocument, type ScriptDefinition, type SiteSnapshot } from '@atrium/schema';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PUBLIC_API_URL } from './env';

export interface SiteRequest {
  snapshot: SiteSnapshot;
  /** Path segments after any routing prefix (e.g. ['rooms', 'lake-suite']). */
  segments: string[];
  /** Prefix for internal links: '' for real hosts, '/_site/<slug>' or '/_preview/<token>'. */
  basePath: string;
  mode: 'live' | 'preview';
  host?: string;
}

export type Resolution =
  | { kind: 'page'; page: PageDocument; ctx: RenderContext; locale: string }
  | { kind: 'not-found'; page: PageDocument; ctx: RenderContext; locale: string }
  | { kind: 'redirect'; destination: string; statusCode: number };

const synthetic404 = (() => {
  let cached: PageDocument | null = null;
  return (): PageDocument => {
    if (cached) return cached;
    const { node } = registry.normalize({
      type: 'text-section',
      variant: 'intro',
      props: {
        eyebrow: 'Error 404',
        heading: 'This page has *wandered* off',
        headingLevel: 'h1',
        body: 'The page you were looking for may have moved or no longer exists.',
        buttons: [{ label: 'Back to the homepage', link: '/', style: 'primary', iconPosition: 'end' }],
        spacingTop: 'xl',
        spacingBottom: 'xl',
      },
    });
    cached = PageDocumentSchema.parse({ id: '__404', title: 'Page not found', slug: '404', kind: 'not-found', status: 'published', seo: { robots: { index: false, follow: false } }, sections: [node] });
    return cached;
  };
})();

function ctxFor(req: SiteRequest, page: PageDocument, locale: string, collectionItem?: Parameters<typeof createRenderContext>[0]['collectionItem']): RenderContext {
  return createRenderContext(
    {
      definition: req.snapshot.definition,
      mode: req.mode,
      locale,
      websiteId: req.snapshot.websiteId,
      apiBaseUrl: req.snapshot.apiBaseUrl ?? PUBLIC_API_URL,
      runtime: req.snapshot.runtime,
      collectionItem,
      basePath: req.basePath,
      domain: req.snapshot.primaryDomain ?? req.host,
      media: (req.snapshot as unknown as { media?: Parameters<typeof createRenderContext>[0]['media'] }).media,
    },
    page,
  );
}

function localeFromSegments(req: SiteRequest): string {
  const { locales, defaultLocale } = req.snapshot.definition.settings.localization;
  const first = req.segments[0];
  return first && locales.includes(first) ? first : defaultLocale;
}

/** Resolve a request to a page, the site's 404 page, or a redirect. */
export function resolveRequest(req: SiteRequest): Resolution {
  const def = req.snapshot.definition;
  const path = `/${req.segments.map((s) => decodeURIComponent(s)).join('/')}`;
  const res = resolvePageForPath(def, path, undefined, { includeDrafts: req.mode === 'preview' });
  if (res && isRedirect(res)) {
    const dest = res.redirect.destination;
    // Relative destinations stay on this site; `//host` and `/\host` would leave it.
    const relative = dest.startsWith('/') && !dest.startsWith('//') && !dest.startsWith('/\\');
    const destination = relative ? `${req.basePath}${dest}` || '/' : dest.startsWith('/') ? `${req.basePath}/` : dest;
    return { kind: 'redirect', destination, statusCode: res.redirect.statusCode };
  }
  if (res) return { kind: 'page', page: res.page, locale: res.locale, ctx: ctxFor(req, res.page, res.locale, res.collectionItem) };
  const locale = localeFromSegments(req);
  const page = findNotFoundPage(def) ?? synthetic404();
  return { kind: 'not-found', page, locale, ctx: ctxFor(req, page, locale) };
}

/** Map our metadata to Next's Metadata. */
export function toNextMetadata(r: Resolution): Metadata {
  if (r.kind === 'redirect') return {};
  const m = buildMetadata(r.ctx, r.page);
  const notFound = r.kind === 'not-found';
  return {
    title: { absolute: m.title },
    description: m.description,
    keywords: m.keywords,
    robots: notFound ? { index: false, follow: true } : m.robots,
    alternates: notFound ? undefined : m.alternates,
    openGraph: { ...m.openGraph, images: m.openGraph.images },
    twitter: m.twitter,
    icons: m.icons,
    verification: m.verification,
  };
}

function ScriptTag({ s }: { s: ScriptDefinition }) {
  if (s.src) return <script src={s.src} async={s.async} defer={s.defer} data-atrium-script={s.id} />;
  return <script data-atrium-script={s.id} dangerouslySetInnerHTML={{ __html: s.code ?? '' }} />;
}

/** Page-level custom code: raw HTML snippets render as-is; bare JS is wrapped in a <script>. */
function PageCode({ code }: { code?: string }) {
  if (!code?.trim()) return null;
  if (code.trim().startsWith('<')) return <div hidden data-atrium-page-code="" dangerouslySetInnerHTML={{ __html: code }} />;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

/** Full HTML document for a resolved site request (used by every root layout). */
export function SiteDocument({ r, req, children }: { r: Resolution; req: SiteRequest; children: ReactNode }) {
  if (r.kind === 'redirect') {
    return (
      <html lang={req.snapshot.definition.settings.localization.defaultLocale}>
        <head>
          <meta httpEquiv="refresh" content={`0;url=${r.destination}`} />
          <link rel="canonical" href={r.destination} />
          <meta name="robots" content="noindex" />
        </head>
        <body>{children}</body>
      </html>
    );
  }
  const { ctx, page } = r;
  const settings = ctx.settings;
  const { direct, gated } = partitionScripts(settings);
  const head = direct.filter((s) => s.placement === 'head');
  const bodyStart = direct.filter((s) => s.placement === 'body-start');
  const bodyEnd = direct.filter((s) => s.placement === 'body-end');
  const animated = pageHasAnimations(ctx, page);
  const pageHead = page.scripts?.head?.trim();
  return (
    <html lang={r.locale} data-scroll-behavior="smooth">
      <head>
        {animated ? <script dangerouslySetInnerHTML={{ __html: ANIMATION_BOOT_SCRIPT }} /> : null}
        <SiteStyles ctx={ctx} page={page} stylesheetHref={`/atrium-assets/renderer.css?v=${RENDERER_CSS_HASH}`} />
        {head.map((s) => <ScriptTag key={s.id} s={s} />)}
        {pageHead && !pageHead.startsWith('<') ? <script dangerouslySetInnerHTML={{ __html: pageHead }} /> : null}
      </head>
      <body {...siteRootAttrs(ctx)}>
        {bodyStart.map((s) => <ScriptTag key={s.id} s={s} />)}
        {pageHead && pageHead.startsWith('<') ? <PageCode code={pageHead} /> : null}
        {r.kind === 'not-found' ? (
          <>
            {/* The layout renders the site's 404 itself (it knows host + path); the route's notFound() only sets the status. */}
            <SiteBody r={r} />
            <div hidden>{children}</div>
          </>
        ) : (
          children
        )}
        <SiteRuntime
          motion={ctx.theme.motion}
          mode={ctx.mode}
          websiteId={ctx.websiteId}
          apiBaseUrl={ctx.apiBaseUrl}
          analytics={settings.analytics.builtIn}
          consent={settings.cookieConsent}
          scripts={gated}
          routeKey={`${page.id}:${r.locale}`}
        />
        <ClientLinks cachePages={settings.performance?.cachePages ?? true} progressBar={settings.performance?.progressBar ?? true} />
        {bodyEnd.map((s) => <ScriptTag key={s.id} s={s} />)}
        <PageCode code={page.scripts?.body} />
      </body>
    </html>
  );
}

/** Page body: the rendered page, JSON-LD and (in preview) a ribbon. */
export function SiteBody({ r }: { r: Exclude<Resolution, { kind: 'redirect' }> }) {
  const ld = r.kind === 'page' ? buildJsonLd(r.ctx, r.page) : [];
  return (
    <>
      <PageView ctx={r.ctx} page={r.page} />
      {ld.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld.length === 1 ? ld[0]! : ld) }} /> : null}
      {r.ctx.mode === 'preview' ? <PreviewRibbon /> : null}
    </>
  );
}

export function PreviewRibbon() {
  return (
    <div role="status" style={{ position: 'fixed', zIndex: 300, left: '50%', bottom: '1rem', transform: 'translateX(-50%)', padding: '.45rem 1rem', borderRadius: '999px', background: 'var(--a-color-inverse)', color: 'var(--a-color-inverse-text)', font: '500 12px/1.2 system-ui, sans-serif', letterSpacing: '.08em', textTransform: 'uppercase', boxShadow: '0 8px 24px rgb(0 0 0 / .2)' }}>
      Preview · not published
    </div>
  );
}

/** Minimal standalone document for platform-level states (unknown site, API down, password). */
export function StatusDocument({ title, message, children, status, slot }: { title: string; message: string; children?: ReactNode; status?: string; /** Route children (rendered hidden so the page can set the HTTP status). */ slot?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>{title}</title>
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: 'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ee;color:#24211d;font:16px/1.6 ui-sans-serif,system-ui,sans-serif}main{max-width:30rem;padding:2rem;text-align:center}h1{font:500 2rem/1.2 Georgia,serif;margin:.25rem 0 1rem}p{color:#6b645b;margin:0 0 1.25rem}small{letter-spacing:.14em;text-transform:uppercase;font-size:.72rem;color:#8a8177}form{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap}input{padding:.75rem 1rem;border:1px solid #d7cfc3;border-radius:4px;font:inherit;min-width:14rem}button{padding:.75rem 1.25rem;border:0;border-radius:4px;background:#24211d;color:#fff;font:inherit;cursor:pointer}' }} />
      </head>
      <body>
        <main>
          {status ? <small>{status}</small> : null}
          <h1>{title}</h1>
          <p>{message}</p>
          {children}
        </main>
        {slot ? <div hidden>{slot}</div> : null}
      </body>
    </html>
  );
}
