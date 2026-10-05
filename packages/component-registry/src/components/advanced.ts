import { LinkSchema, safeUrlSchema } from '@atrium/schema';
import { z } from 'zod';
import { defineComponent } from '../types';
import { ButtonSchema, buttonItemControls, buttonsControl, headingLevel, introControls, media, mediaControl, sectionBase, sectionControls } from '../fields';
import { aspect, aspectControl, optionalIntro, opts } from './shared';

const U = (id: string, w = 2400) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

const panelItem = z.object({
  label: z.string().max(60),
  heading: z.string().max(200).optional(),
  text: z.string().max(3000).optional(),
  image: media.optional(),
  buttons: z.array(ButtonSchema).max(2).default([]),
});

export const tabs = defineComponent({
  type: 'tabs',
  name: 'Tabs',
  category: 'advanced',
  level: 'block',
  icon: 'panels-top-left',
  description: 'Content split into keyboard-accessible tabs. Each tab has text/image content, or child blocks (child N becomes panel N).',
  props: z.object({
    items: z.array(panelItem).max(10).default([]),
    style: z.enum(['underline', 'pills']).default('underline'),
    align: z.enum(['left', 'center']).default('left'),
  }),
  defaultProps: {
    items: [
      { label: 'Spring', heading: 'Blossom and clear peaks', text: 'March to May brings rhododendron in bloom and the clearest mountain mornings.', buttons: [] },
      { label: 'Monsoon', heading: 'Green and dramatic', text: 'June to August: lush valleys, waterfalls and quiet, reflective days.', buttons: [] },
      { label: 'Autumn', heading: 'Festival season', text: 'September to November — crisp air, golden light and Dashain celebrations.', buttons: [] },
    ],
  },
  controls: [
    { name: 'items', label: 'Tabs', type: 'list', group: 'content', itemLabel: 'label', item: [{ name: 'label', label: 'Tab label', type: 'text' }, { name: 'heading', label: 'Heading', type: 'text' }, { name: 'text', label: 'Text', type: 'textarea' }, { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }], itemDefaults: { label: 'Tab', buttons: [] } },
    { name: 'style', label: 'Style', type: 'segmented', group: 'style', options: opts(['underline', 'pills']) },
    { name: 'align', label: 'Tab alignment', type: 'segmented', group: 'layout', options: opts(['left', 'center']) },
  ],
  children: { allowed: 'any' },
  animations: { recommended: ['fade-up'] },
  ai: { useWhen: 'Parallel options (seasons, menus, packages) where only one needs to be visible at a time.' },
});

export const accordion = defineComponent({
  type: 'accordion',
  name: 'Accordion',
  category: 'advanced',
  level: 'block',
  icon: 'chevrons-up-down',
  description: 'Expandable panels using native details/summary — accessible and works without JavaScript.',
  props: z.object({
    items: z.array(z.object({ title: z.string().max(200), content: z.string().max(4000) })).max(40).default([]),
    allowMultiple: z.boolean().default(true),
    openFirst: z.boolean().default(false),
    style: z.enum(['lines', 'boxed']).default('lines'),
  }),
  defaultProps: { items: [{ title: 'Cancellation policy', content: 'Free cancellation up to 14 days before arrival.' }, { title: 'Children & extra beds', content: 'Children of all ages are welcome; extra beds are available in suites.' }] },
  controls: [
    { name: 'items', label: 'Panels', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'title', label: 'Title', type: 'text' }, { name: 'content', label: 'Content', type: 'textarea' }], itemDefaults: { title: 'Panel', content: '' } },
    { name: 'allowMultiple', label: 'Allow several open', type: 'toggle', group: 'advanced' },
    { name: 'openFirst', label: 'Open first panel', type: 'toggle', group: 'advanced' },
    { name: 'style', label: 'Style', type: 'segmented', group: 'style', options: opts(['lines', 'boxed']) },
  ],
  animations: { recommended: ['fade-up'] },
  ai: { useWhen: 'Policies, details and secondary information inside a custom section.', avoidWhen: 'For page-level FAQs use the faq section (adds structured data).' },
});

const overlayProps = {
  triggerLabel: z.string().max(60).default('Open'),
  triggerStyle: ButtonSchema.shape.style,
  title: z.string().max(200).optional(),
  text: z.string().max(4000).optional(),
};

