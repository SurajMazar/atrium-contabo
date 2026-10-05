/** Shared "rooms" collection + detail template used by the resort and minimal-hotel blueprints. */
import type { ImageKey } from '../images';
import { anim, btn, ctaSection, img, item, page, type Collection, type Section } from './shared';

export interface RoomSeed {
  slug: string;
  name: string;
  summary: string;
  description: string;
  price: string;
  size: string;
  guests: string;
  bed: string;
  view: string;
  image: ImageKey;
  gallery: ImageKey[];
}

export const ROOM_BINDING_MAP = {
  name: '{{item.name}}',
  image: '{{item.image}}',
  price: '{{item.price}}',
  priceSuffix: '/ night',
  size: '{{item.size}}',
  guests: '{{item.guests}}',
  bed: '{{item.bed}}',
  view: '{{item.view}}',
  summary: '{{item.summary}}',
  slug: '{{item.slug}}',
};

export function roomsCollection(seeds: RoomSeed[], name = 'Rooms'): Collection {
  return {
    slug: 'rooms',
    name,
    singularName: 'Room',
    description: 'Room types listed on the Rooms page and the homepage.',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'summary', label: 'Summary', type: 'textarea' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'image', label: 'Main image', type: 'image' },
      { key: 'gallery', label: 'Gallery', type: 'gallery' },
      { key: 'price', label: 'Price from', type: 'text' },
      { key: 'size', label: 'Size', type: 'text' },
      { key: 'guests', label: 'Guests', type: 'text' },
      { key: 'bed', label: 'Bed', type: 'text' },
      { key: 'view', label: 'View', type: 'text' },
    ],
    titleField: 'name',
    routePrefix: 'rooms',
    items: seeds.map((s, i) =>
      item('rooms', s.slug, i, {
        name: s.name, summary: s.summary, description: s.description, price: s.price, size: s.size, guests: s.guests, bed: s.bed, view: s.view,
        image: img(s.image, { width: 1800 }), gallery: s.gallery.map((g) => img(g, { width: 1600 })),
      }),
    ),
  };
}

/** Collection-template page rendered at /rooms/{slug}. */
export function roomDetailPage(o: { inclusions: Array<{ title: string; icon: string }>; bookLink: string }) {
  const sections: Section[] = [
    {
      type: 'hero',
      variant: 'fullscreen-image',
      props: { tone: 'inverse', eyebrow: 'Rooms', heading: '{{item.name}}', subheading: '{{item.summary}}', buttons: [btn('Check availability', o.bookLink), btn('All rooms', '/rooms', 'outline')], image: { src: '{{item.image}}', alt: '{{item.name}}' }, height: 'tall', overlayOpacity: 0.35, spacingTop: 'none', spacingBottom: 'none' },
      animation: anim.cinematic,
    },
    { type: 'stats', variant: 'inline', props: { items: [{ value: '{{item.size}}', label: 'Size' }, { value: '{{item.guests}}', label: 'Sleeps' }, { value: '{{item.bed}}', label: 'Bed' }, { value: '{{item.price}}', label: 'Per night from' }], columns: 4, spacingTop: 'md', spacingBottom: 'md' } },
    { type: 'text-section', variant: 'two-column', props: { eyebrow: 'About this room', heading: 'Designed for *rest*', body: '{{item.description}}', buttons: [btn('Enquire about this room', o.bookLink, 'link')], align: 'left' }, animation: anim.fadeUp },
    { type: 'gallery', variant: 'editorial', props: { eyebrow: 'Gallery', heading: 'A closer *look*', images: [], fromItemField: 'gallery', columns: 3, lightbox: true }, animation: anim.stagger },
    { type: 'benefits', variant: 'grid', props: { tone: 'surface', eyebrow: 'Included', heading: 'Every stay *includes*', items: o.inclusions, columns: 4, image: undefined } },
    { type: 'collection-list', variant: 'grid', props: { eyebrow: 'Also consider', heading: 'Other *rooms*', collection: 'rooms', limit: 3, columns: 3, imageAspect: '4:5', linkLabel: 'View room', excludeCurrent: true }, animation: anim.stagger },
    ctaSection({ heading: 'Make it *yours*', subheading: 'Send us your dates and we will confirm availability within a few hours.', buttons: [btn('Check availability', o.bookLink)] }),
  ];
  return page({ title: 'Room detail', slug: 'room-detail', kind: 'collection-template', collection: 'rooms', seoTitle: '{{item.name}}', seoDescription: '{{item.summary}}', sections });
}
