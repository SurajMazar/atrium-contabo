import { safeUrlSchema } from '@atrium/schema';
import { z } from 'zod';
import { defineComponent } from '../types';
import { ButtonSchema, buttonsControl, headingLevel, introControls, media, mediaControl, sectionBase, sectionControls } from '../fields';
import { aspect, aspectControl, cardItemLink, columnsControl, columnsProp, optionalIntro, opts, sectionButtons, showForVariants } from './shared';

const U = (id: string, w = 2400) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

const textControls = {
  eyebrow: { name: 'eyebrow', label: 'Eyebrow', type: 'text', group: 'content' } as const,
  heading: { name: 'heading', label: 'Heading', type: 'textarea', group: 'content', help: 'Use *asterisks* for italic emphasis.' } as const,
};

// ---------------------------------------------------------------------------

export const cta = defineComponent({
  type: 'cta',
  name: 'Call to action',
  category: 'marketing',
  level: 'section',
  icon: 'megaphone',
  description: 'Focused closing prompt with a headline, short supporting line and one or two actions.',
  variants: [
    { id: 'banner', name: 'Banner', description: 'Compact horizontal band: text left, actions right.' },
    { id: 'split', name: 'Split', description: 'Text beside a photograph.' },
    { id: 'centered', name: 'Centered', description: 'Centered statement with actions below.' },
    { id: 'image-background', name: 'Image background', description: 'Text over a full-bleed photograph.' },
  ],
  defaultVariant: 'centered',
  props: z.object({
    ...sectionBase,
    eyebrow: z.string().max(80).optional(),
    heading: z.string().max(300),
    headingLevel: headingLevel.default('h2'),
    subheading: z.string().max(800).optional(),
    buttons: z.array(ButtonSchema).max(3).default([]),
    image: media.optional(),
    imageSide: z.enum(['left', 'right']).default('right'),
    overlayOpacity: z.number().min(0).max(0.9).default(0.45),
  }),
  defaultProps: {
    tone: 'surface',
    eyebrow: 'Plan your visit',
    heading: 'Your table by the lake is *waiting*',
    subheading: 'Tell us your dates and we will shape the stay around you.',
    buttons: [
      { label: 'Enquire now', link: '/contact', style: 'primary', iconPosition: 'end' },
      { label: 'View rooms', link: '/rooms', style: 'outline', iconPosition: 'end' },
    ],
    image: { src: U('1519681393784-d120267933ba'), alt: 'Starry sky over snow-covered mountains' },
  },
  controls: [
    textControls.eyebrow,
    textControls.heading,
    { name: 'subheading', label: 'Supporting text', type: 'textarea', group: 'content' },
    buttonsControl(),
    { ...mediaControl('image', 'Image'), showIf: showForVariants(['split', 'image-background']) },
    { name: 'imageSide', label: 'Image side', type: 'segmented', group: 'layout', options: opts(['left', 'right']), showIf: showForVariants(['split']) },
    { name: 'overlayOpacity', label: 'Overlay', type: 'slider', group: 'style', min: 0, max: 0.9, step: 0.05, showIf: showForVariants(['image-background']) },
    { name: 'headingLevel', label: 'Heading level', type: 'select', group: 'advanced', options: opts(['h2', 'h3', 'h4']) },
    ...sectionControls,
  ],
  animations: { recommended: ['fade-up', 'editorial-reveal', 'blur-reveal'], default: 'fade-up', supportsParts: true },
  ai: { useWhen: 'End of most pages to drive the primary conversion (book, enquire, contact).', avoidWhen: 'More than two per page.' },
});

// ---------------------------------------------------------------------------

const featureItem = z.object({
  icon: z.string().max(40).optional(),
  image: media.optional(),
  eyebrow: z.string().max(60).optional(),
  title: z.string().max(160),
  text: z.string().max(800).optional(),
  ...cardItemLink,
});

