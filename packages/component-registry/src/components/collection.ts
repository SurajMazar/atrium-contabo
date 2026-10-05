import { LinkSchema } from '@atrium/schema';
import { z } from 'zod';
import { defineComponent } from '../types';
import { buttonsControl, introControls, media, sectionBase, sectionControls } from '../fields';
import { aspect, aspectControl, columnsControl, columnsProp, optionalIntro, sectionButtons, showForVariants } from './shared';

/**
 * Generic CMS listing. Without an explicit `binding`, setting `collection`
 * auto-maps the collection's title field + common fields (image, summary…).
 */
export const collectionList = defineComponent({
  type: 'collection-list',
  name: 'Collection list',
  category: 'collection',
  level: 'section',
  icon: 'library',
  description: 'Lists items from a CMS collection (articles, case studies, properties, projects) as cards or a list, each linking to its detail page.',
  variants: [
    { id: 'grid', name: 'Grid', description: 'Image cards in a grid.' },
    { id: 'list', name: 'List', description: 'Rows with thumbnail, title, excerpt and meta.' },
    { id: 'minimal', name: 'Minimal', description: 'Text-only list with hairlines; suits journals and press.' },
    { id: 'featured', name: 'Featured', description: 'First item large, the rest in a grid.' },
  ],
  defaultVariant: 'grid',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    collection: z.string().max(80).optional(),
    items: z.array(z.object({
      title: z.string().max(200),
      image: media.optional(),
      text: z.string().max(800).optional(),
      meta: z.string().max(120).optional(),
      tag: z.string().max(60).optional(),
      date: z.string().max(40).optional(),
      href: LinkSchema.optional(),
      slug: z.string().max(160).optional(),
    })).max(200).default([]),
    columns: columnsProp(3, 4),
    imageAspect: aspect.default('3:2'),
    limit: z.number().int().min(1).max(200).optional(),
    linkLabel: z.string().max(40).default('Read more'),
    emptyText: z.string().max(200).default('Nothing here yet — check back soon.'),
    excludeCurrent: z.boolean().default(true),
    ...sectionButtons,
  }),
  defaultProps: { eyebrow: 'Journal', heading: 'Latest *stories*' },
  controls: [
    ...introControls,
    { name: 'collection', label: 'Collection', type: 'collection', group: 'content', help: 'Items are listed automatically; use Bind to customize the field mapping, filters and sorting.' },
    { name: 'items', label: 'Manual items', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }, { name: 'tag', label: 'Tag', type: 'text' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'text', label: 'Excerpt', type: 'textarea' }, { name: 'meta', label: 'Meta', type: 'text' }, { name: 'href', label: 'Link', type: 'link' }], itemDefaults: { title: 'Item' } },
    { ...columnsControl(4, 1), showIf: showForVariants(['grid', 'featured']) },
    { ...aspectControl('imageAspect', 'Image ratio'), showIf: showForVariants(['grid', 'list', 'featured']) },
    { name: 'limit', label: 'Maximum items', type: 'number', group: 'content', min: 1, max: 200 },
    { name: 'linkLabel', label: 'Link label', type: 'text', group: 'content' },
    { name: 'emptyText', label: 'Empty state text', type: 'text', group: 'content' },
    { name: 'excludeCurrent', label: 'Hide the item being viewed', type: 'toggle', group: 'advanced', help: 'On a detail page, omit the current item (for "More like this").' },
    buttonsControl(),
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['title', 'image', 'text', 'meta', 'tag', 'date', 'href', 'slug'] },
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Blogs, case studies, portfolios, property listings, team directories — any CMS collection.', example: { variant: 'grid', props: { heading: 'Case studies', collection: 'case-studies' } } },
});

export const collectionComponents = [collectionList];

