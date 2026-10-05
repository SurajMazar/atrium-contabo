import { z } from 'zod';

export const LinkObjectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('page'), pageId: z.string(), anchor: z.string().optional(), newTab: z.boolean().optional() }),
  z.object({ type: z.literal('url'), href: z.string(), newTab: z.boolean().optional(), rel: z.string().optional() }),
  z.object({ type: z.literal('anchor'), anchor: z.string() }),
  z.object({ type: z.literal('email'), email: z.string(), subject: z.string().optional() }),
  z.object({ type: z.literal('tel'), phone: z.string() }),
  z.object({ type: z.literal('whatsapp'), phone: z.string(), message: z.string().optional() }),
  z.object({ type: z.literal('collection-item'), collection: z.string(), slug: z.string() }),
]);

/** Plain strings are treated as hrefs (`/rooms`, `#contact`, `https://…`). */
export const LinkSchema = z.union([z.string(), LinkObjectSchema]);
export type LinkObject = z.infer<typeof LinkObjectSchema>;
export type LinkValue = z.infer<typeof LinkSchema>;

export interface LinkResolveContext {
  pagePath: (pageId: string) => string | undefined;
  collectionItemPath?: (collection: string, slug: string) => string | undefined;
}

export interface ResolvedLink {
  href: string;
  external: boolean;
  newTab: boolean;
  rel?: string;
}

export function resolveLink(link: LinkValue | undefined | null, ctx: LinkResolveContext): ResolvedLink | null {
  if (!link) return null;
  if (typeof link === 'string') {
    const external = /^(https?:)?\/\//.test(link);
    return { href: link, external, newTab: false, rel: external ? 'noopener' : undefined };
  }
  switch (link.type) {
    case 'page': {
      const path = ctx.pagePath(link.pageId) ?? '#';
      return { href: link.anchor ? `${path}#${link.anchor}` : path, external: false, newTab: !!link.newTab };
    }
    case 'url': {
      const newTab = !!link.newTab;
      return { href: link.href, external: true, newTab, rel: link.rel ?? (newTab ? 'noopener noreferrer' : 'noopener') };
    }
    case 'anchor':
      return { href: `#${link.anchor.replace(/^#/, '')}`, external: false, newTab: false };
    case 'email':
      return {
        href: `mailto:${link.email}${link.subject ? `?subject=${encodeURIComponent(link.subject)}` : ''}`,
        external: true,
        newTab: false,
      };
    case 'tel':
      return { href: `tel:${link.phone.replace(/[^+\d]/g, '')}`, external: true, newTab: false };
    case 'whatsapp':
      return {
        href: `https://wa.me/${link.phone.replace(/[^\d]/g, '')}${link.message ? `?text=${encodeURIComponent(link.message)}` : ''}`,
        external: true,
        newTab: true,
        rel: 'noopener noreferrer',
      };
    case 'collection-item':
      return { href: ctx.collectionItemPath?.(link.collection, link.slug) ?? `/${link.collection}/${link.slug}`, external: false, newTab: false };
  }
}
