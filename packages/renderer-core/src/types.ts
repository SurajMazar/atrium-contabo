import type { ComponentRegistry } from '@atrium/component-registry';
import type {
  CollectionDefinition, CollectionItem, FormDefinition, GlobalSection, LinkValue, Node, PageDocument, ResolvedLink,
  SiteSettings, SiteSnapshot, TemplateScope, ThemeTokens, WebsiteDefinition,
} from '@atrium/schema';
import type { ComponentType, ReactNode } from 'react';

export type RenderMode = 'live' | 'preview' | 'editor';

/** Responsive image variants for a media-library asset (optional manifest supplied by the host). */
export interface MediaVariantInfo {
  width?: number;
  height?: number;
  blurDataUrl?: string;
  variants: Array<{ width: number; url: string; format?: string }>;
}

export interface RenderOptions {
  definition: WebsiteDefinition;
  mode: RenderMode;
  locale?: string;
  websiteId?: string;
  /** Public API base for forms/analytics, e.g. http://localhost:4000/v1 */
  apiBaseUrl?: string;
  /** Captcha site keys and other public runtime config. */
  runtime?: SiteSnapshot['runtime'];
  collectionItem?: { collection: string; item: CollectionItem };
  /** Prefix for internal links (preview / path-based dev). No trailing slash. */
  basePath?: string;
  domain?: string;
  editor?: { playAnimations?: boolean; showEmptyPlaceholders?: boolean };
  /** Optional: media-library variants keyed by mediaId (or by src) for srcset generation. */
  media?: Record<string, MediaVariantInfo>;
  /** Override "now" (scheduling, upcoming events). */
  now?: Date;
}

export interface ImageHelpers {
  /** srcset for a src (Unsplash/imgix `w=` URLs or media variants); undefined when not derivable. */
  srcSet(src: string, mediaId?: string): string | undefined;
  info(src: string, mediaId?: string): MediaVariantInfo | undefined;
}

export interface RenderContext {
  definition: WebsiteDefinition;
  settings: SiteSettings;
  theme: ThemeTokens;
  mode: RenderMode;
  locale: string;
  defaultLocale: string;
  locales: string[];
  /** Current page (when rendering a page). */
  page?: PageDocument;
  /** Template variables for `{{…}}` interpolation (business, website, vars, social, page, year, item). */
  scope: TemplateScope;
  websiteId?: string;
  apiBaseUrl?: string;
  runtime: SiteSnapshot['runtime'];
  basePath: string;
  domain?: string;
  collectionItem?: { collection: string; item: CollectionItem };
  editor: { playAnimations: boolean; showEmptyPlaceholders: boolean };
  /** False in editor mode unless `editor.playAnimations`, and when theme motion is `none`. */
  animationsEnabled: boolean;
  forms: Map<string, FormDefinition>;
  collections: Map<string, CollectionDefinition>;
  globalSections: Map<string, GlobalSection>;
  registry: ComponentRegistry;
  now: Date;
  /** Nesting depth of the node being rendered (0 = page root / header / footer). */
  depth: number;
  /** Header should overlay the first section (transparent until scrolled). */
  headerOverlay: boolean;
  resolveLink(link: LinkValue | undefined | null): ResolvedLink | null;
  pagePath(pageId: string): string | undefined;
  /** Apply locale prefix + basePath to an internal absolute path (`/rooms` → `/_site/x/fr/rooms`). */
  localizePath(path: string, locale?: string): string;
  collectionItemPath(collection: string, slug: string): string;
  /** Absolute URL for an already-localized public path (uses canonicalBase, else https://domain). */
  absoluteUrl(path: string): string | undefined;
  image: ImageHelpers;
}

export interface RenderProps {
  node: Node;
  /** Props after translation, interpolation, bindings and schema defaults. */
  props: Record<string, any>;
  variant?: string;
  ctx: RenderContext;
  /** Root attributes every renderer must spread onto its root element. */
  attrs: Record<string, unknown>;
  children?: ReactNode;
}

export type Renderer = ComponentType<RenderProps>;