export const features = defineComponent({
  type: 'features',
  name: 'Features',
  category: 'marketing',
  level: 'section',
  icon: 'layout-list',
  description: 'Set of features, services or highlights with icons or images — as a grid, list, alternating rows, compact icon row or cards.',
  variants: [
    { id: 'grid', name: 'Grid', description: 'Icon, title and text in an airy grid.' },
    { id: 'list', name: 'List', description: 'Numbered list with hairline dividers; editorial.' },
    { id: 'alternating', name: 'Alternating', description: 'Image and text rows that alternate sides.' },
    { id: 'icon-row', name: 'Icon row', description: 'Compact single row of icons with short labels.' },
    { id: 'cards', name: 'Cards', description: 'Image cards with title, text and link.' },
  ],
  defaultVariant: 'grid',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(featureItem).max(24).default([]),
    columns: columnsProp(3, 4),
    iconStyle: z.enum(['plain', 'circle', 'square']).default('plain'),
    imageAspect: aspect.default('4:3'),
    numbered: z.boolean().default(false),
    ...sectionButtons,
  }),
  defaultProps: {
    eyebrow: 'Why guests return',
    heading: 'Considered in every *detail*',
    items: [
      { icon: 'mountain', title: 'Himalayan views', text: 'Every suite faces the water and the snow peaks beyond.' },
      { icon: 'leaf', title: 'Garden to table', text: 'Our kitchen cooks with what the valley grows each season.' },
      { icon: 'sparkles', title: 'Quiet luxury', text: 'Thoughtful service that is present when needed and never in the way.' },
    ],
  },
  controls: [
    ...introControls,
    {
      name: 'items', label: 'Items', type: 'list', group: 'content', itemLabel: 'title',
      item: [
        { name: 'icon', label: 'Icon', type: 'icon' },
        { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' },
        { name: 'eyebrow', label: 'Label', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'text', label: 'Text', type: 'textarea' },
        { name: 'link', label: 'Link', type: 'link' },
        { name: 'linkLabel', label: 'Link label', type: 'text' },
      ],
      itemDefaults: { title: 'New feature', text: 'Describe the benefit in a sentence.', icon: 'sparkle' },
    },
    { ...columnsControl(4, 2), showIf: showForVariants(['grid', 'cards', 'icon-row']) },
    { name: 'iconStyle', label: 'Icon style', type: 'segmented', group: 'style', options: opts(['plain', 'circle', 'square']), showIf: showForVariants(['grid', 'list', 'icon-row']) },
    { ...aspectControl('imageAspect', 'Image ratio'), showIf: showForVariants(['alternating', 'cards']) },
    { name: 'numbered', label: 'Show numbers', type: 'toggle', group: 'style', showIf: showForVariants(['grid', 'list', 'alternating']) },
    buttonsControl(),
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['title', 'text', 'image', 'icon', 'eyebrow', 'link'] },
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Services, amenities overview, product features or reasons to choose the business. Alternating suits 3–4 rich items with photos.' },
});

// ---------------------------------------------------------------------------

export const stats = defineComponent({
  type: 'stats',
  name: 'Stats',
  category: 'marketing',
  level: 'section',
  icon: 'chart-no-axes-column',
  description: 'Key figures (years, guests, ratings, outcomes) displayed inline, as cards or as oversized numerals.',
  variants: [
    { id: 'inline', name: 'Inline', description: 'Row of figures divided by hairlines.' },
    { id: 'cards', name: 'Cards', description: 'Figures in subtle cards with descriptions.' },
    { id: 'large', name: 'Large', description: 'Oversized display numerals; editorial.' },
  ],
  defaultVariant: 'inline',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({ value: z.string().max(20), label: z.string().max(80), description: z.string().max(300).optional(), prefix: z.string().max(4).optional(), suffix: z.string().max(6).optional() })).max(8).default([]),
    columns: columnsProp(4, 6),
    dividers: z.boolean().default(true),
  }),
  defaultProps: {
    spacingTop: 'md',
    spacingBottom: 'md',
    items: [
      { value: '24', label: 'Lakeside suites' },
      { value: '1', suffix: 'km', label: 'Private shoreline' },
      { value: '4.9', label: 'Average guest rating' },
      { value: '2009', label: 'Welcoming guests since' },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Figures', type: 'list', group: 'content', itemLabel: 'label', item: [{ name: 'prefix', label: 'Prefix', type: 'text' }, { name: 'value', label: 'Value', type: 'text' }, { name: 'suffix', label: 'Suffix', type: 'text' }, { name: 'label', label: 'Label', type: 'text' }, { name: 'description', label: 'Description', type: 'textarea' }], itemDefaults: { value: '10', label: 'Label' } },
    columnsControl(6, 2),
    { name: 'dividers', label: 'Dividers', type: 'toggle', group: 'style', showIf: showForVariants(['inline', 'large']) },
    ...sectionControls,
  ],
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Credibility through numbers: years in business, capacity, ratings, results.', avoidWhen: 'Numbers you cannot substantiate.' },
});