export const modal = defineComponent({
  type: 'modal',
  name: 'Modal',
  category: 'advanced',
  level: 'block',
  icon: 'app-window',
  description: 'Button that opens an accessible dialog containing text or child blocks (e.g. a form or video).',
  props: z.object({ ...overlayProps, size: z.enum(['sm', 'md', 'lg']).default('md') }),
  defaultProps: { triggerLabel: 'View details', triggerStyle: 'outline', title: 'Details', text: 'Add content here or drop blocks inside the modal.' },
  controls: [
    { name: 'triggerLabel', label: 'Button label', type: 'text', group: 'content' },
    { name: 'triggerStyle', label: 'Button style', type: 'select', group: 'style', options: buttonItemControls[2]!.options },
    { name: 'title', label: 'Dialog title', type: 'text', group: 'content' },
    { name: 'text', label: 'Text', type: 'textarea', group: 'content' },
    { name: 'size', label: 'Size', type: 'segmented', group: 'layout', options: opts(['sm', 'md', 'lg']) },
  ],
  children: { allowed: 'any' },
  ai: { useWhen: 'Secondary content on demand: terms, floor plans, booking forms, videos.' },
});

export const drawer = defineComponent({
  type: 'drawer',
  name: 'Drawer',
  category: 'advanced',
  level: 'block',
  icon: 'panel-right',
  description: 'Button that slides in a side panel with text or child blocks.',
  props: z.object({ ...overlayProps, side: z.enum(['left', 'right']).default('right') }),
  defaultProps: { triggerLabel: 'Open panel', triggerStyle: 'outline', title: 'More information', text: 'Add content or drop blocks inside the drawer.' },
  controls: [
    { name: 'triggerLabel', label: 'Button label', type: 'text', group: 'content' },
    { name: 'triggerStyle', label: 'Button style', type: 'select', group: 'style', options: buttonItemControls[2]!.options },
    { name: 'title', label: 'Panel title', type: 'text', group: 'content' },
    { name: 'text', label: 'Text', type: 'textarea', group: 'content' },
    { name: 'side', label: 'Side', type: 'segmented', group: 'layout', options: opts(['left', 'right']) },
  ],
  children: { allowed: 'any' },
  ai: { useWhen: 'Filters, booking details or long supporting text without leaving the page.' },
});

export const marquee = defineComponent({
  type: 'marquee',
  name: 'Marquee',
  category: 'advanced',
  level: 'section',
  icon: 'move-horizontal',
  description: 'Continuously scrolling band of words (pure CSS; static for reduced motion).',
  props: z.object({
    ...sectionBase,
    items: z.array(z.object({ text: z.string().max(120) })).max(20).default([]),
    separator: z.string().max(4).default('✦'),
    speed: z.number().min(8).max(120).default(36),
    direction: z.enum(['left', 'right']).default('left'),
    size: z.enum(['md', 'lg', 'xl']).default('lg'),
    italic: z.boolean().default(true),
    pauseOnHover: z.boolean().default(true),
  }),
  defaultProps: { spacingTop: 'sm', spacingBottom: 'sm', items: [{ text: 'Weddings' }, { text: 'Celebrations' }, { text: 'Garden dinners' }, { text: 'Corporate retreats' }] },
  controls: [
    { name: 'items', label: 'Words', type: 'list', group: 'content', itemLabel: 'text', item: [{ name: 'text', label: 'Text', type: 'text' }], itemDefaults: { text: 'Word' } },
    { name: 'separator', label: 'Separator', type: 'text', group: 'content' },
    { name: 'speed', label: 'Loop duration (s)', type: 'slider', group: 'advanced', min: 8, max: 120 },
    { name: 'direction', label: 'Direction', type: 'segmented', group: 'layout', options: opts(['left', 'right']) },
    { name: 'size', label: 'Size', type: 'segmented', group: 'style', options: opts(['md', 'lg', 'xl']) },
    { name: 'italic', label: 'Italic', type: 'toggle', group: 'style' },
    { name: 'pauseOnHover', label: 'Pause on hover', type: 'toggle', group: 'advanced' },
    ...sectionControls,
  ],
  ai: { useWhen: 'Decorative rhythm between sections on expressive brands.', avoidWhen: 'Conveying essential information.' },
});

