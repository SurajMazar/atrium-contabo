import { LinkSchema, safeUrlSchema } from '@atrium/schema';
import { z } from 'zod';
import { defineComponent } from '../types';
import { ButtonSchema, buttonsControl, headingLevel, introControls, media, mediaControl, sectionBase, sectionControls } from '../fields';
import { aspect, aspectControl, columnsControl, columnsProp, optionalIntro, opts, sectionButtons, showForVariants } from './shared';

const U = (id: string, w = 2400) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

// ---------------------------------------------------------------------------

const roomItem = z.object({
  name: z.string().max(120),
  image: media.optional(),
  price: z.string().max(40).optional(),
  priceSuffix: z.string().max(40).optional(),
  size: z.string().max(40).optional(),
  guests: z.string().max(40).optional(),
  bed: z.string().max(60).optional(),
  view: z.string().max(60).optional(),
  summary: z.string().max(600).optional(),
  features: z.array(z.string().max(80)).max(12).default([]),
  slug: z.string().max(120).optional(),
  href: LinkSchema.optional(),
});

export const rooms = defineComponent({
  type: 'rooms',
  name: 'Rooms & suites',
  category: 'hospitality',
  level: 'section',
  icon: 'bed-double',
  description: 'Room and suite showcase with photography, key facts (size, guests, bed, view) and price from. Bind to a "rooms" collection to list them automatically.',
  variants: [
    { id: 'cards', name: 'Cards', description: 'Grid of room cards.' },
    { id: 'editorial-list', name: 'Editorial list', description: 'Large alternating rows with generous imagery; luxury feel.' },
    { id: 'carousel', name: 'Carousel', description: 'Swipeable row of rooms.' },
  ],
  defaultVariant: 'cards',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(roomItem).max(40).default([]),
    columns: columnsProp(3, 4),
    imageAspect: aspect.default('4:5'),
    showPrice: z.boolean().default(true),
    showFacts: z.boolean().default(true),
    ctaLabel: z.string().max(40).default('View room'),
    collection: z.string().max(60).default('rooms'),
    ...sectionButtons,
  }),
  defaultProps: {
    eyebrow: 'Stay',
    heading: 'Rooms & *suites*',
    subheading: 'Twenty-four rooms, each opening to the lake or the garden.',
    items: [
      { name: 'Garden Room', image: { src: U('1611892440504-42a792e24d32', 1600), alt: 'Timber garden room with a view to green foliage' }, price: '$240', priceSuffix: '/ night', size: '38 m²', guests: '2 guests', bed: 'King bed', features: [], slug: 'garden-room' },
      { name: 'Lake Suite', image: { src: U('1596394516093-501ba68a0ba6', 1600), alt: 'Suite bed on a deck overlooking the lake' }, price: '$420', priceSuffix: '/ night', size: '62 m²', guests: '3 guests', bed: 'King bed', features: [], slug: 'lake-suite' },
      { name: 'Summit Villa', image: { src: U('1578683010236-d716f9a3f461', 1600), alt: 'Spacious villa bedroom with floor-to-ceiling glass' }, price: '$780', priceSuffix: '/ night', size: '140 m²', guests: '6 guests', bed: '3 bedrooms', features: [], slug: 'summit-villa' },
    ],
  },
  controls: [
    ...introControls,
    {
      name: 'items', label: 'Rooms', type: 'list', group: 'content', itemLabel: 'name',
      item: [
        { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' },
        { name: 'name', label: 'Name', type: 'text' },
        { name: 'summary', label: 'Summary', type: 'textarea' },
        { name: 'price', label: 'Price from', type: 'text' },
        { name: 'priceSuffix', label: 'Price suffix', type: 'text' },
        { name: 'size', label: 'Size', type: 'text' },
        { name: 'guests', label: 'Guests', type: 'text' },
        { name: 'bed', label: 'Bed', type: 'text' },
        { name: 'view', label: 'View', type: 'text' },
        { name: 'href', label: 'Link', type: 'link' },
      ],
      itemDefaults: { name: 'New room', features: [] },
    },
    { ...columnsControl(4, 2), showIf: showForVariants(['cards']) },
    aspectControl('imageAspect', 'Image ratio'),
    { name: 'showPrice', label: 'Show price', type: 'toggle', group: 'content' },
    { name: 'showFacts', label: 'Show facts', type: 'toggle', group: 'content' },
    { name: 'ctaLabel', label: 'Room link label', type: 'text', group: 'content' },
    buttonsControl('buttons', 'Section buttons'),
    { name: 'collection', label: 'Detail page collection', type: 'collection', group: 'advanced', help: 'Used to build links from each room slug.' },
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['name', 'image', 'price', 'priceSuffix', 'size', 'guests', 'bed', 'view', 'summary', 'slug', 'href'] },
  animations: { recommended: ['stagger', 'fade-up', 'clip-reveal'], default: 'stagger' },
  ai: {
    useWhen: 'Hotels, resorts, lodges and B&Bs. Bind to the "rooms" collection with map { name: "{{item.name}}", image: "{{item.image}}", price: "{{item.price}}", size: "{{item.size}}", guests: "{{item.guests}}", slug: "{{item.slug}}" }.',
  },
});

