import { ANIMATION_BASE_CSS } from '@atrium/animations';
import { compileTreeCss, customFontFaces, googleFontsUrl, sanitizeCss, themeToCss } from '@atrium/design-tokens';
import { walkNodes, type Node, type PageDocument } from '@atrium/schema';
import type { ReactNode } from 'react';
import { CSS_CHUNKS, TYPE_CSS, registerBuiltinRenderers } from './builtin';
import type { RenderContext } from './types';

registerBuiltinRenderers();

/** Light, safe minification for our own authored CSS strings. */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

const CHUNK_ORDER = ['base', 'basics', 'site', 'hero', 'media', 'marketing', 'hospitality', 'contact', 'forms', 'advanced', 'collection'];
const minified = new Map<string, string>();
const chunk = (id: string) => {
  let v = minified.get(id);
  if (v === undefined) minified.set(id, (v = minifyCss(CSS_CHUNKS[id] ?? '')));
  return v;
};

/** All component CSS as one string (scoped under `.atrium-site`). */
export const RENDERER_CSS: string = CHUNK_ORDER.map(chunk).join('');

/** Short content hash of RENDERER_CSS for cache-busting an external stylesheet URL. */
export const RENDERER_CSS_HASH: string = (() => {
  let h = 2166136261;
  for (let i = 0; i < RENDERER_CSS.length; i++) h = Math.imul(h ^ RENDERER_CSS.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
})();

export interface SiteCssOptions {
  /**
   * Include component CSS. Default true. Hosts that serve RENDERER_CSS as an external, immutable
   * stylesheet (apps/renderer) pass false so pages only inline per-site CSS.
   */
  components?: boolean;
}

/** Every node rendered for a page: header, footer, sections and referenced global sections. */
export function pageTrees(ctx: RenderContext, page: PageDocument): Node[] {
  const roots: Node[] = [ctx.definition.header, ctx.definition.footer, ...page.sections];
  const globals: Node[] = [];
  const seen = new Set<string>();
  walkNodes(roots, (n) => {
    if (n.type === 'global-section' && n.ref && !seen.has(n.ref)) {
      seen.add(n.ref);
      const g = ctx.globalSections.get(n.ref);
      if (g) globals.push(g.node);
    }
  });
  return [...roots, ...globals];
}

function usedChunks(trees: Node[]): string[] {
  const ids = new Set<string>(['base']);
  walkNodes(trees, (n) => {
    for (const id of TYPE_CSS.get(n.type) ?? []) ids.add(id);
  });
  const ordered = CHUNK_ORDER.filter((id) => ids.has(id));
  return [...ordered, ...[...ids].filter((id) => !CHUNK_ORDER.includes(id))];
}

/**
 * Complete CSS for a page: theme variables + fonts, component CSS (only chunks in use on the
 * public site; everything in the editor), animation base CSS, compiled node styles and
 * sanitized site/page custom CSS.
 */
export function getSiteCss(ctx: RenderContext, page: PageDocument, opts: SiteCssOptions = {}): string {
  const trees = pageTrees(ctx, page);
  const components = opts.components === false ? usedChunks(trees).filter((id) => !CHUNK_ORDER.includes(id)).map(chunk).join('') : ctx.mode === 'editor' ? RENDERER_CSS + usedChunks(trees).filter((id) => !CHUNK_ORDER.includes(id)).map(chunk).join('') : usedChunks(trees).map(chunk).join('');
  return [
    customFontFaces(ctx.theme),
    themeToCss(ctx.theme, '.atrium-site'),
    components,
    ANIMATION_BASE_CSS,
    compileTreeCss(trees, { scope: '.atrium-site' }),
    ctx.definition.customCss ? sanitizeCss(ctx.definition.customCss) : '',
    page.customCss ? sanitizeCss(page.customCss) : '',
  ].join('\n');
}

/** <style> with the page CSS plus the Google Fonts stylesheet (with preconnect). */
export function SiteStyles({ ctx, page, stylesheetHref }: { ctx: RenderContext; page: PageDocument; /** Serve component CSS from this URL instead of inlining it. */ stylesheetHref?: string }): ReactNode {
  const fonts = googleFontsUrl(ctx.theme);
  return (
    <>
      {fonts ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={fonts} />
        </>
      ) : null}
      {stylesheetHref ? <link rel="stylesheet" href={stylesheetHref} /> : null}
      <style data-atrium-css="" dangerouslySetInnerHTML={{ __html: getSiteCss(ctx, page, { components: !stylesheetHref }) }} />
    </>
  );
}

/** Whether any node on the page carries an animation (decides boot script + GSAP loading). */
export function pageHasAnimations(ctx: RenderContext, page: PageDocument): boolean {
  if (!ctx.animationsEnabled) return false;
  let found = false;
  walkNodes(pageTrees(ctx, page), (n) => {
    if (n.animation?.preset && n.animation.preset !== 'none') found = true;
    if ((n.type === 'horizontal-scroll' && n.props.pin !== false) || (n.type === 'experiences' && n.variant === 'horizontal-scroll')) found = true;
  });
  return found;
}