export const beforeAfter = defineComponent({
  type: 'before-after',
  name: 'Before / after',
  category: 'advanced',
  level: 'block',
  icon: 'square-split-horizontal',
  description: 'Draggable comparison slider between two images (keyboard accessible).',
  props: z.object({
    before: media,
    after: media,
    beforeLabel: z.string().max(40).default('Before'),
    afterLabel: z.string().max(40).default('After'),
    start: z.number().min(0).max(100).default(50),
    aspect: aspect.default('16:9'),
  }),
  defaultProps: {
    before: { src: U('1470071459604-3b5ec3a7fe05'), alt: 'Mist over forested hills' },
    after: { src: U('1501785888041-af3ef285b470'), alt: 'Clear lake view framed by mountains' },
  },
  controls: [
    mediaControl('before', 'Before image'),
    mediaControl('after', 'After image'),
    { name: 'beforeLabel', label: 'Before label', type: 'text', group: 'content' },
    { name: 'afterLabel', label: 'After label', type: 'text', group: 'content' },
    { name: 'start', label: 'Start position', type: 'slider', group: 'layout', min: 0, max: 100, unit: '%' },
    aspectControl(),
  ],
  styleControls: ['margin', 'maxWidth'],
  ai: { useWhen: 'Renovations, restorations, design transformations.' },
});

export const horizontalScroll = defineComponent({
  type: 'horizontal-scroll',
  name: 'Horizontal scroll',
  category: 'advanced',
  level: 'section',
  icon: 'gallery-horizontal-end',
  description: 'Section that pins while vertical scrolling moves a track of cards sideways. Falls back to a swipeable row without animation.',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({ image: media.optional(), eyebrow: z.string().max(60).optional(), title: z.string().max(160).optional(), text: z.string().max(500).optional(), link: LinkSchema.optional() })).max(20).default([]),
    cardWidth: z.enum(['sm', 'md', 'lg']).default('md'),
    imageAspect: aspect.default('3:4'),
    pin: z.boolean().default(true),
  }),
  defaultProps: {
    eyebrow: 'A day here',
    heading: 'From first light to *firelight*',
    items: [
      { eyebrow: '06:00', title: 'Sunrise paddle', image: { src: U('1476514525535-07fb3b4ae5f1', 1600), alt: 'Boat on a turquoise lake' } },
      { eyebrow: '09:00', title: 'Breakfast on the terrace', image: { src: U('1482049016688-2d3e1b311543', 1600), alt: 'Breakfast of eggs and avocado' } },
      { eyebrow: '14:00', title: 'Spa rituals', image: { src: U('1600334089648-b0d9d3028eb2', 1600), alt: 'Hot stone massage' } },
      { eyebrow: '19:30', title: 'Dinner by the water', image: { src: U('1559339352-11d035aa65de', 1600), alt: 'Lakeside restaurant terrace at dusk' } },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Cards', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }, { name: 'eyebrow', label: 'Label', type: 'text' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'text', label: 'Text', type: 'textarea' }, { name: 'link', label: 'Link', type: 'link' }], itemDefaults: { title: 'Card' } },
    { name: 'cardWidth', label: 'Card width', type: 'segmented', group: 'layout', options: opts(['sm', 'md', 'lg']) },
    aspectControl('imageAspect', 'Image ratio'),
    { name: 'pin', label: 'Pin while scrolling', type: 'toggle', group: 'advanced', help: 'Uses scroll-driven animation on capable devices.' },
    ...sectionControls,
  ],
  children: { allowed: 'any' },
  animations: { recommended: ['horizontal-scroll'], default: 'horizontal-scroll' },
  ai: { useWhen: 'Narrative sequences: a day at the resort, project timelines, collections.', avoidWhen: 'More than one per page.' },
});