// ---------------------------------------------------------------------------

export const amenities = defineComponent({
  type: 'amenities',
  name: 'Amenities',
  category: 'hospitality',
  level: 'section',
  icon: 'concierge-bell',
  description: 'Property amenities and services as an icon grid, image tiles or a compact list.',
  variants: [
    { id: 'icon-grid', name: 'Icon grid', description: 'Line icons with labels.' },
    { id: 'image-tiles', name: 'Image tiles', description: 'Photo tiles with overlaid titles.' },
    { id: 'list', name: 'List', description: 'Compact multi-column list.' },
  ],
  defaultVariant: 'icon-grid',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({ icon: z.string().max(40).optional(), title: z.string().max(120), text: z.string().max(400).optional(), image: media.optional() })).max(40).default([]),
    columns: columnsProp(4, 6),
  }),
  defaultProps: {
    eyebrow: 'Amenities',
    heading: 'Everything you need, *nothing* you don’t',
    items: [
      { icon: 'waves', title: 'Infinity pool' },
      { icon: 'flower-2', title: 'Spa & hammam' },
      { icon: 'utensils', title: 'Lakeside dining' },
      { icon: 'sailboat', title: 'Private jetty' },
      { icon: 'dumbbell', title: 'Fitness studio' },
      { icon: 'wifi', title: 'Fast Wi-Fi' },
      { icon: 'car', title: 'Airport transfers' },
      { icon: 'baby', title: 'Family friendly' },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Amenities', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'icon', label: 'Icon', type: 'icon' }, { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'text', label: 'Text', type: 'textarea' }], itemDefaults: { title: 'Amenity', icon: 'check' } },
    columnsControl(6, 2),
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['icon', 'title', 'text', 'image'] },
  animations: { recommended: ['stagger', 'fade'], default: 'stagger' },
  ai: { useWhen: 'Hotel/venue facilities overview. Use lucide icon names (waves, wifi, utensils, car, flower-2, dumbbell…).' },
});

// ---------------------------------------------------------------------------

const offerItem = z.object({
  title: z.string().max(160),
  image: media.optional(),
  badge: z.string().max(40).optional(),
  price: z.string().max(40).optional(),
  priceNote: z.string().max(80).optional(),
  description: z.string().max(800).optional(),
  inclusions: z.array(z.string().max(200)).max(20).default([]),
  validity: z.string().max(120).optional(),
  cta: ButtonSchema.optional(),
});