// ---------------------------------------------------------------------------

const testimonialItem = z.object({
  quote: z.string().max(1200),
  author: z.string().max(120),
  role: z.string().max(160).optional(),
  avatar: media.optional(),
  rating: z.number().min(0).max(5).optional(),
  source: z.string().max(60).optional(),
});

export const testimonials = defineComponent({
  type: 'testimonials',
  name: 'Testimonials',
  category: 'marketing',
  level: 'section',
  icon: 'message-square-quote',
  description: 'Guest or client reviews with attribution, optional rating and source — as a carousel, grid or a single large quote.',
  variants: [
    { id: 'carousel', name: 'Carousel', description: 'One quote at a time with controls.' },
    { id: 'grid', name: 'Grid', description: 'Several reviews side by side.' },
    { id: 'single', name: 'Single', description: 'One large editorial quote.' },
  ],
  defaultVariant: 'carousel',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(testimonialItem).max(24).default([]),
    columns: columnsProp(3, 4),
    showRating: z.boolean().default(true),
    autoplay: z.boolean().default(false),
  }),
  defaultProps: {
    eyebrow: 'Guest words',
    align: 'center',
    items: [
      { quote: 'We woke to the mountains turning pink over the lake and never wanted to leave. Every detail felt quietly anticipated.', author: 'Clara & Tomás', role: 'Stayed in the Lake Suite', rating: 5, source: 'Google' },
      { quote: 'The kind of calm that only comes from people who truly care. The food alone is worth the journey.', author: 'Priya Raman', role: 'Wellness retreat guest', rating: 5 },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Testimonials', type: 'list', group: 'content', itemLabel: 'author', item: [{ name: 'quote', label: 'Quote', type: 'textarea' }, { name: 'author', label: 'Name', type: 'text' }, { name: 'role', label: 'Detail', type: 'text' }, { name: 'avatar', label: 'Photo', type: 'media', mediaKind: 'image' }, { name: 'rating', label: 'Rating', type: 'slider', min: 0, max: 5, step: 1 }, { name: 'source', label: 'Source', type: 'text' }], itemDefaults: { quote: 'A wonderful experience.', author: 'Guest name', rating: 5 } },
    { ...columnsControl(4, 2), showIf: showForVariants(['grid']) },
    { name: 'showRating', label: 'Show ratings', type: 'toggle', group: 'style' },
    { name: 'autoplay', label: 'Autoplay', type: 'toggle', group: 'advanced', showIf: showForVariants(['carousel']) },
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['quote', 'author', 'role', 'avatar', 'rating', 'source'] },
  animations: { recommended: ['fade-up', 'text-reveal', 'stagger'], default: 'fade-up' },
  ai: { useWhen: 'Social proof near decision points (after rooms, before CTA).', avoidWhen: 'Never invent reviews for real businesses; use placeholders the owner will replace.' },
});

// ---------------------------------------------------------------------------