export const stickyStory = defineComponent({
  type: 'sticky-story',
  name: 'Sticky storytelling',
  category: 'advanced',
  level: 'section',
  icon: 'book-image',
  description: 'Media stays pinned on one side while story steps scroll past; the image changes with each step.',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    steps: z.array(z.object({ eyebrow: z.string().max(60).optional(), title: z.string().max(200), text: z.string().max(1500).optional(), image: media.optional() })).max(12).default([]),
    mediaSide: z.enum(['left', 'right']).default('left'),
    mediaAspect: aspect.default('4:5'),
  }),
  defaultProps: {
    eyebrow: 'The journey',
    heading: 'How a day *unfolds*',
    steps: [
      { eyebrow: 'Arrive', title: 'Met at the shore', text: 'A wooden boat carries you across the lake to the retreat.', image: { src: U('1476514525535-07fb3b4ae5f1', 1800), alt: 'Wooden boat on a turquoise lake' } },
      { eyebrow: 'Settle', title: 'A suite above the water', text: 'Linen, timber and a terrace facing the peaks.', image: { src: U('1596394516093-501ba68a0ba6', 1800), alt: 'Bed on a deck overlooking the lake' } },
      { eyebrow: 'Restore', title: 'Rituals at the spa', text: 'Himalayan herbs, warm stones and unhurried hands.', image: { src: U('1600334089648-b0d9d3028eb2', 1800), alt: 'Hot stone massage' } },
    ],
  },
  controls: [
    ...introControls,
    { name: 'steps', label: 'Steps', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }, { name: 'eyebrow', label: 'Label', type: 'text' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'text', label: 'Text', type: 'textarea' }], itemDefaults: { title: 'Step' } },
    { name: 'mediaSide', label: 'Media side', type: 'segmented', group: 'layout', options: opts(['left', 'right']) },
    aspectControl('mediaAspect', 'Media ratio'),
    ...sectionControls,
  ],
  animations: { recommended: ['fade-up'] },
  ai: { useWhen: 'Step-by-step stories: the guest journey, a process, a wedding day.' },
});

export const parallaxBand = defineComponent({
  type: 'parallax-band',
  name: 'Parallax image band',
  category: 'advanced',
  level: 'section',
  icon: 'image-play',
  description: 'Full-bleed photograph that drifts subtly as you scroll, with an optional overlaid statement.',
  props: z.object({
    ...sectionBase,
    image: media,
    eyebrow: z.string().max(80).optional(),
    heading: z.string().max(300).optional(),
    headingLevel: headingLevel.default('h2'),
    text: z.string().max(600).optional(),
    buttons: z.array(ButtonSchema).max(2).default([]),
    height: z.enum(['sm', 'md', 'lg', 'screen']).default('lg'),
    overlayOpacity: z.number().min(0).max(0.9).default(0.3),
    intensity: z.enum(['subtle', 'medium', 'strong']).default('subtle'),
  }),
  defaultProps: {
    tone: 'inverse',
    spacingTop: 'none',
    spacingBottom: 'none',
    image: { src: U('1506905925346-21bda4d32df4'), alt: 'Mountain peaks above a sea of clouds at sunrise' },
    heading: 'Above the clouds, *below* the peaks',
  },
  controls: [
    mediaControl('image', 'Image'),
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'content' },
    { name: 'heading', label: 'Heading', type: 'textarea', group: 'content' },
    { name: 'text', label: 'Text', type: 'textarea', group: 'content' },
    buttonsControl(),
    { name: 'height', label: 'Height', type: 'segmented', group: 'layout', options: opts(['sm', 'md', 'lg', 'screen']) },
    { name: 'overlayOpacity', label: 'Overlay', type: 'slider', group: 'style', min: 0, max: 0.9, step: 0.05 },
    { name: 'intensity', label: 'Parallax intensity', type: 'segmented', group: 'style', options: opts(['subtle', 'medium', 'strong']) },
    ...sectionControls,
  ],
  animations: { recommended: ['fade', 'blur-reveal'] },
  ai: { useWhen: 'Breathing space between content-heavy sections; one evocative image.' },
});