export const offers = defineComponent({
  type: 'offers',
  name: 'Packages & offers',
  category: 'hospitality',
  level: 'section',
  icon: 'gift',
  description: 'Special offers and packages with price, inclusions, validity and a booking action.',
  variants: [
    { id: 'cards', name: 'Cards', description: 'Offer cards in a grid.' },
    { id: 'list', name: 'List', description: 'Wide rows with image, inclusions and price.' },
    { id: 'featured', name: 'Featured', description: 'First offer large, the rest compact.' },
  ],
  defaultVariant: 'cards',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(offerItem).max(24).default([]),
    columns: columnsProp(3, 4),
    imageAspect: aspect.default('3:2'),
  }),
  defaultProps: {
    eyebrow: 'Offers',
    heading: 'Reasons to stay *longer*',
    items: [
      { title: 'Stay Longer', badge: 'Save 20%', image: { src: U('1476514525535-07fb3b4ae5f1', 1600), alt: 'Boat on a turquoise lake' }, price: 'From $1,150', priceNote: 'for 4 nights', description: 'Four nights for the price of three, with breakfast and a sunset cruise.', inclusions: ['Daily breakfast', 'Sunset boat cruise', 'Late check-out'], validity: 'Valid until 31 March', cta: { label: 'Book this offer', link: '/contact', style: 'outline', iconPosition: 'end' } },
      { title: 'Spa Retreat', image: { src: U('1544161515-4ab6ce6db874', 1600), alt: 'Relaxing massage treatment' }, price: 'From $640', priceNote: 'for 2 nights', description: 'Two nights with daily treatments and wellness cuisine.', inclusions: ['Two 60-minute treatments', 'Daily yoga', 'Wellness dinner'], validity: 'Year-round', cta: { label: 'Book this offer', link: '/contact', style: 'outline', iconPosition: 'end' } },
    ],
  },
  controls: [
    ...introControls,
    {
      name: 'items', label: 'Offers', type: 'list', group: 'content', itemLabel: 'title',
      item: [
        { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'badge', label: 'Badge', type: 'text' },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'price', label: 'Price', type: 'text' },
        { name: 'priceNote', label: 'Price note', type: 'text' },
        { name: 'inclusions', label: 'Inclusions (one per line)', type: 'textarea' },
        { name: 'validity', label: 'Validity', type: 'text' },
        { name: 'cta', label: 'Button', type: 'button' },
      ],
      itemDefaults: { title: 'New offer', inclusions: [] },
    },
    { ...columnsControl(4, 1), showIf: showForVariants(['cards']) },
    aspectControl('imageAspect', 'Image ratio'),
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['title', 'image', 'badge', 'price', 'priceNote', 'description', 'inclusions', 'validity'] },
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Hotel packages, seasonal offers, wedding packages, spa days.' },
});

// ---------------------------------------------------------------------------