export const faq = defineComponent({
  type: 'faq',
  name: 'FAQ',
  category: 'marketing',
  level: 'section',
  icon: 'circle-help',
  description: 'Frequently asked questions as an accessible accordion (native details/summary). Emits FAQPage structured data for search engines.',
  variants: [
    { id: 'accordion', name: 'Accordion', description: 'Centered list of expandable questions.' },
    { id: 'two-column', name: 'Two column', description: 'Intro and contact prompt on the left, questions on the right.' },
  ],
  defaultVariant: 'two-column',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({ question: z.string().max(300), answer: z.string().max(3000) })).max(60).default([]),
    allowMultiple: z.boolean().default(true),
    openFirst: z.boolean().default(false),
    emitSchema: z.boolean().default(true),
    cta: ButtonSchema.optional(),
  }),
  defaultProps: {
    eyebrow: 'Good to know',
    heading: 'Questions, *answered*',
    subheading: 'Anything else? Our team replies within a few hours.',
    cta: { label: 'Contact us', link: '/contact', style: 'link', iconPosition: 'end' },
    items: [
      { question: 'What time are check-in and check-out?', answer: 'Check-in is from 2pm and check-out until 11am. Early arrival and late departure can be arranged on request.' },
      { question: 'Do you arrange airport transfers?', answer: 'Yes — private transfers from Pokhara International Airport take around 25 minutes and can be added to any booking.' },
      { question: 'Is breakfast included?', answer: 'A seasonal breakfast is included with every stay and served on the terrace from 7am.' },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Questions', type: 'list', group: 'content', itemLabel: 'question', item: [{ name: 'question', label: 'Question', type: 'text' }, { name: 'answer', label: 'Answer', type: 'textarea' }], itemDefaults: { question: 'New question?', answer: 'Answer.' } },
    { name: 'cta.label', label: 'Prompt link label', type: 'text', group: 'content', showIf: showForVariants(['two-column']) },
    { name: 'cta.link', label: 'Prompt link', type: 'link', group: 'content', showIf: showForVariants(['two-column']) },
    { name: 'allowMultiple', label: 'Allow several open', type: 'toggle', group: 'advanced' },
    { name: 'openFirst', label: 'Open first item', type: 'toggle', group: 'advanced' },
    { name: 'emitSchema', label: 'FAQ structured data', type: 'toggle', group: 'advanced', help: 'Adds FAQPage JSON-LD for rich results.' },
    ...sectionControls,
  ],
  bindable: { listProp: 'items', itemFields: ['question', 'answer'] },
  animations: { recommended: ['fade-up', 'stagger'], default: 'fade-up' },
  ai: { useWhen: 'Practical questions (policies, logistics, pricing). Improves SEO via FAQPage schema.' },
});

// ---------------------------------------------------------------------------

const plan = z.object({
  name: z.string().max(80),
  price: z.string().max(40),
  period: z.string().max(40).optional(),
  description: z.string().max(400).optional(),
  features: z.array(z.string().max(200)).max(30).default([]),
  cta: ButtonSchema.optional(),
  highlighted: z.boolean().default(false),
  badge: z.string().max(40).optional(),
});

export const pricing = defineComponent({
  type: 'pricing',
  name: 'Pricing',
  category: 'marketing',
  level: 'section',
  icon: 'badge-dollar-sign',
  description: 'Plans or packages with price, inclusions and action — as cards or a comparison table.',
  variants: [
    { id: 'cards', name: 'Cards', description: 'Plan cards side by side; one can be highlighted.' },
    { id: 'table', name: 'Table', description: 'Comparison table of features across plans.' },
  ],
  defaultVariant: 'cards',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    plans: z.array(plan).max(6).default([]),
    comparisonRows: z.array(z.object({ label: z.string().max(160), values: z.array(z.string().max(80)).default([]) })).max(40).default([]),
    footnote: z.string().max(400).optional(),
  }),
  defaultProps: {
    eyebrow: 'Pricing',
    heading: 'Simple, transparent *plans*',
    align: 'center',
    plans: [
      { name: 'Essential', price: '$29', period: 'per month', description: 'For small teams getting started.', features: ['Up to 5 users', 'Core reporting', 'Email support'], cta: { label: 'Start free trial', link: '/contact', style: 'outline', iconPosition: 'end' }, highlighted: false },
      { name: 'Growth', price: '$79', period: 'per month', description: 'Everything a growing team needs.', features: ['Up to 25 users', 'Advanced reporting', 'Priority support', 'Integrations'], cta: { label: 'Start free trial', link: '/contact', style: 'primary', iconPosition: 'end' }, highlighted: true, badge: 'Most popular' },
      { name: 'Enterprise', price: 'Custom', description: 'Security, scale and dedicated success.', features: ['Unlimited users', 'SSO & audit logs', 'Dedicated manager'], cta: { label: 'Talk to sales', link: '/contact', style: 'outline', iconPosition: 'end' }, highlighted: false },
    ],
  },
  controls: [
    ...introControls,
    {
      name: 'plans', label: 'Plans', type: 'list', group: 'content', itemLabel: 'name',
      item: [{ name: 'name', label: 'Name', type: 'text' }, { name: 'price', label: 'Price', type: 'text' }, { name: 'period', label: 'Period', type: 'text' }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'features', label: 'Inclusions (one per line)', type: 'textarea' }, { name: 'badge', label: 'Badge', type: 'text' }, { name: 'highlighted', label: 'Highlight', type: 'toggle' }, { name: 'cta', label: 'Button', type: 'button' }],
      itemDefaults: { name: 'Plan', price: '$0', features: [] },
    },
    { name: 'comparisonRows', label: 'Comparison rows', type: 'list', group: 'content', itemLabel: 'label', item: [{ name: 'label', label: 'Feature', type: 'text' }, { name: 'values', label: 'Values per plan (one per line)', type: 'textarea' }], showIf: showForVariants(['table']), help: 'Leave empty to build the table from plan inclusions.' },
    { name: 'footnote', label: 'Footnote', type: 'text', group: 'content' },
    ...sectionControls,
  ],
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'SaaS plans, service tiers, membership levels.', avoidWhen: 'Hospitality packages — use offers.' },
});