export const animatedText = defineComponent({
  type: 'animated-text',
  name: 'Animated text',
  category: 'advanced',
  level: 'element',
  icon: 'text-cursor-input',
  description: 'Heading with a rotating word ("Celebrate your *wedding / anniversary / birthday*"). Screen readers hear the full sentence.',
  props: z.object({
    prefix: z.string().max(200).default('Celebrate your'),
    words: z.array(z.object({ text: z.string().max(60) })).min(1).max(10).default([{ text: 'wedding' }, { text: 'anniversary' }, { text: 'milestone' }]),
    suffix: z.string().max(200).optional(),
    interval: z.number().min(1).max(10).default(2.6),
    effect: z.enum(['slide', 'fade', 'type']).default('slide'),
    level: z.enum(['h1', 'h2', 'h3', 'h4', 'p']).default('h2'),
    size: z.enum(['md', 'lg', 'xl', 'display']).default('xl'),
    italicWords: z.boolean().default(true),
  }),
  controls: [
    { name: 'prefix', label: 'Before', type: 'text', group: 'content' },
    { name: 'words', label: 'Rotating words', type: 'list', group: 'content', itemLabel: 'text', item: [{ name: 'text', label: 'Word', type: 'text' }], itemDefaults: { text: 'word' } },
    { name: 'suffix', label: 'After', type: 'text', group: 'content' },
    { name: 'effect', label: 'Effect', type: 'segmented', group: 'style', options: opts(['slide', 'fade', 'type']) },
    { name: 'interval', label: 'Seconds per word', type: 'slider', group: 'advanced', min: 1, max: 10, step: 0.2 },
    { name: 'level', label: 'Tag', type: 'select', group: 'advanced', options: opts(['h1', 'h2', 'h3', 'h4', 'p']) },
    { name: 'size', label: 'Size', type: 'segmented', group: 'style', options: opts(['md', 'lg', 'xl', 'display']) },
    { name: 'italicWords', label: 'Italic words', type: 'toggle', group: 'style' },
  ],
  ai: { useWhen: 'Playful hero or section headings for events and creative brands.', avoidWhen: 'Formal corporate or legal contexts.' },
});

export const embed = defineComponent({
  type: 'embed',
  name: 'Embed',
  category: 'advanced',
  level: 'block',
  icon: 'code-xml',
  description: 'Third-party widget via iframe URL, sanitized HTML, or a sandboxed HTML snippet. Requires the code.manage permission to edit.',
  props: z.object({
    mode: z.enum(['iframe', 'html', 'sandbox']).default('iframe'),
    /** https only; non-allowlisted hosts are rendered without allow-same-origin (see EMBED_IFRAME_HOSTS). */
    url: safeUrlSchema('https', undefined, 1000).optional(),
    html: z.string().max(50_000).optional(),
    title: z.string().max(120).default('Embedded content'),
    aspect: aspect.default('16:9'),
    height: z.number().int().min(80).max(2000).optional(),
    allow: z
      .string()
      .max(200)
      .transform((v) => v.replace(/[^a-z0-9;\- ]/gi, ''))
      .optional(),
  }),
  defaultProps: { mode: 'iframe', title: 'Embedded content' },
  controls: [
    { name: 'mode', label: 'Type', type: 'segmented', group: 'content', options: [{ label: 'Iframe', value: 'iframe' }, { label: 'HTML', value: 'html' }, { label: 'Sandboxed', value: 'sandbox' }] },
    { name: 'url', label: 'URL', type: 'text', group: 'content', showIf: { prop: 'mode', equals: 'iframe' } },
    { name: 'html', label: 'HTML', type: 'code', group: 'content', showIf: { prop: 'mode', in: ['html', 'sandbox'] }, help: 'Scripts, inline handlers and javascript: URLs are removed in HTML mode. Use Sandboxed for widgets that need scripts.' },
    { name: 'title', label: 'Accessible title', type: 'text', group: 'content' },
    aspectControl(),
    { name: 'height', label: 'Fixed height (px)', type: 'number', group: 'layout', min: 80, max: 2000 },
    { name: 'allow', label: 'Iframe allow', type: 'text', group: 'advanced', placeholder: 'autoplay; fullscreen' },
  ],
  styleControls: ['margin', 'maxWidth'],
  ai: { useWhen: 'Booking engines, calendars, review widgets that provide an embed code.', avoidWhen: 'Anything achievable with a native component.' },
  tags: ['code', 'iframe', 'widget'],
});

export const globalSection = defineComponent({
  type: 'global-section',
  name: 'Global section',
  category: 'advanced',
  level: 'section',
  icon: 'blocks',
  description: 'Places a reusable global section (edited once, shown everywhere). The node’s `ref` points at WebsiteDefinition.globalSections[].id.',
  props: z.object({ label: z.string().max(120).optional() }),
  controls: [{ name: 'label', label: 'Label', type: 'text', group: 'advanced' }],
  ai: { useWhen: 'Repeating the same CTA, newsletter or booking bar across pages — set node.ref to the global section id.' },
});

export const advancedComponents = [tabs, accordion, modal, drawer, marquee, beforeAfter, horizontalScroll, stickyStory, parallaxBand, animatedText, embed, globalSection];