export const dining = defineComponent({
  type: 'dining',
  name: 'Restaurant & dining',
  category: 'hospitality',
  level: 'section',
  icon: 'utensils-crossed',
  description: 'Restaurant or bar introduction: photography, story, highlights (cuisine, dress code) and opening hours, with reservation actions.',
  variants: [
    { id: 'split', name: 'Split', description: 'Image beside text with hours below.' },
    { id: 'feature', name: 'Feature', description: 'Large image with an overlapping information card.' },
  ],
  defaultVariant: 'split',
  props: z.object({
    ...sectionBase,
    eyebrow: z.string().max(80).optional(),
    heading: z.string().max(300),
    headingLevel: headingLevel.default('h2'),
    body: z.string().max(3000).optional(),
    image: media,
    secondaryImage: media.optional(),
    highlights: z.array(z.object({ label: z.string().max(60), value: z.string().max(160) })).max(6).default([]),
    hours: z.array(z.object({ label: z.string().max(60), value: z.string().max(120) })).max(8).default([]),
    buttons: z.array(ButtonSchema).max(3).default([]),
    imageSide: z.enum(['left', 'right']).default('left'),
  }),
  defaultProps: {
    eyebrow: 'Dining',
    heading: 'Lakeside, *seasonal*, unhurried',
    body: 'Our kitchen cooks with what the valley grows — river fish, mountain greens, heritage grains — served on a terrace that hangs over the water.',
    image: { src: U('1559339352-11d035aa65de'), alt: 'Restaurant terrace beside the lake at dusk' },
    highlights: [{ label: 'Cuisine', value: 'Modern Himalayan' }, { label: 'Setting', value: 'Terrace & fireside lounge' }],
    hours: [{ label: 'Breakfast', value: '7:00 – 10:30' }, { label: 'Lunch', value: '12:30 – 15:00' }, { label: 'Dinner', value: '18:30 – 22:00' }],
    buttons: [{ label: 'Reserve a table', link: '/contact', style: 'primary', iconPosition: 'end' }, { label: 'View menu', link: '/dining', style: 'link', iconPosition: 'end' }],
  },
  controls: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'content' },
    { name: 'heading', label: 'Heading', type: 'textarea', group: 'content' },
    { name: 'body', label: 'Body', type: 'textarea', group: 'content' },
    mediaControl('image', 'Image'),
    { ...mediaControl('secondaryImage', 'Detail image'), showIf: showForVariants(['split']) },
    { name: 'highlights', label: 'Highlights', type: 'list', group: 'content', itemLabel: 'label', item: [{ name: 'label', label: 'Label', type: 'text' }, { name: 'value', label: 'Value', type: 'text' }], itemDefaults: { label: 'Cuisine', value: '' } },
    { name: 'hours', label: 'Opening hours', type: 'list', group: 'content', itemLabel: 'label', item: [{ name: 'label', label: 'Service', type: 'text' }, { name: 'value', label: 'Hours', type: 'text' }], itemDefaults: { label: 'Dinner', value: '18:30 – 22:00' } },
    buttonsControl(),
    { name: 'imageSide', label: 'Image side', type: 'segmented', group: 'layout', options: opts(['left', 'right']) },
    ...sectionControls,
  ],
  animations: { recommended: ['fade-up', 'image-mask', 'editorial-reveal'], default: 'fade-up', supportsParts: true },
  ai: { useWhen: 'Hotel restaurants, bars, cafés; pair with menu on a dining page.' },
});

// ---------------------------------------------------------------------------

export const menu = defineComponent({
  type: 'menu',
  name: 'Food menu',
  category: 'hospitality',
  level: 'section',
  icon: 'book-open-text',
  description: 'Categorized food and drink menu with descriptions, prices and dietary tags.',
  variants: [
    { id: 'classic', name: 'Classic', description: 'Elegant list with dotted leaders to the price.' },
    { id: 'grid', name: 'Grid', description: 'Categories as columns of items.' },
    { id: 'tabs', name: 'Tabs', description: 'One category at a time behind tabs.' },
  ],
  defaultVariant: 'classic',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    categories: z.array(z.object({
      name: z.string().max(80),
      description: z.string().max(300).optional(),
      items: z.array(z.object({ name: z.string().max(120), description: z.string().max(400).optional(), price: z.string().max(30).optional(), tags: z.array(z.string().max(12)).max(6).default([]) })).max(60).default([]),
    })).max(20).default([]),
    columns: columnsProp(2, 2),
    note: z.string().max(400).optional(),
  }),
  defaultProps: {
    eyebrow: 'The menu',
    heading: 'From the *valley*',
    align: 'center',
    categories: [
      { name: 'To begin', items: [{ name: 'Smoked river trout', description: 'Timur pepper, pickled radish, buckwheat crisp', price: '14', tags: [] }, { name: 'Steamed momo', description: 'Hand-folded, wild garlic, tomato achar', price: '11', tags: ['V'] }] },
      { name: 'From the fire', items: [{ name: 'Himalayan lamb', description: 'Slow-roasted shoulder, mustard greens, gundruk jus', price: '32', tags: [] }, { name: 'Heritage grain bowl', description: 'Red rice, roasted squash, lentil dal, herbs', price: '22', tags: ['VG', 'GF'] }] },
    ],
    note: 'V vegetarian · VG vegan · GF gluten free. Please tell us about any allergies.',
  },
  controls: [
    ...introControls,
    {
      name: 'categories', label: 'Categories', type: 'list', group: 'content', itemLabel: 'name',
      item: [{ name: 'name', label: 'Category', type: 'text' }, { name: 'description', label: 'Description', type: 'text' }, { name: 'items', label: 'Dishes', type: 'list', itemLabel: 'name', item: [{ name: 'name', label: 'Dish', type: 'text' }, { name: 'description', label: 'Description', type: 'text' }, { name: 'price', label: 'Price', type: 'text' }, { name: 'tags', label: 'Tags', type: 'text' }] }],
      itemDefaults: { name: 'Category', items: [] },
    },
    { ...columnsControl(2, 1), showIf: showForVariants(['classic', 'grid']) },
    { name: 'note', label: 'Footnote', type: 'text', group: 'content' },
    ...sectionControls,
  ],
  animations: { recommended: ['fade-up', 'stagger'], default: 'fade-up' },
  ai: { useWhen: 'Restaurants, cafés, bars and hotel dining pages.' },
});