// ---------------------------------------------------------------------------

export const team = defineComponent({
  type: 'team',
  name: 'Team',
  category: 'marketing',
  level: 'section',
  icon: 'users',
  description: 'People behind the business with portrait, role, short bio and links.',
  variants: [
    { id: 'grid', name: 'Grid', description: 'Portrait grid with name and role.' },
    { id: 'list', name: 'List', description: 'Rows with portrait, bio and links; suits leadership.' },
  ],
  defaultVariant: 'grid',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    members: z.array(z.object({ name: z.string().max(120), role: z.string().max(160).optional(), bio: z.string().max(1200).optional(), photo: media.optional(), links: z.array(z.object({ label: z.string().max(40), url: safeUrlSchema('link', '#', 500) })).max(5).default([]) })).max(60).default([]),
    columns: columnsProp(4, 5),
    portraitAspect: aspect.default('4:5'),
  }),
  defaultProps: {
    eyebrow: 'Our people',
    heading: 'The team',
    members: [
      { name: 'Maya Gurung', role: 'General Manager', photo: { src: U('1573496359142-b8d87734a5a2', 1200), alt: 'Portrait of Maya Gurung' }, links: [] },
      { name: 'Daniel Okafor', role: 'Executive Chef', photo: { src: U('1507003211169-0a1dd7228f2d', 1200), alt: 'Portrait of Daniel Okafor' }, links: [] },
      { name: 'Sofia Lindqvist', role: 'Spa Director', photo: { src: U('1544005313-94ddf0286df2', 1200), alt: 'Portrait of Sofia Lindqvist' }, links: [] },
      { name: 'Arjun Thapa', role: 'Head of Experiences', photo: { src: U('1506794778202-cad84cf45f1d', 1200), alt: 'Portrait of Arjun Thapa' }, links: [] },
    ],
  },
  controls: [
    ...introControls,
    { name: 'members', label: 'Members', type: 'list', group: 'content', itemLabel: 'name', item: [{ name: 'photo', label: 'Photo', type: 'media', mediaKind: 'image' }, { name: 'name', label: 'Name', type: 'text' }, { name: 'role', label: 'Role', type: 'text' }, { name: 'bio', label: 'Bio', type: 'textarea' }], itemDefaults: { name: 'Name', role: 'Role', links: [] } },
    { ...columnsControl(5, 2), showIf: showForVariants(['grid']) },
    aspectControl('portraitAspect', 'Portrait ratio'),
    ...sectionControls,
  ],
  bindable: { listProp: 'members', itemFields: ['name', 'role', 'bio', 'photo'] },
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'About pages, agencies, consultancies, clinics.' },
});

// ---------------------------------------------------------------------------

