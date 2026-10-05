/**
 * @atrium/renderer-core — React renderers for every registered component plus the page/site
 * rendering engine. Server-first (no hooks/context in shared components); interactivity lives in
 * small 'use client' islands. Works for SSR (apps/renderer) and full client rendering (editor canvas).
 */
import { registerBuiltinRenderers } from './builtin';

registerBuiltinRenderers();

export type { RenderOptions, RenderContext, RenderProps, RenderMode, Renderer, MediaVariantInfo, ImageHelpers } from './types';
export { createRenderContext, computeHeaderOverlay, withPage, withWidth, RESPONSIVE_WIDTHS, type CreateContextExtras } from './context';
export { PageView, siteRootAttrs, analyticsScripts, partitionScripts } from './page-view';
export { NodeView, EditorNodeView, childContext, resolveNode, type ResolvedNode } from './node-view';
export { getSiteCss, SiteStyles, RENDERER_CSS, RENDERER_CSS_HASH, minifyCss, type SiteCssOptions, pageHasAnimations, pageTrees } from './styles';
export { registerRenderer, getRenderer, listRenderers } from './registry';
export { BUILTIN_RENDERERS, CSS_CHUNKS, registerComponentCss, registerBuiltinRenderers } from './builtin';
export { buildMetadata, effectiveSeo, type SiteMetadata } from './metadata';
export { buildJsonLd, jsonLdScript } from './jsonld';
export {
  resolvePageForPath, isRedirect, normalizePath, isPageLive, findNotFoundPage, publicPathFor, listRoutes, buildSitemapXml, buildRobotsTxt,
  collectionPrefix, type ResolvePathResult, type ResolvedPage, type ResolvedRedirect, type ResolveOptions, type RouteEntry,
} from './routing';
export { interpolateProps, resolveTemplateString, applyBinding, applyTranslations, visibilityOf, collectionRows, selectRows, parseWithSchema } from './props';
export { formIslandProps } from './components/forms';

// UI primitives for plugin renderers
export { cx, root, editProp, part, Rich, Paragraphs, Heading, plain, Dropzone, EditorNotice, aspectStyle } from './ui/core';
export { AImage, Frame, toMedia, gridSizes, type AImageProps } from './ui/media';
export { Icon, resolveIcon, hasIcon, type IconProps } from './ui/icon';
export { ALink, Btn, Buttons, type ButtonData } from './ui/actions';
export { Section, Intro, headingId } from './ui/section';
export { sanitizeHtml } from './ui/sanitize';
export { ICON_DATA, ICON_ALIASES } from './ui/icons-data';