// ---------------------------------------------------------------------------

const experienceItem = z.object({
  title: z.string().max(160),
  image: media.optional(),
  tag: z.string().max(40).optional(),
  text: z.string().max(600).optional(),
  duration: z.string().max(40).optional(),
  price: z.string().max(40).optional(),
  link: LinkSchema.optional(),
});

export const experiences = defineComponent({
  type: 'experiences',
  name: 'Experiences',
  category: 'hospitality',
  level: 'section',
  icon: 'compass',
  description: 'Activities and experiences (tours, classes, excursions) with photo, duration and price — as cards, a horizontal scroll or a list.',
  variants: [
    { id: 'cards', name: 'Cards', description: 'Grid of tall image cards.' },
    { id: 'horizontal-scroll', name: 'Horizontal scroll', description: 'Cards scroll sideways as the page scrolls (pinned).' },
    { id: 'list', name: 'List', description: 'Rows with thumbnail, details and link.' },
  ],
  defaultVariant: 'cards',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(experienceItem).max(30).default([]),
    columns: columnsProp(3, 4),
    imageAspect: aspect.default('3:4'),
    ...sectionButtons,
  }),
  defaultProps: {
    eyebrow: 'Experiences',
    heading: 'Days worth *remembering*',
    items: [
      { title: 'Sunrise at Sarangkot', tag: 'Guided', image: { src: U('1580424917967-a8867a6e676e', 1600), alt: 'Snow peaks above layered hills at sunrise' }, duration: '4 hours', text: 'Watch first light strike the Annapurna range.' },
      { title: 'White-water rafting', tag: 'Adventure', image: { src: U('1530866495561-507c9faab2ed', 1600), alt: 'Rafters paddling through white water' }, duration: 'Full day', text: 'Grade III rapids with expert river guides.' },
      { title: 'Valley cooking class', tag: 'Culinary', image: { src: U('1556909114-f6e7ad7d3136', 1600), alt: 'Two people cooking together in a bright kitchen' }, duration: '3 hours', text: 'Fold momo and cook dal bhat with our chefs.' },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Experiences', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }, { name: 'tag', label: 'Tag', type: 'text' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'text', label: 'Text', type: 'textarea' }, { name: 'duration', label: 'Duration', type: 'text' }, { name: 'price', label: 'Price', type: 'text' }, { name: 'link', label: 'Link', type: 'link' }], itemDefaults: { title: 'New experience' } },
    { ...columnsControl(4, 2), showIf: showForVariants(['cards']) },
    aspectControl('imageAspect', 'Image ratio'),
    buttonsControl(),
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['title', 'image', 'tag', 'text', 'duration', 'price', 'link'] },
  animations: { recommended: ['stagger', 'horizontal-scroll', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Resort activities, tours, workshops, local excursions.' },
});

// ---------------------------------------------------------------------------

export const venues = defineComponent({
  type: 'venues',
  name: 'Venue spaces',
  category: 'hospitality',
  level: 'section',
  icon: 'building-2',
  description: 'Event spaces with photo, size and capacity per layout (banquet, theatre, cocktail…), plus a capacity comparison table.',
  variants: [
    { id: 'cards', name: 'Cards', description: 'Space cards with capacities.' },
    { id: 'detailed', name: 'Detailed', description: 'Alternating rows with full capacity breakdown.' },
    { id: 'table', name: 'Table', description: 'Capacity chart comparing every space.' },
  ],
  defaultVariant: 'detailed',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({
      name: z.string().max(120),
      image: media.optional(),
      description: z.string().max(1200).optional(),
      size: z.string().max(40).optional(),
      capacities: z.array(z.object({ layout: z.string().max(40), guests: z.string().max(20) })).max(8).default([]),
      features: z.array(z.string().max(80)).max(12).default([]),
      link: LinkSchema.optional(),
    })).max(20).default([]),
    showTable: z.boolean().default(true),
    columns: columnsProp(3, 4),
  }),
  defaultProps: {
    eyebrow: 'Spaces',
    heading: 'Rooms to *gather*',
    items: [
      { name: 'The Courtyard', image: { src: U('1523438885200-e635ba2c371e'), alt: 'Garden courtyard set for a ceremony with floral arches' }, size: '600 m²', description: 'An open-air courtyard framed by climbing roses and a stone colonnade.', capacities: [{ layout: 'Ceremony', guests: '220' }, { layout: 'Banquet', guests: '180' }, { layout: 'Cocktail', guests: '300' }], features: ['Natural light', 'Festoon lighting'] },
      { name: 'The Orangery', image: { src: U('1519167758481-83f550bb49b3'), alt: 'Elegant banquet hall with round tables and chandeliers' }, size: '320 m²', description: 'A glass-roofed hall for dinners and dancing in any season.', capacities: [{ layout: 'Banquet', guests: '140' }, { layout: 'Theatre', guests: '200' }, { layout: 'Cocktail', guests: '220' }], features: ['Dance floor', 'In-house AV'] },
    ],
  },
  controls: [
    ...introControls,
    {
      name: 'items', label: 'Spaces', type: 'list', group: 'content', itemLabel: 'name',
      item: [
        { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' },
        { name: 'name', label: 'Name', type: 'text' },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'size', label: 'Size', type: 'text' },
        { name: 'capacities', label: 'Capacities', type: 'list', itemLabel: 'layout', item: [{ name: 'layout', label: 'Layout', type: 'text' }, { name: 'guests', label: 'Guests', type: 'text' }] },
        { name: 'features', label: 'Features (one per line)', type: 'textarea' },
        { name: 'link', label: 'Link', type: 'link' },
      ],
      itemDefaults: { name: 'New space', capacities: [], features: [] },
    },
    { name: 'showTable', label: 'Capacity table', type: 'toggle', group: 'content', showIf: showForVariants(['cards', 'detailed']) },
    { ...columnsControl(4, 1), showIf: showForVariants(['cards']) },
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['name', 'image', 'description', 'size', 'capacities', 'features', 'link'] },
  animations: { recommended: ['fade-up', 'stagger', 'image-mask'], default: 'fade-up' },
  ai: { useWhen: 'Wedding venues, conference centres, hotels with event spaces.' },
});