export const timeline = defineComponent({
  type: 'timeline',
  name: 'Timeline',
  category: 'marketing',
  level: 'section',
  icon: 'milestone',
  description: 'Chronological milestones or process steps with date labels.',
  variants: [
    { id: 'vertical', name: 'Vertical', description: 'Single column with a hairline spine.' },
    { id: 'alternating', name: 'Alternating', description: 'Entries alternate either side of the spine.' },
    { id: 'steps', name: 'Steps', description: 'Horizontal numbered steps; suits processes.' },
  ],
  defaultVariant: 'vertical',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({ date: z.string().max(40).optional(), title: z.string().max(160), text: z.string().max(800).optional(), image: media.optional() })).max(30).default([]),
  }),
  defaultProps: {
    eyebrow: 'Our story',
    heading: 'From a lakeside farmhouse to a *retreat*',
    items: [
      { date: '2009', title: 'A family home opens its doors', text: 'Six rooms, one kitchen and a garden that ran to the water.' },
      { date: '2016', title: 'The spa and terrace', text: 'A wellness pavilion built in local stone and reclaimed timber.' },
      { date: '2024', title: 'A new chapter', text: 'Twenty-four suites, a farm-to-table restaurant and a private jetty.' },
    ],
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Milestones', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'date', label: 'Date / step', type: 'text' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'text', label: 'Text', type: 'textarea' }, { name: 'image', label: 'Image', type: 'media', mediaKind: 'image' }], itemDefaults: { title: 'Milestone' } },
    ...sectionControls,
  ],
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Company history, wedding-day schedule, onboarding or delivery process.' },
});

// ---------------------------------------------------------------------------

export const comparisonTable = defineComponent({
  type: 'comparison-table',
  name: 'Comparison table',
  category: 'marketing',
  level: 'section',
  icon: 'table',
  description: 'Accessible table comparing options (rooms, plans, venues) across attributes. Use "yes"/"no" for check marks.',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    columns: z.array(z.object({ label: z.string().max(80), highlighted: z.boolean().default(false) })).max(6).default([]),
    rows: z.array(z.object({ label: z.string().max(160), values: z.array(z.string().max(120)).default([]), note: z.string().max(200).optional() })).max(60).default([]),
    caption: z.string().max(200).optional(),
    stickyHeader: z.boolean().default(true),
  }),
  defaultProps: {
    eyebrow: 'Compare',
    heading: 'Find the right *fit*',
    columns: [{ label: 'Garden Room', highlighted: false }, { label: 'Lake Suite', highlighted: true }, { label: 'Villa', highlighted: false }],
    rows: [
      { label: 'Size', values: ['38 m²', '62 m²', '140 m²'] },
      { label: 'Guests', values: ['2', '3', '6'] },
      { label: 'Private terrace', values: ['no', 'yes', 'yes'] },
      { label: 'Plunge pool', values: ['no', 'no', 'yes'] },
    ],
  },
  controls: [
    ...introControls,
    { name: 'columns', label: 'Columns', type: 'list', group: 'content', itemLabel: 'label', item: [{ name: 'label', label: 'Label', type: 'text' }, { name: 'highlighted', label: 'Highlight', type: 'toggle' }], itemDefaults: { label: 'Option' } },
    { name: 'rows', label: 'Rows', type: 'list', group: 'content', itemLabel: 'label', item: [{ name: 'label', label: 'Attribute', type: 'text' }, { name: 'values', label: 'Values (one per line)', type: 'textarea' }, { name: 'note', label: 'Note', type: 'text' }], itemDefaults: { label: 'Attribute', values: [] } },
    { name: 'caption', label: 'Table caption', type: 'text', group: 'advanced' },
    { name: 'stickyHeader', label: 'Sticky header', type: 'toggle', group: 'layout' },
    ...sectionControls,
  ],
  animations: { recommended: ['fade-up'] },
  ai: { useWhen: 'Side-by-side comparison of 2–5 options.' },
});

// ---------------------------------------------------------------------------