// ---------------------------------------------------------------------------

export const events = defineComponent({
  type: 'events',
  name: 'Events',
  category: 'hospitality',
  level: 'section',
  icon: 'calendar-days',
  description: 'Upcoming events with dates, times and location. Past events are hidden automatically. Bind to an "events" collection.',
  variants: [
    { id: 'list', name: 'List', description: 'Date-led rows; clean and scannable.' },
    { id: 'cards', name: 'Cards', description: 'Image cards with date badges.' },
  ],
  defaultVariant: 'list',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({
      title: z.string().max(160),
      date: z.string().max(40),
      endDate: z.string().max(40).optional(),
      time: z.string().max(60).optional(),
      location: z.string().max(160).optional(),
      category: z.string().max(60).optional(),
      image: media.optional(),
      summary: z.string().max(800).optional(),
      link: LinkSchema.optional(),
      slug: z.string().max(120).optional(),
    })).max(60).default([]),
    showPast: z.boolean().default(false),
    limit: z.number().int().min(1).max(60).optional(),
    columns: columnsProp(3, 4),
    emptyText: z.string().max(200).default('New dates are announced soon.'),
    ...sectionButtons,
  }),
  defaultProps: {
    eyebrow: 'What’s on',
    heading: 'Upcoming *events*',
    items: [
      { title: 'Full Moon Supper Club', date: '2027-01-14', time: '19:00', location: 'Lakeside terrace', category: 'Dining', summary: 'A five-course dinner by candlelight with live sitar.' },
      { title: 'Himalayan Yoga Week', date: '2027-02-08', endDate: '2027-02-14', location: 'Garden pavilion', category: 'Wellness', summary: 'Seven days of practice, breathwork and nourishing food.' },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Events', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'title', label: 'Title', type: 'text' }, { name: 'date', label: 'Date', type: 'date' }, { name: 'endDate', label: 'End date', type: 'date' }, { name: 'time', label: 'Time', type: 'text' }, { name: 'location', label: 'Location', type: 'text' }, { name: 'category', label: 'Category', type: 'text' }, { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }, { name: 'summary', label: 'Summary', type: 'textarea' }, { name: 'link', label: 'Link', type: 'link' }], itemDefaults: { title: 'New event', date: '2027-01-01' } },
    { name: 'showPast', label: 'Include past events', type: 'toggle', group: 'content' },
    { name: 'limit', label: 'Maximum shown', type: 'number', group: 'content', min: 1, max: 60 },
    { name: 'emptyText', label: 'Text when empty', type: 'text', group: 'content' },
    { ...columnsControl(4, 2), showIf: showForVariants(['cards']) },
    buttonsControl(),
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['title', 'date', 'endDate', 'time', 'location', 'category', 'image', 'summary', 'link', 'slug'] },
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Event calendars for venues, restaurants and resorts. Dates in ISO format (YYYY-MM-DD). Emits Event structured data.' },
});

// ---------------------------------------------------------------------------

export const attractions = defineComponent({
  type: 'attractions',
  name: 'Nearby attractions',
  category: 'hospitality',
  level: 'section',
  icon: 'map-pinned',
  description: 'Places to explore nearby with distance or travel time, category and short description.',
  variants: [
    { id: 'list', name: 'List', description: 'Two-column list with distances.' },
    { id: 'cards', name: 'Cards', description: 'Image cards.' },
  ],
  defaultVariant: 'list',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({ name: z.string().max(120), distance: z.string().max(60).optional(), category: z.string().max(60).optional(), text: z.string().max(500).optional(), image: media.optional(), link: LinkSchema.optional() })).max(30).default([]),
    columns: columnsProp(2, 4),
  }),
  defaultProps: {
    eyebrow: 'The area',
    heading: 'Explore *nearby*',
    items: [
      { name: 'World Peace Pagoda', distance: '25 min by boat & trail', category: 'Landmark', text: 'A white stupa above the lake with sweeping views of the Annapurnas.' },
      { name: 'Sarangkot viewpoint', distance: '35 min drive', category: 'Nature', text: 'The classic sunrise viewpoint, and the launch site for paragliding.' },
      { name: 'Lakeside old town', distance: '10 min', category: 'Culture', text: 'Cafés, bookshops and craft stores along the eastern shore.' },
      { name: 'Davis Falls & Gupteshwor Cave', distance: '20 min drive', category: 'Nature', text: 'A dramatic waterfall that disappears into a sacred cave.' },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Places', type: 'list', group: 'content', itemLabel: 'name', item: [{ name: 'name', label: 'Name', type: 'text' }, { name: 'distance', label: 'Distance / time', type: 'text' }, { name: 'category', label: 'Category', type: 'text' }, { name: 'text', label: 'Text', type: 'textarea' }, { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }, { name: 'link', label: 'Link', type: 'link' }], itemDefaults: { name: 'Place' } },
    columnsControl(4, 1),
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['name', 'distance', 'category', 'text', 'image', 'link'] },
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Location pages for hotels, venues and rentals.' },
});