export const contentSplit = defineComponent({
  type: 'content-split',
  name: 'Image & text',
  category: 'marketing',
  level: 'section',
  icon: 'columns-2',
  description: 'The classic "about" block: photograph beside a heading, body copy, facts and actions. Variants change composition, not content.',
  variants: [
    { id: 'standard', name: 'Standard', description: 'Image and text side by side.' },
    { id: 'overlap', name: 'Overlap', description: 'Text panel overlaps a large image.' },
    { id: 'collage', name: 'Collage', description: 'Two offset images beside the text.' },
    { id: 'full-bleed', name: 'Full bleed', description: 'Image runs to the edge of the screen.' },
  ],
  defaultVariant: 'standard',
  props: z.object({
    ...sectionBase,
    eyebrow: z.string().max(80).optional(),
    heading: z.string().max(300).optional(),
    headingLevel: headingLevel.default('h2'),
    body: z.string().max(5000).optional(),
    buttons: z.array(ButtonSchema).max(3).default([]),
    image: media,
    secondaryImage: media.optional(),
    imageSide: z.enum(['left', 'right']).default('left'),
    imageAspect: aspect.default('4:5'),
    facts: z.array(z.object({ label: z.string().max(60), value: z.string().max(120) })).max(6).default([]),
    signature: z.string().max(120).optional(),
    verticalAlign: z.enum(['start', 'center', 'end']).default('center'),
  }),
  defaultProps: {
    eyebrow: 'Our story',
    heading: 'Rooted in the valley, *open* to the world',
    body: 'What began as a family farmhouse on the shore is now a retreat of twenty-four suites, each shaped by local craft and the shifting light on the water.\n\nWe believe in slow mornings, honest food and service that feels like being looked after by friends.',
    buttons: [{ label: 'Discover more', link: '/about', style: 'link', iconPosition: 'end' }],
    image: { src: U('1470770841072-f978cf4d019e'), alt: 'Timber boathouse on a calm mountain lake' },
    secondaryImage: { src: U('1611892440504-42a792e24d32', 1600), alt: 'Warm timber suite opening onto a garden' },
  },
  controls: [
    textControls.eyebrow,
    textControls.heading,
    { name: 'body', label: 'Body', type: 'textarea', group: 'content', help: 'Separate paragraphs with a blank line.' },
    buttonsControl(),
    mediaControl('image', 'Image'),
    { ...mediaControl('secondaryImage', 'Second image'), showIf: showForVariants(['collage', 'overlap']) },
    { name: 'facts', label: 'Facts', type: 'list', group: 'content', itemLabel: 'label', item: [{ name: 'label', label: 'Label', type: 'text' }, { name: 'value', label: 'Value', type: 'text' }], itemDefaults: { label: 'Rooms', value: '24' } },
    { name: 'signature', label: 'Signature line', type: 'text', group: 'content', help: 'e.g. "— Maya Gurung, Founder"' },
    { name: 'imageSide', label: 'Image side', type: 'segmented', group: 'layout', options: opts(['left', 'right']) },
    aspectControl('imageAspect', 'Image ratio'),
    { name: 'verticalAlign', label: 'Vertical align', type: 'segmented', group: 'layout', options: [{ label: 'Top', value: 'start' }, { label: 'Middle', value: 'center' }, { label: 'Bottom', value: 'end' }] },
    { name: 'headingLevel', label: 'Heading level', type: 'select', group: 'advanced', options: opts(['h1', 'h2', 'h3']) },
    ...sectionControls,
  ],
  animations: { recommended: ['fade-up', 'image-mask', 'clip-reveal', 'editorial-reveal'], default: 'fade-up', supportsParts: true },
  ai: { useWhen: 'Introducing the business, a venue, a room type or a service with one strong photograph.' },
});

// ---------------------------------------------------------------------------