// ---------------------------------------------------------------------------

export const bookingCta = defineComponent({
  type: 'booking-cta',
  name: 'Booking bar',
  category: 'hospitality',
  level: 'section',
  icon: 'calendar-check',
  description: 'Availability search (arrival, departure, guests) that sends visitors to an external booking engine with the dates as URL parameters.',
  variants: [
    { id: 'bar', name: 'Bar', description: 'Slim horizontal bar; works under a hero.' },
    { id: 'card', name: 'Card', description: 'Boxed form with heading.' },
    { id: 'inline', name: 'Inline', description: 'Heading and text beside the form.' },
  ],
  defaultVariant: 'bar',
  props: z.object({
    ...sectionBase,
    eyebrow: z.string().max(80).optional(),
    heading: z.string().max(200).optional(),
    text: z.string().max(500).optional(),
    bookingUrl: safeUrlSchema('navigation', '/', 500).default('https://booking.example.com/reserve'),
    arrivalParam: z.string().max(40).default('checkin'),
    departureParam: z.string().max(40).default('checkout'),
    guestsParam: z.string().max(40).default('adults'),
    childrenParam: z.string().max(40).default('children'),
    showChildren: z.boolean().default(false),
    promoParam: z.string().max(40).optional(),
    extraParams: z.array(z.object({ key: z.string().max(40), value: z.string().max(200) })).max(10).default([]),
    maxGuests: z.number().int().min(1).max(30).default(6),
    defaultNights: z.number().int().min(1).max(30).default(2),
    buttonLabel: z.string().max(40).default('Check availability'),
    newTab: z.boolean().default(false),
  }),
  defaultProps: {
    spacingTop: 'md',
    spacingBottom: 'md',
    tone: 'surface',
    heading: 'Plan your stay',
    text: 'Best rates guaranteed when you book direct.',
  },
  controls: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'content' },
    { name: 'heading', label: 'Heading', type: 'text', group: 'content' },
    { name: 'text', label: 'Text', type: 'textarea', group: 'content' },
    { name: 'buttonLabel', label: 'Button label', type: 'text', group: 'content' },
    { name: 'bookingUrl', label: 'Booking engine URL', type: 'text', group: 'content', help: 'Dates and guests are appended as query parameters.' },
    { name: 'showChildren', label: 'Ask for children', type: 'toggle', group: 'content' },
    { name: 'maxGuests', label: 'Maximum guests', type: 'number', group: 'content', min: 1, max: 30 },
    { name: 'defaultNights', label: 'Default nights', type: 'number', group: 'content', min: 1, max: 30 },
    { name: 'arrivalParam', label: 'Arrival parameter', type: 'text', group: 'advanced' },
    { name: 'departureParam', label: 'Departure parameter', type: 'text', group: 'advanced' },
    { name: 'guestsParam', label: 'Guests parameter', type: 'text', group: 'advanced' },
    { name: 'childrenParam', label: 'Children parameter', type: 'text', group: 'advanced', showIf: { prop: 'showChildren', equals: true } },
    { name: 'promoParam', label: 'Promo code parameter', type: 'text', group: 'advanced', help: 'Shows a promo code field when set.' },
    { name: 'extraParams', label: 'Fixed parameters', type: 'list', group: 'advanced', itemLabel: 'key', item: [{ name: 'key', label: 'Key', type: 'text' }, { name: 'value', label: 'Value', type: 'text' }], itemDefaults: { key: 'hotel', value: '' } },
    { name: 'newTab', label: 'Open in new tab', type: 'toggle', group: 'advanced' },
    ...sectionControls,
  ],
  animations: { recommended: ['fade-up', 'fade'] },
  ai: { useWhen: 'Hotels with an external booking engine; place directly after the hero or before the footer.' },
});

export const hospitalityComponents = [rooms, amenities, offers, dining, menu, experiences, venues, events, attractions, bookingCta];