export const textSection = defineComponent({
  type: 'text-section',
  name: 'Text section',
  category: 'marketing',
  level: 'section',
  icon: 'type',
  description: 'Typography-led section: a large statement, a centered introduction or a two-column heading/body layout.',
  variants: [
    { id: 'statement', name: 'Statement', description: 'Oversized serif statement; one or two sentences.' },
    { id: 'intro', name: 'Intro', description: 'Heading with a lead paragraph in a narrow measure.' },
    { id: 'two-column', name: 'Two column', description: 'Heading on the left, body on the right.' },
  ],
  defaultVariant: 'intro',
  props: z.object({
    ...sectionBase,
    eyebrow: z.string().max(80).optional(),
    heading: z.string().max(600).optional(),
    headingLevel: headingLevel.default('h2'),
    body: z.string().max(6000).optional(),
    buttons: z.array(ButtonSchema).max(3).default([]),
    align: z.enum(['left', 'center']).default('center'),
  }),
  defaultProps: {
    eyebrow: 'Welcome',
    heading: 'A retreat on the quiet shore of the lake, where days are measured by *light*, not hours.',
    body: 'Wake to the peaks reflected in still water, spend afternoons between the spa and the garden, and end each day at a table set beside the lake.',
  },
  controls: [
    textControls.eyebrow,
    textControls.heading,
    { name: 'body', label: 'Body', type: 'textarea', group: 'content', help: 'Separate paragraphs with a blank line.' },
    buttonsControl(),
    { name: 'align', label: 'Alignment', type: 'segmented', group: 'layout', options: opts(['left', 'center']), showIf: showForVariants(['statement', 'intro']) },
    { name: 'headingLevel', label: 'Heading level', type: 'select', group: 'advanced', options: opts(['h1', 'h2', 'h3']) },
    ...sectionControls,
  ],
  animations: { recommended: ['text-reveal', 'word-reveal', 'fade-up', 'blur-reveal'], default: 'fade-up' },
  ai: { useWhen: 'Opening statement after a hero, chapter introductions, philosophy or manifesto copy.' },
});

// ---------------------------------------------------------------------------

export const benefits = defineComponent({
  type: 'benefits',
  name: 'Benefits',
  category: 'marketing',
  level: 'section',
  icon: 'list-checks',
  description: 'Checklist of benefits or inclusions, optionally beside an image — ideal for "what is included" and "why us".',
  variants: [
    { id: 'list', name: 'List', description: 'Two-column checklist under an intro.' },
    { id: 'grid', name: 'Grid', description: 'Benefit tiles with icon, title and text.' },
    { id: 'with-image', name: 'With image', description: 'Checklist beside a photograph.' },
  ],
  defaultVariant: 'with-image',
  props: z.object({
    ...sectionBase,
    ...optionalIntro,
    items: z.array(z.object({ title: z.string().max(160), text: z.string().max(500).optional(), icon: z.string().max(40).optional() })).max(24).default([]),
    image: media.optional(),
    imageSide: z.enum(['left', 'right']).default('right'),
    columns: columnsProp(2, 4),
    ...sectionButtons,
  }),
  defaultProps: {
    eyebrow: 'Included with every stay',
    heading: 'The little things, *taken care of*',
    items: [
      { title: 'Seasonal breakfast on the terrace' },
      { title: 'Sunrise boat ride across the lake' },
      { title: 'Daily yoga in the garden pavilion' },
      { title: 'Airport transfers on request' },
      { title: 'Late check-out when available' },
      { title: 'High-speed Wi-Fi throughout' },
    ],
    image: { src: U('1545389336-cf090694435e'), alt: 'Guest practising yoga above a misty valley' },
  },
  controls: [
    ...introControls,
    { name: 'items', label: 'Benefits', type: 'list', group: 'content', itemLabel: 'title', item: [{ name: 'icon', label: 'Icon', type: 'icon' }, { name: 'title', label: 'Title', type: 'text' }, { name: 'text', label: 'Text', type: 'textarea' }], itemDefaults: { title: 'New benefit' } },
    { ...mediaControl('image', 'Image'), showIf: showForVariants(['with-image']) },
    { name: 'imageSide', label: 'Image side', type: 'segmented', group: 'layout', options: opts(['left', 'right']), showIf: showForVariants(['with-image']) },
    { ...columnsControl(4, 1), showIf: showForVariants(['list', 'grid']) },
    buttonsControl(),
    ...sectionControls,
  ],
  animations: { recommended: ['stagger', 'fade-up'], default: 'stagger' },
  ai: { useWhen: 'Inclusions, perks, membership benefits, reasons to book direct.' },
});

export const marketingComponents = [cta, features, stats, testimonials, faq, pricing, team, timeline, comparisonTable, contentSplit, textSection, benefits];

