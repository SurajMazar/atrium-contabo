import type { FormDefinitionInput, NodeInput, PageInput, WebsiteInput } from '@atrium/schema';
import { socialFrom, themeFrom } from '../helpers';
import { img, photoUrl } from '../images';
import type { DemoSite } from '../types';

/**
 * Rosewood Courtyard — a fictional restored 19th-century walled-garden estate in the Chew Valley,
 * near Bath: a rose courtyard, a glass Orangery, a stone Coach House (sleeps 24) and a Lawn.
 */

const KEY = 'rosewood-courtyard';
const NAME = 'Rosewood Courtyard';
const TAGLINE = 'A walled rose garden for weddings and gatherings, near Bath.';
const DESCRIPTION =
  'Rosewood Courtyard is a restored 1860s walled-garden estate in the Chew Valley near Bath — a rose courtyard, a glass Orangery, a stone Coach House and a sweeping lawn for weddings and events.';

const seo = (title: string, description: string): PageInput['seo'] => ({ title, description });

const VIEWING = { label: 'Book a viewing', link: '/enquire#inquiry', style: 'primary' as const };

// ---------------------------------------------------------------------------
// The four spaces (shared by home, venues and corporate)
// ---------------------------------------------------------------------------

const SPACES = {
  courtyard: {
    name: 'The Rose Courtyard',
    size: '620 m² walled garden',
    description:
      'The heart of the estate: a walled courtyard of 1860s brick, planted with more than three hundred heritage roses. Ceremonies take place beneath the old espaliered pear, with guests seated along the gravel paths.',
    capacities: [
      { layout: 'Ceremony', guests: '140' },
      { layout: 'Cocktail', guests: '220' },
      { layout: 'Banquet', guests: '—' },
      { layout: 'Theatre', guests: '140' },
    ],
    features: ['Licensed for ceremonies', 'Heritage rose beds', 'Festoon lighting', 'Covered loggia for rain'],
  },
  orangery: {
    name: 'The Orangery',
    size: '310 m² glasshouse',
    description:
      'A Victorian glasshouse restored pane by pane in 2019, with lime-washed walls, citrus trees in Versailles planters and doors that fold open onto the courtyard on warm evenings.',
    capacities: [
      { layout: 'Ceremony', guests: '120' },
      { layout: 'Banquet', guests: '140' },
      { layout: 'Cocktail', guests: '180' },
      { layout: 'Theatre', guests: '150' },
    ],
    features: ['Licensed for ceremonies', 'Underfloor heating', 'Built-in dance floor', 'Opens to the courtyard'],
  },
  coachHouse: {
    name: 'The Coach House',
    size: '190 m² stone hall',
    description:
      'Bath stone, oak beams and a great open fireplace. The Coach House hosts intimate wedding breakfasts and winter ceremonies, with eleven bedrooms upstairs sleeping twenty-four guests.',
    capacities: [
      { layout: 'Ceremony', guests: '80' },
      { layout: 'Banquet', guests: '90' },
      { layout: 'Cocktail', guests: '120' },
      { layout: 'Theatre', guests: '100' },
    ],
    features: ['Licensed for ceremonies', 'Open fireplace', 'Accommodation for 24', 'Private bar'],
  },
  lawn: {
    name: 'The Lawn',
    size: '1.2 acres',
    description:
      'Beyond the garden wall, a level lawn framed by old oaks and the Mendip Hills. Our preferred marquee partners pitch here for the largest celebrations, with power, lighting and lavatories already in place.',
    capacities: [
      { layout: 'Ceremony', guests: '250' },
      { layout: 'Banquet', guests: '400' },
      { layout: 'Cocktail', guests: '400' },
      { layout: 'Theatre', guests: '300' },
    ],
    features: ['Marquee-ready', 'Views to the Mendips', 'Lawn games', 'Generator-free mains power'],
  },
};

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const captcha = { provider: 'none' as const, minScore: 0.5, action: 'submit' };

const weddingInquiry: FormDefinitionInput = {
  id: 'form-wedding-inquiry',
  name: 'Wedding inquiry',
  slug: 'wedding-inquiry',
  fields: [
    { id: 'f-partner-one', type: 'text', name: 'partnerOne', label: 'Your name', required: true, width: 'half' },
    { id: 'f-partner-two', type: 'text', name: 'partnerTwo', label: 'Your partner’s name', required: true, width: 'half' },
    { id: 'f-email', type: 'email', name: 'email', label: 'Email', required: true, width: 'half' },
    { id: 'f-phone', type: 'phone', name: 'phone', label: 'Phone', required: false, width: 'half' },
    {
      id: 'f-event-type', type: 'select', name: 'eventType', label: 'What are you celebrating?', required: true, width: 'full',
      options: [
        { label: 'Wedding', value: 'wedding' },
        { label: 'Civil partnership', value: 'civil-partnership' },
        { label: 'Elopement', value: 'elopement' },
        { label: 'Celebration or anniversary', value: 'celebration' },
        { label: 'Corporate event', value: 'corporate' },
      ],
    },
    { id: 'f-preferred-date', type: 'date', name: 'preferredDate', label: 'Preferred date', required: true, width: 'half' },
    { id: 'f-alternative-date', type: 'date', name: 'alternativeDate', label: 'Alternative date', required: false, width: 'half', helpText: 'Optional — flexibility often opens up better rates.' },
    { id: 'f-guest-count', type: 'number', name: 'guestCount', label: 'Number of guests', required: true, width: 'half', validation: { min: 2, max: 400 } },
    {
      id: 'f-venues', type: 'multiselect', name: 'venues', label: 'Spaces you’re interested in', required: false, width: 'half',
      options: [
        { label: 'The Rose Courtyard', value: 'rose-courtyard' },
        { label: 'The Orangery', value: 'orangery' },
        { label: 'The Coach House', value: 'coach-house' },
        { label: 'The Lawn', value: 'lawn' },
      ],
    },
    {
      id: 'f-needs-accommodation', type: 'radio', name: 'needsAccommodation', label: 'Would you like to stay in the Coach House?', required: true, width: 'half',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    },
    {
      id: 'f-accommodation-rooms', type: 'number', name: 'accommodationRooms', label: 'How many bedrooms? (up to 11)', required: true, width: 'half',
      validation: { min: 1, max: 11 },
      showIf: { match: 'all', conditions: [{ field: 'needsAccommodation', op: 'eq', value: 'yes' }] },
    },
    {
      id: 'f-budget', type: 'select', name: 'budget', label: 'Approximate budget', required: false, width: 'half',
      options: [
        { label: 'Under £10,000', value: 'under-10k' },
        { label: '£10,000 – £20,000', value: '10k-20k' },
        { label: '£20,000 – £35,000', value: '20k-35k' },
        { label: 'Over £35,000', value: 'over-35k' },
        { label: 'Not sure yet', value: 'unsure' },
      ],
    },
    {
      id: 'f-how-heard', type: 'select', name: 'howHeard', label: 'How did you hear about us?', required: false, width: 'half',
      options: [
        { label: 'Instagram or Pinterest', value: 'social' },
        { label: 'A friend or guest', value: 'word-of-mouth' },
        { label: 'Wedding fair or open day', value: 'open-day' },
        { label: 'Magazine or blog', value: 'press' },
        { label: 'Search engine', value: 'search' },
        { label: 'Other', value: 'other' },
      ],
    },
    { id: 'f-message', type: 'textarea', name: 'message', label: 'Tell us about your day', placeholder: 'The feeling you’re after, the season you love, anything we should know.', required: false, width: 'full', validation: { maxLength: 3000 } },
    { id: 'f-consent', type: 'consent', name: 'consent', label: 'I’m happy for Rosewood Courtyard to contact me about this inquiry.', required: true, width: 'full' },
  ],
  settings: {
    submitLabel: 'Send our inquiry',
    successMessage: 'Thank you — your inquiry is with our weddings team. Expect a personal reply, with availability and a brochure, within one working day.',
    honeypot: true,
    captcha,
    storeSubmissions: true,
    rateLimitPerMinute: 5,
    layout: 'grid',
    consentText: 'We will only use your details to plan your event with you.',
  },
  rules: [
    {
      id: 'rule-wedding-notify',
      name: 'Notify the weddings team',
      enabled: true,
      then: [
        {
          type: 'email',
          to: ['weddings@rosewood.example'],
          replyTo: '{{email}}',
          subject: 'Wedding inquiry: {{partnerOne}} & {{partnerTwo}} — {{preferredDate}}',
          body: '{{partnerOne}} & {{partnerTwo}} ({{email}}, {{phone}})\nCelebrating: {{eventType}}\nPreferred date: {{preferredDate}} (alt. {{alternativeDate}})\nGuests: {{guestCount}}\nSpaces: {{venues}}\nAccommodation: {{needsAccommodation}} ({{accommodationRooms}} rooms)\nBudget: {{budget}}\nHeard via: {{howHeard}}\n\n{{message}}',
        },
      ],
      otherwise: [],
      stopProcessing: false,
    },
    {
      id: 'rule-wedding-large',
      name: 'Large events go to the events team',
      enabled: true,
      when: { match: 'all', conditions: [{ field: 'guestCount', op: 'gt', value: 200 }] },
      then: [
        { type: 'email', to: ['events@rosewood.example'], replyTo: '{{email}}', subject: 'Large event ({{guestCount}} guests): {{partnerOne}} & {{partnerTwo}} — {{preferredDate}}', body: 'A celebration for {{guestCount}} guests will need the Lawn and a marquee. Please coordinate with the weddings team.\n\n{{message}}' },
        { type: 'tag', tags: ['large-event'] },
      ],
      otherwise: [],
      stopProcessing: false,
    },
    {
      id: 'rule-wedding-autoresponder',
      name: 'Reply to the couple',
      enabled: true,
      then: [
        {
          type: 'autoresponder',
          subject: 'Your Rosewood Courtyard inquiry',
          html: '<p>Dear {{partnerOne}} and {{partnerTwo}},</p><p>Thank you for thinking of Rosewood Courtyard. We are checking availability for {{preferredDate}} and will reply personally within one working day, with our 2027 brochure and a few dates for a private viewing.</p><p>With warm wishes,<br>The Rosewood weddings team</p>',
          emailField: 'email',
        },
      ],
      otherwise: [],
      stopProcessing: false,
    },
    {
      id: 'rule-wedding-corporate',
      name: 'Corporate inquiries go to the corporate team',
      enabled: true,
      when: { match: 'all', conditions: [{ field: 'eventType', op: 'eq', value: 'corporate' }] },
      then: [
        { type: 'email', to: ['corporate@rosewood.example'], replyTo: '{{email}}', subject: 'Corporate inquiry via weddings form — {{preferredDate}}, {{guestCount}} guests' },
        { type: 'tag', tags: ['corporate'] },
      ],
      otherwise: [],
      stopProcessing: false,
    },
  ],
};

const corporateInquiry: FormDefinitionInput = {
  id: 'form-corporate-inquiry',
  name: 'Corporate inquiry',
  slug: 'corporate-inquiry',
  fields: [
    { id: 'f-co-name', type: 'text', name: 'name', label: 'Your name', required: true, width: 'half' },
    { id: 'f-co-company', type: 'text', name: 'company', label: 'Company', required: true, width: 'half' },
    { id: 'f-co-email', type: 'email', name: 'email', label: 'Work email', required: true, width: 'half' },
    { id: 'f-co-phone', type: 'phone', name: 'phone', label: 'Phone', required: false, width: 'half' },
    {
      id: 'f-co-format', type: 'select', name: 'eventFormat', label: 'Type of event', required: true, width: 'half',
      options: [
        { label: 'Leadership retreat', value: 'retreat' },
        { label: 'Product launch', value: 'launch' },
        { label: 'Client or awards dinner', value: 'dinner' },
        { label: 'Summer or winter party', value: 'party' },
        { label: 'Something else', value: 'other' },
      ],
    },
    { id: 'f-co-date', type: 'date', name: 'eventDate', label: 'Preferred date', required: true, width: 'half' },
    { id: 'f-co-delegates', type: 'number', name: 'delegates', label: 'Number of guests', required: true, width: 'half', validation: { min: 6, max: 400 } },
    {
      id: 'f-co-overnight', type: 'radio', name: 'overnight', label: 'Overnight stay needed?', required: false, width: 'half',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    },
    { id: 'f-co-message', type: 'textarea', name: 'message', label: 'Agenda, AV needs or anything else', required: false, width: 'full' },
    { id: 'f-co-consent', type: 'consent', name: 'consent', label: 'I agree to Rosewood Courtyard contacting me about this event.', required: true, width: 'full' },
  ],
  settings: {
    submitLabel: 'Request a proposal',
    successMessage: 'Thank you — our events manager will send a tailored proposal within two working days.',
    honeypot: true,
    captcha,
    storeSubmissions: true,
    rateLimitPerMinute: 5,
    layout: 'grid',
  },
  rules: [
    {
      id: 'rule-corporate-notify',
      name: 'Notify the corporate team',
      enabled: true,
      then: [
        { type: 'email', to: ['corporate@rosewood.example'], replyTo: '{{email}}', subject: 'Corporate inquiry: {{company}} — {{eventFormat}} for {{delegates}} on {{eventDate}}', body: '{{name}} ({{email}}, {{phone}})\nOvernight: {{overnight}}\n\n{{message}}' },
        { type: 'tag', tags: ['corporate'] },
      ],
      otherwise: [],
      stopProcessing: false,
    },
  ],
};

const openDays: FormDefinitionInput = {
  id: 'form-open-days',
  name: 'Open days & letters',
  slug: 'open-days',
  fields: [{ id: 'f-od-email', type: 'email', name: 'email', label: 'Email', required: true, width: 'full' }],
  settings: {
    submitLabel: 'Keep me posted',
    successMessage: 'Lovely — you’ll hear about our next open day first.',
    honeypot: true,
    captcha,
    storeSubmissions: true,
    rateLimitPerMinute: 5,
    layout: 'stacked',
  },
  rules: [
    {
      id: 'rule-open-days-notify',
      name: 'Notify the weddings team',
      enabled: true,
      then: [
        { type: 'email', to: ['weddings@rosewood.example'], subject: 'Open day sign-up: {{email}}' },
        { type: 'tag', tags: ['open-days'] },
      ],
      otherwise: [],
      stopProcessing: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// Shared sections
// ---------------------------------------------------------------------------

const ctaImage = (eyebrow: string, heading: string, subheading: string, image: ReturnType<typeof img>): NodeInput => ({
  type: 'cta',
  variant: 'image-background',
  props: {
    eyebrow,
    heading,
    subheading,
    image,
    overlayOpacity: 0.45,
    buttons: [VIEWING, { label: 'Call {{business.phone}}', link: 'tel:+441275555014', style: 'ghost' }],
  },
  animation: { preset: 'cinematic-reveal' },
});

const ctaQuiet = (eyebrow: string, heading: string, subheading: string, image: ReturnType<typeof img>, tone: 'surface' | 'primary' | 'inverse' = 'surface'): NodeInput => ({
  type: 'cta',
  variant: 'centered',
  props: {
    eyebrow,
    heading,
    subheading,
    image,
    tone,
    buttons: [VIEWING, { label: 'See the spaces', link: '/venues', style: 'outline' }],
  },
  animation: { preset: 'fade-up' },
});

const TESTIMONIALS = [
  { quote: 'We walked into the courtyard on a grey February afternoon and still knew within a minute. In June, with every rose out, it was beyond anything we imagined.', author: 'Imogen & Theo', role: 'Married June 2026 · 120 guests', rating: 5, source: 'Google' },
  { quote: 'Clara, our coordinator, answered every one of our 214 emails with the same patience. On the day we didn’t make a single decision.', author: 'Priya & Sam', role: 'Married September 2025 · Orangery', rating: 5, source: 'Hitched' },
  { quote: 'The food was the thing our guests still talk about — the lamb, the late-night toasties, the strawberries from the walled garden.', author: 'Rosa & Daniel', role: 'Married July 2026 · Lawn marquee, 260 guests', rating: 5, source: 'Google' },
  { quote: 'Having everyone stay in the Coach House turned a wedding into a whole weekend. Breakfast the morning after was our favourite meal.', author: 'Hannah & Joe', role: 'Married May 2026 · Coach House', rating: 5, source: 'Hitched' },
  { quote: 'We eloped with twelve people and it never once felt small. Just intimate, and entirely ours.', author: 'Ama & Lewis', role: 'Elopement, April 2026', rating: 5, source: 'Instagram' },
  { quote: 'Our leadership retreat needed quiet, good coffee and no distractions. Rosewood gave us all three, plus a dinner the team still mentions.', author: 'Felicity Grant', role: 'Chief People Officer, Halden & Co.', rating: 5, source: 'Google' },
  { quote: 'Thirty years married and we wanted to do it properly this time. The Orangery at dusk, our children making speeches — perfect.', author: 'Margaret & Alan', role: 'Ruby anniversary, August 2026', rating: 5, source: 'Google' },
];

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const home: PageInput = {
  id: 'pg-home',
  title: 'Home',
  slug: '',
  isHomepage: true,
  status: 'published',
  layout: { header: 'transparent', footer: 'default' },
  seo: {
    ...seo(
      'Rosewood Courtyard — Walled garden wedding venue, Bath',
      'A restored 1860s walled rose garden near Bath for weddings and celebrations: a rose courtyard, glass Orangery, stone Coach House sleeping 24 and a lawn for 400.',
    ),
    ogImage: photoUrl('weddingCouple', 1200),
  },
  sections: [
    {
      type: 'hero',
      variant: 'carousel',
      props: {
        eyebrow: 'Chew Valley · near Bath',
        heading: 'Married among the *roses*',
        subheading: 'A restored Victorian walled garden for weddings of twenty to four hundred — with a glass Orangery, a stone Coach House and a kitchen that cooks from the garden.',
        image: img('weddingCouple', { alt: 'Bride and groom holding a garden bouquet in the Rose Courtyard' }),
        images: [
          img('weddingCouple', { alt: 'Bride and groom holding a garden bouquet in the Rose Courtyard' }),
          img('gardenPath', { alt: 'Gravel path between rose beds inside the walled garden' }),
          img('toastLights', { alt: 'Wedding guests raising glasses under festoon lights in the courtyard' }),
        ],
        overlayOpacity: 0.35,
        contentPosition: 'bottom-center',
        height: 'screen',
        showScrollCue: true,
        buttons: [VIEWING, { label: 'Explore the spaces', link: '/venues', style: 'ghost' }],
      },
      animation: { preset: 'cinematic-reveal' },
    },
    {
      type: 'text-section',
      variant: 'statement',
      props: {
        eyebrow: 'Welcome to Rosewood',
        heading: 'For a century and a half, these walls kept the wind off the roses. Now they keep the world out for a day — *yours*.',
        body: 'We host one wedding at a time, never more than ninety a year, so the garden, the team and the kitchen belong entirely to you.',
        align: 'center',
        containerWidth: 'narrow',
        spacingTop: 'xl',
        spacingBottom: 'lg',
      },
      animation: { preset: 'text-reveal' },
    },
    {
      type: 'venues',
      variant: 'cards',
      props: {
        eyebrow: 'The spaces',
        heading: 'Four spaces, one walled estate',
        subheading: 'Marry in the courtyard, dine in the Orangery, dance until the carriages at 11.30pm — and walk upstairs to bed.',
        columns: 4,
        showTable: true,
        items: [
          { ...SPACES.courtyard, description: 'Our walled rose garden, licensed for ceremonies under the open sky.', image: img('weddingAisle', { alt: 'Ceremony aisle lined with roses in the Rose Courtyard' }), link: '/venues' },
          { ...SPACES.orangery, description: 'A restored Victorian glasshouse for wedding breakfasts and dancing.', image: img('weddingTable', { alt: 'Long candlelit reception table inside the Orangery' }), link: '/venues' },
          { ...SPACES.coachHouse, description: 'Stone, oak and firelight — with eleven bedrooms upstairs.', image: img('ballroom', { alt: 'Coach House hall set with round tables beneath chandeliers' }), link: '/venues' },
          { ...SPACES.lawn, description: 'A level acre beyond the wall for marquees of up to 400 guests.', image: img('marqueeReception', { alt: 'Reception marquee on the Lawn set for dinner' }), link: '/venues' },
        ],
      },
      animation: { preset: 'stagger', target: 'children', stagger: 0.12 },
    },
    {
      type: 'content-split',
      variant: 'overlap',
      props: {
        tone: 'surface',
        eyebrow: 'Our story',
        heading: 'A kitchen garden, rescued *rose* by rose',
        body: 'The walled garden was built in 1868 to grow peaches and cut flowers for the house beyond the hill. By 2014 it was lost beneath bramble and ash saplings.\n\nIt took the Ashcombe family five years, two master bricklayers and one very patient rosarian to bring it back. The Orangery reopened in 2019; the first wedding was held that September.',
        image: img('weddingPavilion', { alt: 'Flower-dressed pavilion in the walled garden ready for a ceremony' }),
        secondaryImage: img('florals', { alt: 'Garden roses and wildflowers cut from the estate beds' }),
        imageSide: 'right',
        facts: [
          { label: 'Built', value: '1868' },
          { label: 'Restored', value: '2014 – 2019' },
          { label: 'Heritage roses', value: '312 varieties' },
        ],
        signature: 'Eleanor & James Ashcombe',
        buttons: [{ label: 'Plan your wedding', link: '/weddings', style: 'link' }],
      },
      animation: { preset: 'image-mask' },
    },
    {
      type: 'marquee',
      props: {
        items: [{ text: 'Weddings' }, { text: 'Celebrations' }, { text: 'Garden dinners' }, { text: 'Corporate retreats' }, { text: 'Elopements' }],
        separator: '·',
        size: 'xl',
        italic: true,
        speed: 40,
        spacingTop: 'md',
        spacingBottom: 'md',
      },
    },
    {
      type: 'offers',
      variant: 'featured',
      props: {
        eyebrow: 'Wedding packages',
        heading: 'Three ways to *begin*',
        subheading: 'Every package includes exclusive use, our in-house kitchen and a dedicated coordinator from booking to the last dance.',
        columns: 3,
        imageAspect: '4:5',
        items: [
          { title: 'Intimate Elopement', image: img('weddingHands', { alt: 'Couple’s hands with rings beside a small bouquet' }), badge: 'Up to 20 guests', price: '£4,800', priceNote: 'Monday – Thursday', description: 'A ceremony in the Rose Courtyard and a long-table supper in the Orangery.', validity: '2027 season', cta: { label: 'Details', link: '/weddings#packages', style: 'link' } },
          { title: 'The Courtyard Day', image: img('weddingCelebration', { alt: 'Newlyweds celebrating with guests in the courtyard' }), badge: 'Most loved', price: '£16,500', priceNote: 'Up to 90 guests', description: 'A full day in the courtyard and Coach House, with the bedrooms for the night.', validity: '2027 season', cta: { label: 'Details', link: '/weddings#packages', style: 'link' } },
          { title: 'The Grand Celebration', image: img('banquetTable', { alt: 'Banquet table set with garden flowers and glassware' }), badge: 'Two nights', price: '£29,000', priceNote: 'Up to 160 guests', description: 'Exclusive use of the whole estate from Friday afternoon to Sunday brunch.', validity: '2027 season', cta: { label: 'Details', link: '/weddings#packages', style: 'link' } },
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'testimonials',
      variant: 'carousel',
      props: {
        tone: 'inverse',
        eyebrow: 'Kind words',
        heading: 'From the couples who *married* here',
        align: 'center',
        showRating: true,
        autoplay: true,
        items: TESTIMONIALS.slice(0, 4),
      },
      animation: { preset: 'fade' },
    },
    {
      type: 'gallery',
      variant: 'masonry',
      props: {
        eyebrow: 'The garden in season',
        heading: 'Moments from recent weddings',
        subheading: 'Photographed by the couples’ own photographers, shared with their kind permission.',
        columns: 3,
        gap: 'md',
        aspect: 'auto',
        lightbox: true,
        showCaptions: false,
        images: [
          img('weddingBouquet', { alt: 'Bride holding a peach rose bouquet cut from the walled garden' }),
          img('weddingField', { alt: 'Couple embracing beneath a veil in the meadow beyond the Lawn' }),
          img('weddingChairs', { alt: 'Two garland-dressed chairs on the Lawn' }),
          img('dessertTable', { alt: 'Dessert table against the courtyard’s old brick wall' }),
          img('weddingRings', { alt: 'Wedding rings resting on courtyard roses' }),
          img('longTable', { alt: 'Long dinner table in the Coach House dressed with red napkins' }),
        ],
        buttons: [{ label: 'Full gallery', link: '/gallery', style: 'outline' }],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'events',
      variant: 'list',
      anchor: 'open-days',
      props: {
        tone: 'surface',
        eyebrow: 'Open days & wedding fairs',
        heading: 'Come and see the *garden*',
        subheading: 'No appointment needed. Meet our coordinators, taste the kitchen’s seasonal canapés and walk every space.',
        items: [
          { title: 'Winter Open Day', date: '2026-11-15', time: '11:00 – 15:00', location: 'The Coach House', category: 'Open day', summary: 'Fires lit, mulled cider poured and the Coach House dressed for a December wedding.', link: '/enquire#inquiry' },
          { title: 'New Year Wedding Fair', date: '2027-01-24', time: '10:30 – 16:00', location: 'The Orangery', category: 'Wedding fair', summary: 'Twenty of our favourite florists, photographers and makers under one glass roof.', link: '/enquire#inquiry' },
          { title: 'Spring Garden Viewing', date: '2027-03-14', time: '10:00 – 14:00', location: 'The Rose Courtyard', category: 'Open day', summary: 'See the garden waking up, with our head gardener on hand to talk roses and timings.', link: '/enquire#inquiry' },
          { title: 'Twilight Viewing Evening', date: '2027-04-29', time: '18:00 – 21:00', location: 'Whole estate', category: 'Evening viewing', summary: 'The estate lit as it is for an evening reception, with a live trio in the Orangery.', link: '/enquire#inquiry' },
          { title: 'Midsummer Open Garden', date: '2027-06-06', time: '11:00 – 16:00', location: 'The Rose Courtyard', category: 'Open day', summary: 'The roses at their peak, a marquee dressed on the Lawn and strawberries from the beds.', link: '/enquire#inquiry' },
        ],
        columns: 3,
        buttons: [{ label: 'Reserve a place', link: '/enquire#inquiry', style: 'primary' }],
      },
    },
    {
      type: 'faq',
      variant: 'two-column',
      props: {
        eyebrow: 'Good to know',
        heading: 'Quick answers',
        subheading: 'The questions couples ask on their first visit.',
        cta: { label: 'All questions', link: '/faq', style: 'link' },
        items: [
          { question: 'Are you licensed for ceremonies?', answer: 'Yes — the Rose Courtyard, the Orangery and the Coach House are all licensed for civil ceremonies and partnerships.' },
          { question: 'What time does the evening end?', answer: 'Music finishes at 11pm and carriages are at 11.30pm. Guests staying in the Coach House can carry on quietly by the fire.' },
          { question: 'Can we bring our own caterer?', answer: 'Our in-house kitchen cooks for every event, using produce from the walled garden and growers within twenty miles.' },
          { question: 'How many guests can stay overnight?', answer: 'The Coach House sleeps twenty-four in eleven bedrooms, including the Bridal Loft.' },
        ],
      },
    },
    ctaImage('Begin here', 'Walk the garden with *us*', 'Private viewings Wednesday to Sunday, 10am – 5pm. Bring your questions, your mother, or just yourselves.', img('weddingWalk', { alt: 'Couple walking through the misty hills above the estate' })),
  ],
};

const venues: PageInput = {
  id: 'pg-venues',
  title: 'Venues',
  slug: 'venues',
  status: 'published',
  layout: { header: 'transparent', footer: 'default' },
  seo: seo(
    'The spaces — Courtyard, Orangery, Coach House',
    'Explore the Rose Courtyard, the glass Orangery, the stone Coach House and the Lawn at Rosewood Courtyard, with capacities for ceremonies, dinners and parties.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'fullscreen-image',
      props: {
        eyebrow: 'The spaces',
        heading: 'Brick, glass, stone and *sky*',
        subheading: 'Four very different spaces within a five-minute stroll — so your ceremony, dinner and dancing can each have their own setting.',
        image: img('gardenPath', { alt: 'Gravel path between rose beds leading to the Orangery' }),
        overlayOpacity: 0.4,
        contentPosition: 'bottom-left',
        height: 'tall',
        buttons: [VIEWING],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'venues',
      variant: 'detailed',
      anchor: 'spaces',
      props: {
        eyebrow: 'In detail',
        heading: 'Capacities by layout',
        subheading: 'Figures are maximums for comfortable seating; our coordinators will help you find the right fit for your numbers.',
        showTable: true,
        columns: 2,
        items: [
          { ...SPACES.courtyard, image: img('weddingAisle', { alt: 'Rose-lined ceremony aisle in the walled courtyard' }), link: '/enquire#inquiry' },
          { ...SPACES.orangery, image: img('weddingTable', { alt: 'Candlelit wedding breakfast in the glass Orangery' }), link: '/enquire#inquiry' },
          { ...SPACES.coachHouse, image: img('ballroom', { alt: 'Coach House hall with round tables and chandeliers' }), link: '/enquire#inquiry' },
          { ...SPACES.lawn, image: img('marqueeReception', { alt: 'Marquee on the Lawn dressed for a summer wedding' }), link: '/enquire#inquiry' },
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'comparison-table',
      props: {
        tone: 'surface',
        eyebrow: 'Side by side',
        heading: 'Which space suits your *day*?',
        columns: [{ label: 'Rose Courtyard' }, { label: 'Orangery', highlighted: true }, { label: 'Coach House' }, { label: 'The Lawn' }],
        rows: [
          { label: 'Size', values: ['620 m²', '310 m²', '190 m²', '1.2 acres'] },
          { label: 'Ceremony', values: ['140', '120', '80', '250'] },
          { label: 'Seated dinner', values: ['—', '140', '90', '400 (marquee)'] },
          { label: 'Drinks reception', values: ['220', '180', '120', '400'] },
          { label: 'Theatre style', values: ['140', '150', '100', '300'] },
          { label: 'Licensed for ceremonies', values: ['Yes', 'Yes', 'Yes', 'Blessings only'] },
          { label: 'Wet-weather plan', values: ['Covered loggia', 'Indoors', 'Indoors', 'Marquee'] },
          { label: 'Step-free access', values: ['Yes', 'Yes', 'Ground floor', 'Yes'] },
        ],
        caption: 'Capacities assume round tables of ten for dinners and include a dance floor where noted.',
      },
    },
    {
      type: 'content-split',
      variant: 'standard',
      anchor: 'stay',
      props: {
        eyebrow: 'Stay the night',
        heading: 'Eleven bedrooms above the *Coach House*',
        body: 'Twenty-four of your guests can sleep on site, in rooms finished with lime plaster, wool throws and deep baths. The Bridal Loft runs the length of the gable, with a window over the rose garden.\n\nRooms are included with The Courtyard Day and The Grand Celebration, and available on request with every other booking.',
        image: img('roomClassic', { alt: 'Coach House bedroom with a four-poster bed and sofa' }),
        secondaryImage: img('roomVelvet', { alt: 'Bridal Loft with a velvet bench and patterned headboard' }),
        imageSide: 'left',
        facts: [
          { label: 'Bedrooms', value: '11, sleeping 24' },
          { label: 'Bridal Loft', value: 'Super-king, roll-top bath' },
          { label: 'Check-out', value: '11am the morning after' },
        ],
        buttons: [{ label: 'Ask about rooms', link: '/enquire#inquiry', style: 'link' }],
      },
      animation: { preset: 'image-mask' },
    },
    {
      type: 'amenities',
      variant: 'icon-grid',
      props: {
        eyebrow: 'Included',
        heading: 'Everything in place, so you can *arrive*',
        columns: 4,
        items: [
          { icon: 'chef-hat', title: 'In-house kitchen', text: 'Seasonal menus from our head chef, with produce from the walled garden.' },
          { icon: 'wine', title: 'Licensed bar', text: 'English sparkling wine, local cider and a cocktail list written for you.' },
          { icon: 'user-round-check', title: 'Dedicated coordinator', text: 'One person from first viewing to final farewell.' },
          { icon: 'bed-double', title: 'Accommodation for 24', text: 'Eleven bedrooms in the Coach House, including the Bridal Loft.' },
          { icon: 'umbrella', title: 'Wet-weather plan', text: 'Every outdoor ceremony has an indoor twin, ready on the morning.' },
          { icon: 'car', title: 'Parking for 80 cars', text: 'On a gravel field behind the Coach House, with a lit path at night.' },
          { icon: 'accessibility', title: 'Step-free access', text: 'Level paths throughout the garden and an accessible bedroom.' },
          { icon: 'flower-2', title: 'Florals from the beds', text: 'Our gardeners cut roses for your tables in June and July.' },
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    ctaQuiet('See it for yourself', 'Every space looks different in *person*', 'Viewings Wednesday to Sunday, 10am – 5pm. We’ll set a table in the Orangery so you can picture it.', img('cocktails', { alt: 'Signature cocktails on the Orangery bar' }), 'primary'),
  ],
};

const weddings: PageInput = {
  id: 'pg-weddings',
  title: 'Weddings',
  slug: 'weddings',
  status: 'published',
  layout: { header: 'transparent', footer: 'default' },
  seo: seo(
    'Weddings & packages — Rosewood Courtyard',
    'Wedding packages for the 2027 season at Rosewood Courtyard, from an intimate elopement at £4,800 to a two-night grand celebration, with in-house catering.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'fullscreen-image',
      props: {
        eyebrow: 'Weddings',
        heading: 'One wedding a day, and it is *yours*',
        subheading: 'Exclusive use of a walled garden, a kitchen that cooks from it, and a coordinator who knows every brick.',
        image: img('weddingBacklit', { alt: 'Bride holding flowers in warm evening backlight' }),
        overlayOpacity: 0.35,
        contentPosition: 'bottom-left',
        height: 'screen',
        buttons: [VIEWING, { label: 'View packages', link: '/weddings#packages', style: 'ghost' }],
      },
      animation: { preset: 'cinematic-reveal' },
    },
    {
      type: 'text-section',
      variant: 'two-column',
      props: {
        eyebrow: 'How we host',
        heading: 'Unhurried, generous and quietly organised',
        body: 'We cap the season at ninety weddings so that every couple has the full attention of the team. Your coordinator will meet you at least three times before the day, and stays until the last carriage leaves.\n\nOur kitchen cooks everything on site. Menus change with the garden — asparagus and elderflower in May, heritage tomatoes and peaches in August, venison and quince in October.\n\nWe welcome your own suppliers for flowers, music and photography, and are happy to introduce people we trust.',
        align: 'left',
      },
      animation: { preset: 'fade-up' },
    },
    {
      type: 'offers',
      variant: 'cards',
      anchor: 'packages',
      props: {
        tone: 'surface',
        eyebrow: '2027 packages',
        heading: 'Choose your *starting* point',
        subheading: 'Prices include VAT, exclusive use, your coordinator and our in-house catering. Everything can be adjusted.',
        columns: 3,
        imageAspect: '3:2',
        items: [
          {
            title: 'Intimate Elopement', image: img('weddingHands', { alt: 'Couple’s hands with rings beside a bouquet' }), badge: 'Up to 20 guests', price: '£4,800', priceNote: 'Monday – Thursday',
            description: 'A short, beautiful ceremony in the Rose Courtyard, photographs in the garden and a long-table supper in the Orangery.',
            inclusions: ['Ceremony in the Rose Courtyard', 'Glass of English sparkling wine on arrival', 'Three-course supper for up to 20', 'Bridal bouquet from the estate beds', 'The Bridal Loft for the night'],
            validity: 'Valid for the 2027 season, April – October',
            cta: { label: 'Check availability', link: '/enquire#inquiry', style: 'outline' },
          },
          {
            title: 'The Courtyard Day', image: img('weddingCelebration', { alt: 'Newlyweds celebrating with guests' }), badge: 'Most loved', price: '£16,500', priceNote: 'Up to 90 guests, Friday or Sunday',
            description: 'Ceremony among the roses, drinks on the lawn and a wedding breakfast by the fire in the Coach House — with every bedroom for the night.',
            inclusions: ['Ceremony in any licensed space', 'Drinks reception with canapés', 'Three-course wedding breakfast', 'Evening food and late bar until 11pm', 'All 11 Coach House bedrooms', 'Dedicated coordinator'],
            validity: 'Valid for the 2027 season; Saturdays from £19,500',
            cta: { label: 'Check availability', link: '/enquire#inquiry', style: 'primary' },
          },
          {
            title: 'The Grand Celebration', image: img('banquetTable', { alt: 'Banquet table set with flowers and glassware' }), badge: 'Two nights', price: '£29,000', priceNote: 'Up to 160 guests',
            description: 'The whole estate from Friday afternoon to Sunday brunch: welcome supper, the wedding itself and a long, lazy morning after.',
            inclusions: ['Friday welcome supper for 40', 'Ceremony, reception and dinner in the Orangery', 'Evening food, late bar and DJ booth', 'Two nights in the Coach House', 'Sunday brunch for 60', 'Rehearsal with your coordinator'],
            validity: 'Valid for the 2027 season; marquee add-on for up to 400',
            cta: { label: 'Check availability', link: '/enquire#inquiry', style: 'outline' },
          },
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'timeline',
      variant: 'vertical',
      props: {
        eyebrow: 'The wedding day',
        heading: 'How a Rosewood day *unfolds*',
        subheading: 'A typical summer Saturday — every timing can move to suit you.',
        items: [
          { date: '10:00', title: 'Morning in the Bridal Loft', text: 'Hair, make-up and breakfast brought up from the kitchen while the team dresses the courtyard.' },
          { date: '14:00', title: 'Ceremony among the roses', text: 'Guests gather on the gravel paths; the registrar stands beneath the old pear tree.', image: img('weddingRings', { alt: 'Rings resting on roses before the ceremony' }) },
          { date: '14:45', title: 'Drinks on the lawn', text: 'English sparkling wine, elderflower spritz and canapés from the garden, with lawn games for the children.', image: img('cocktailPour', { alt: 'Bartender pouring an amber cocktail for the reception' }) },
          { date: '17:00', title: 'Wedding breakfast', text: 'Three seasonal courses in the Orangery or the Coach House, followed by speeches as the light softens.', image: img('dinnerParty', { alt: 'Guests sharing the wedding breakfast at a long table' }) },
          { date: '20:00', title: 'First dance & evening guests', text: 'The Orangery doors fold open, the band starts and the festoon lights come on across the courtyard.' },
          { date: '23:30', title: 'Carriages', text: 'Music ends at 11pm. Twenty-four lucky guests walk upstairs; everyone else is waved off under the stars.' },
        ],
      },
    },
    {
      type: 'section',
      props: { tone: 'inverse', spacingTop: 'xl', spacingBottom: 'xl', minHeight: 'half', verticalAlign: 'center' },
      children: [
        {
          type: 'animated-text',
          props: {
            prefix: 'Celebrate your',
            words: [{ text: 'wedding' }, { text: 'anniversary' }, { text: 'elopement' }, { text: 'vow renewal' }, { text: 'fortieth' }],
            suffix: 'among the roses',
            interval: 2.6,
            effect: 'slide',
            level: 'h2',
            size: 'display',
            italicWords: true,
          },
        },
        { type: 'text', props: { text: 'Not only weddings: we host a handful of anniversaries, renewals and milestone birthdays each season, with the same care.', size: 'lg', muted: true } },
      ],
      animation: { preset: 'fade' },
    },
    {
      type: 'testimonials',
      variant: 'grid',
      props: {
        eyebrow: 'From our couples',
        heading: 'In their words',
        columns: 3,
        showRating: true,
        items: [TESTIMONIALS[1]!, TESTIMONIALS[2]!, TESTIMONIALS[4]!],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'faq',
      variant: 'accordion',
      props: {
        tone: 'surface',
        eyebrow: 'Planning',
        heading: 'Wedding questions',
        subheading: 'More detail on our full FAQ page, or ask your coordinator anything.',
        cta: { label: 'Read all FAQs', link: '/faq', style: 'link' },
        containerWidth: 'narrow',
        items: [
          { question: 'How far ahead should we book?', answer: 'Summer Saturdays in 2027 are booking now, typically 14–18 months ahead. Weekdays and shoulder-season dates are often available within six months.' },
          { question: 'What deposit is required?', answer: 'A 25% deposit secures your date, with the balance due eight weeks before. Payment plans are available on request.' },
          { question: 'Can we have a marquee?', answer: 'Yes — The Lawn takes marquees of up to 400 guests. We work with two preferred marquee companies and can share quotes.' },
          { question: 'Do you offer menu tastings?', answer: 'Every couple is invited to a tasting for two in the Coach House around six months before the wedding.' },
        ],
      },
    },
    ctaImage('Your date', 'Let’s find the *right* day', 'Tell us your season and your numbers, and we’ll reply with availability within one working day.', img('weddingField', { alt: 'Couple beneath a veil in the golden meadow beyond the garden' })),
  ],
};

const corporate: PageInput = {
  id: 'pg-corporate',
  title: 'Corporate events',
  slug: 'corporate',
  status: 'published',
  seo: seo(
    'Corporate events & retreats near Bath',
    'Leadership retreats, launches, client dinners and summer parties at Rosewood Courtyard, a private walled-garden estate near Bath with rooms for 24 guests.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'split',
      props: {
        eyebrow: 'Corporate events',
        heading: 'Off-site, without feeling *off-grid*',
        subheading: 'Private hire of a walled-garden estate twenty-five minutes from Bath Spa — for retreats, launches and dinners that people remember for the right reasons.',
        image: img('conferenceHall', { alt: 'Orangery set for a company presentation beneath arched windows' }),
        imageSide: 'right',
        height: 'tall',
        buttons: [{ label: 'Request a proposal', link: '/corporate#proposal', style: 'primary' }, { label: 'See the spaces', link: '/venues', style: 'outline' }],
        meta: [
          { label: 'From Bath Spa', value: '25 min' },
          { label: 'Bedrooms', value: '11 (sleeps 24)' },
          { label: 'Up to', value: '400 guests' },
        ],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'features',
      variant: 'cards',
      props: {
        eyebrow: 'What we host',
        heading: 'Gatherings with a *purpose*',
        subheading: 'Weekdays from September to May are reserved for companies, so you will usually have the estate to yourselves.',
        columns: 4,
        imageAspect: '3:4',
        items: [
          { image: img('meetingRoom', { alt: 'Leadership team meeting around the Coach House table' }), eyebrow: 'Up to 24 overnight', title: 'Leadership retreats', text: 'Two or three days of focused work in the Coach House, walks on the Mendips and dinners by the fire.' },
          { image: img('keynote', { alt: 'Speaker presenting to guests in the Orangery' }), eyebrow: 'Up to 150 theatre', title: 'Launches & keynotes', text: 'The Orangery takes a stage, screens and full AV, with natural light and the garden as a backdrop.' },
          { image: img('diningPlate', { alt: 'Plated seasonal dish from the estate kitchen' }), eyebrow: 'Up to 140 seated', title: 'Client & awards dinners', text: 'Seasonal tasting menus, wine pairings and a drinks reception among the roses.' },
          { image: img('toastLights', { alt: 'Team raising glasses under festoon lights' }), eyebrow: 'Up to 400 guests', title: 'Summer & winter parties', text: 'A marquee on the Lawn, street-food stalls and a band — or mulled wine and carols by the Coach House fire.' },
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'venues',
      variant: 'cards',
      props: {
        tone: 'surface',
        eyebrow: 'Spaces for business',
        heading: 'Capacities for meetings and events',
        columns: 4,
        showTable: true,
        items: [
          { name: SPACES.orangery.name, size: SPACES.orangery.size, image: img('conference', { alt: 'Audience seated theatre-style in the Orangery' }), description: 'Light-filled plenary space with built-in AV and blackout blinds.', capacities: [{ layout: 'Theatre', guests: '150' }, { layout: 'Cabaret', guests: '96' }, { layout: 'Dinner', guests: '140' }], features: ['85" screens ×2', 'Wireless microphones', 'Wi-Fi 1 Gbps'] },
          { name: SPACES.coachHouse.name, size: SPACES.coachHouse.size, image: img('boardroom', { alt: 'Boardroom set-up in the Coach House' }), description: 'Oak boardroom table, fireplace and breakout lounges upstairs.', capacities: [{ layout: 'Boardroom', guests: '24' }, { layout: 'Theatre', guests: '100' }, { layout: 'Dinner', guests: '90' }], features: ['Boardroom table for 24', 'Breakout lounges', 'Private bar'] },
          { name: SPACES.courtyard.name, size: SPACES.courtyard.size, image: img('cocktails', { alt: 'Cocktails served in the Rose Courtyard' }), description: 'Drinks receptions, team photographs and long summer lunches.', capacities: [{ layout: 'Reception', guests: '220' }, { layout: 'Theatre', guests: '140' }], features: ['Covered loggia', 'Festoon lighting'] },
          { name: SPACES.lawn.name, size: SPACES.lawn.size, image: img('foodSpread', { alt: 'Shared plates served at a summer party on the Lawn' }), description: 'Marquee events, team games and summer parties for the whole company.', capacities: [{ layout: 'Theatre', guests: '300' }, { layout: 'Party', guests: '400' }], features: ['Marquee-ready', 'Mains power', 'Lawn games'] },
        ],
      },
    },
    {
      type: 'stats',
      variant: 'inline',
      props: {
        eyebrow: 'By the numbers',
        heading: 'Why teams come back',
        align: 'center',
        columns: 4,
        items: [
          { value: '140', label: 'corporate events hosted since 2020' },
          { value: '25', suffix: ' min', label: 'from Bath Spa station, with transfers arranged' },
          { value: '24', label: 'delegates sleep on site in the Coach House' },
          { value: '4.9', suffix: '/5', label: 'average organiser rating' },
        ],
      },
      animation: { preset: 'fade-up' },
    },
    {
      type: 'form',
      variant: 'split-with-text',
      anchor: 'proposal',
      props: {
        formId: 'form-corporate-inquiry',
        eyebrow: 'Request a proposal',
        heading: 'Tell us about your *event*',
        subheading: 'Share your dates, numbers and what you want the day to achieve. Our events manager replies with a tailored proposal within two working days.',
        image: img('teamTable', { alt: 'Team meeting around a long table during a retreat' }),
        showContactDetails: true,
        submitLabel: 'Request a proposal',
      },
    },
    {
      type: 'cta',
      variant: 'banner',
      props: {
        tone: 'inverse',
        eyebrow: 'Prefer to talk?',
        heading: 'Speak to our events manager',
        subheading: 'Call {{business.phone}} or email corporate@rosewood.example — we can usually hold a date while you get sign-off.',
        image: img('keynote', { alt: 'Presentation in the Orangery' }),
        buttons: [{ label: 'Email the events team', link: 'mailto:corporate@rosewood.example', style: 'primary' }, { label: 'Visit the estate', link: '/enquire#inquiry', style: 'ghost' }],
      },
    },
  ],
};

const gallery: PageInput = {
  id: 'pg-gallery',
  title: 'Gallery',
  slug: 'gallery',
  status: 'published',
  seo: seo(
    'Gallery — Weddings at Rosewood Courtyard',
    'Photographs of weddings and celebrations at Rosewood Courtyard: ceremonies in the rose garden, dinners in the Orangery and evenings beneath the festoon lights.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'minimal',
      props: {
        eyebrow: 'Gallery',
        heading: 'A garden that changes with every *season*',
        subheading: 'Real weddings and celebrations, photographed by the couples’ own photographers and shared with their kind permission.',
        image: img('florals', { alt: 'Roses and wildflowers from the walled garden' }),
        height: 'auto',
        buttons: [VIEWING],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'gallery',
      variant: 'editorial',
      props: {
        eyebrow: 'Summer',
        heading: 'June to August, in full *bloom*',
        columns: 3,
        gap: 'md',
        aspect: '4:5',
        lightbox: true,
        showCaptions: false,
        images: [
          img('weddingBouquet', { alt: 'Peach rose bouquet' }),
          img('weddingPavilion', { alt: 'Flower-dressed garden pavilion' }),
          img('longTable', { alt: 'Long table dressed with red napkins' }),
          img('dessertTable', { alt: 'Dessert table against brick wall' }),
          img('weddingChairs', { alt: 'Garlanded chairs on the lawn' }),
          img('winePour', { alt: 'Red wine poured into a glass' }),
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'carousel',
      variant: 'full',
      props: {
        tone: 'inverse',
        eyebrow: 'Evenings',
        heading: 'After the *sun* goes down',
        aspect: '16:9',
        autoplay: true,
        interval: 6,
        slides: [
          { image: img('weddingWalk', { alt: 'Couple walking through misty hills at dusk' }), eyebrow: 'Golden hour', title: 'A walk above the valley', text: 'Twenty minutes for portraits, while guests find their seats.' },
          { image: img('weddingBacklit', { alt: 'Bride in warm evening light' }), eyebrow: 'Late light', title: 'The courtyard at eight', text: 'In June the sun sets behind the west wall just before nine.' },
          { image: img('dinnerParty', { alt: 'Friends sharing dinner at a long table' }), eyebrow: 'Dinner', title: 'Long tables, longer speeches', text: 'The Orangery seats 140 beneath the glass.' },
          { image: img('cocktailPour', { alt: 'Bartender pouring a cocktail' }), eyebrow: 'The bar', title: 'A drink named after you', text: 'Our bar team writes a cocktail for every couple.' },
        ],
      },
    },
    ctaQuiet('Picture yourselves here', 'The photographs are lovely. The garden is *better*.', 'Visit on an open day or book a private viewing, Wednesday to Sunday.', img('bar', { alt: 'Warmly lit Coach House bar' })),
  ],
};

const testimonials: PageInput = {
  id: 'pg-testimonials',
  title: 'Testimonials',
  slug: 'testimonials',
  status: 'published',
  seo: seo(
    'Kind words — Reviews of Rosewood Courtyard',
    'Read reviews from couples and companies who have celebrated at Rosewood Courtyard, rated 4.9 out of 5 across more than two hundred weddings and events.',
  ),
  sections: [
    {
      type: 'text-section',
      variant: 'intro',
      props: {
        eyebrow: 'Kind words',
        heading: 'What our couples *remember*',
        headingLevel: 'h1',
        body: 'We ask every couple for honest feedback a month after their wedding. Here is a little of what they have told us — unedited, apart from the occasional exclamation mark.',
        align: 'center',
        containerWidth: 'narrow',
      },
      animation: { preset: 'text-reveal' },
    },
    {
      type: 'testimonials',
      variant: 'grid',
      props: {
        eyebrow: 'Reviews',
        heading: 'Weddings, elopements and gatherings',
        columns: 3,
        showRating: true,
        items: TESTIMONIALS,
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'stats',
      variant: 'cards',
      props: {
        tone: 'surface',
        eyebrow: 'Ratings',
        heading: 'Across 212 independent reviews',
        align: 'center',
        columns: 4,
        items: [
          { value: '4.9', suffix: '/5', label: 'average on Google', description: '148 reviews' },
          { value: '5.0', suffix: '/5', label: 'average on Hitched', description: '64 reviews' },
          { value: '98', suffix: '%', label: 'of couples would recommend us' },
          { value: '2025', label: 'Regional Venue of the Year, Westward Weddings Awards' },
        ],
      },
    },
    {
      type: 'logo-cloud',
      variant: 'grid',
      props: {
        eyebrow: 'As featured in',
        align: 'center',
        columns: 6,
        logos: [
          { name: 'Petal & Vow' },
          { name: 'The Aisle Edit' },
          { name: 'Linen & Lace' },
          { name: 'Westward Weddings' },
          { name: 'Hollyhock Journal' },
          { name: 'The Long Table' },
        ],
      },
      animation: { preset: 'fade' },
    },
    ctaImage('Your turn', 'We’d love to host *you*', 'Book a private viewing and meet the team behind the reviews.', img('mingling', { alt: 'Wedding guests mingling under string lights' })),
  ],
};

const faq: PageInput = {
  id: 'pg-faq',
  title: 'FAQ',
  slug: 'faq',
  status: 'published',
  seo: {
    ...seo(
      'Wedding venue FAQs — Rosewood Courtyard',
      'Answers on ceremonies, catering, curfew, accommodation, suppliers, accessibility and parking at Rosewood Courtyard, a walled-garden wedding venue near Bath.',
    ),
    structuredData: [{ type: 'FAQPage', auto: true }],
  },
  sections: [
    {
      type: 'text-section',
      variant: 'intro',
      props: {
        eyebrow: 'FAQ',
        heading: 'Questions, *answered*',
        headingLevel: 'h1',
        body: 'Everything couples usually ask before booking. If your question isn’t here, call us on {{business.phone}} — a real person will pick up.',
        align: 'left',
        spacingBottom: 'md',
      },
    },
    {
      type: 'faq',
      variant: 'accordion',
      anchor: 'weddings',
      props: {
        eyebrow: 'Weddings',
        heading: 'Ceremonies, food and the day itself',
        subheading: 'The details that shape your wedding day.',
        cta: { label: 'See our packages', link: '/weddings#packages', style: 'link' },
        openFirst: true,
        items: [
          { question: 'Are you licensed for civil ceremonies?', answer: 'Yes. The Rose Courtyard, the Orangery and the Coach House are licensed for civil ceremonies and civil partnerships. The Lawn can host blessings and celebrant-led ceremonies.' },
          { question: 'Can we hold a religious ceremony here?', answer: 'Legal religious ceremonies must take place in a registered place of worship, but many couples marry at St Andrew’s in the village and join us for a blessing in the garden.' },
          { question: 'Do you have in-house catering?', answer: 'Yes, and only in-house. Our head chef cooks everything on site, with produce from the walled garden and growers within twenty miles. Dietary needs are handled with care.' },
          { question: 'What time do celebrations finish?', answer: 'Amplified music ends at 11pm and carriages are at 11.30pm, out of respect for our neighbours. Guests staying in the Coach House are welcome to continue quietly by the fire.' },
          { question: 'Can we choose our own suppliers?', answer: 'Of course — florists, photographers, musicians and stylists are all your choice. We will share a list of people who know the estate well if it helps.' },
          { question: 'How many weddings do you host each year?', answer: 'No more than ninety, and only one per day, so you will always have exclusive use of the estate.' },
        ],
      },
    },
    {
      type: 'faq',
      variant: 'accordion',
      anchor: 'practicalities',
      props: {
        tone: 'surface',
        eyebrow: 'Practicalities',
        heading: 'Getting here, staying over and the small print',
        subheading: 'Travel, rooms, access and payments.',
        cta: { label: 'Ask us anything', link: '/enquire#inquiry', style: 'link' },
        items: [
          { question: 'Where exactly are you?', answer: 'In the Chew Valley, about 25 minutes from Bath Spa station and 30 minutes from Bristol Airport. Full directions arrive with your booking.' },
          { question: 'How many guests can stay overnight?', answer: 'Twenty-four, in eleven bedrooms above the Coach House. We can recommend four inns and hotels within ten minutes for everyone else.' },
          { question: 'Is there parking?', answer: 'Space for 80 cars on a gravel field behind the Coach House, with a lit path to the garden. Taxis can be pre-booked for 11.30pm.' },
          { question: 'Is the estate accessible?', answer: 'Paths are level throughout and every space is step-free at ground level. One Coach House bedroom is fully accessible.' },
          { question: 'What happens if it rains?', answer: 'Every outdoor ceremony has an indoor twin. We make the call with you at 10am on the day and the team resets in under an hour.' },
          { question: 'What are the payment terms?', answer: 'A 25% deposit secures your date, with the balance due eight weeks before. Payment plans are available, and dates can be moved once free of charge.' },
        ],
      },
    },
    ctaQuiet('Still wondering?', 'Come and ask in *person*', 'A private viewing takes about an hour, with tea in the Orangery afterwards.', img('diningPlate', { alt: 'Seasonal dish from the Rosewood kitchen' }), 'primary'),
  ],
};

const enquire: PageInput = {
  id: 'pg-enquire',
  title: 'Enquire',
  slug: 'enquire',
  status: 'published',
  seo: seo(
    'Enquire & book a viewing — Rosewood Courtyard',
    'Check availability for your wedding or event at Rosewood Courtyard and book a private viewing, Wednesday to Sunday from 10am to 5pm, in the Chew Valley.',
  ),
  sections: [
    {
      type: 'text-section',
      variant: 'intro',
      props: {
        eyebrow: 'Enquire',
        heading: 'Let’s talk about your *day*',
        headingLevel: 'h1',
        body: 'Share a few details and we’ll reply personally within one working day, with availability, our 2027 brochure and some times for a private viewing.',
        align: 'center',
        containerWidth: 'narrow',
        spacingBottom: 'sm',
      },
      animation: { preset: 'text-reveal' },
    },
    {
      type: 'form',
      variant: 'split-with-text',
      anchor: 'inquiry',
      props: {
        formId: 'form-wedding-inquiry',
        eyebrow: 'Wedding inquiry',
        heading: 'Tell us about your *plans*',
        subheading: 'Not sure of everything yet? That’s completely normal — a season and a rough guest count is plenty to start with.',
        image: img('mingling', { alt: 'Guests mingling under string lights in the courtyard' }),
        showContactDetails: true,
        submitLabel: 'Send our inquiry',
      },
    },
    {
      type: 'contact-info',
      variant: 'cards',
      props: {
        tone: 'surface',
        eyebrow: 'Visit & contact',
        heading: 'Viewings Wednesday to Sunday',
        subheading: 'Private viewings by appointment, 10am – 5pm. Open days are listed on our homepage.',
        showWhatsapp: false,
        showHours: true,
        showSocial: true,
        extra: [
          { label: 'Weddings', value: 'weddings@rosewood.example', link: 'mailto:weddings@rosewood.example' },
          { label: 'Corporate events', value: 'corporate@rosewood.example', link: 'mailto:corporate@rosewood.example' },
          { label: 'Open days', value: 'See upcoming dates', link: '/#open-days' },
        ],
      },
    },
    {
      type: 'section',
      props: { spacingTop: 'lg', spacingBottom: 'xl' },
      children: [
        {
          type: 'columns',
          props: { ratio: '5:7', gap: 'xl', alignItems: 'center' },
          children: [
            {
              type: 'stack',
              props: { gap: 'md' },
              children: [
                { type: 'text', props: { text: 'Finding us', eyebrow: true } },
                { type: 'heading', props: { text: 'In the Chew Valley, near Bath', level: 'h2' } },
                { type: 'text', props: { text: '{{business.address}}. 25 minutes from Bath Spa station and 30 minutes from Bristol Airport. Follow the brown signs for Rosewood from the A368.', muted: true } },
                {
                  type: 'list',
                  props: {
                    style: 'check',
                    items: [{ text: 'Parking for 80 cars on site' }, { text: 'Taxi rank arranged for 11.30pm carriages' }, { text: 'Coach drop-off at the Coach House gate' }],
                  },
                },
              ],
            },
            { type: 'map', props: { query: '{{business.address}}', height: 'lg', zoom: 13, title: 'Map showing Rosewood Courtyard in the Chew Valley' } },
          ],
        },
      ],
    },
  ],
};

const privacy: PageInput = {
  id: 'pg-privacy',
  title: 'Privacy',
  slug: 'privacy',
  status: 'published',
  seo: seo(
    'Privacy notice — Rosewood Courtyard',
    'How Rosewood Courtyard collects, uses and protects the details you share when you enquire, book a viewing or sign up for open-day news — and your rights.',
  ),
  sections: [
    {
      type: 'text-section',
      variant: 'intro',
      props: {
        eyebrow: 'The small print',
        heading: 'Privacy notice',
        headingLevel: 'h1',
        body: 'Rosewood Courtyard Ltd looks after the details you share with us as carefully as we look after the garden. We collect only what we need to plan your event and keep you informed.',
        align: 'left',
        containerWidth: 'narrow',
      },
    },
    {
      type: 'text-section',
      variant: 'two-column',
      props: {
        eyebrow: 'Your details',
        heading: 'What we keep, and why',
        body: 'Inquiry details are used to reply to you and, if you book, to plan your day. We keep booking records for six years for accounting purposes and delete unconverted inquiries after eighteen months.\n\nOpen-day emails are sent only if you ask for them, and every message has a one-click unsubscribe. We never sell or share your details for marketing.\n\nTo access, correct or delete your information, write to {{business.email}}.',
        align: 'left',
        tone: 'surface',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Website
// ---------------------------------------------------------------------------

const website: WebsiteInput = {
  settings: {
    name: NAME,
    business: {
      name: NAME,
      legalName: 'Rosewood Courtyard Ltd',
      type: 'EventVenue',
      tagline: TAGLINE,
      description: DESCRIPTION,
      phone: '+44 1275 555 014',
      email: 'weddings@rosewood.example',
      address: {
        street: 'Hollow Lane',
        locality: 'Chew Magna',
        region: 'Somerset',
        postalCode: 'BS40 8QT',
        country: 'United Kingdom',
        formatted: 'Rosewood Courtyard, Hollow Lane, Chew Magna, Somerset BS40 8QT, United Kingdom',
      },
      geo: { lat: 51.3664, lng: -2.6093 },
      openingHours: [{ days: ['wed', 'thu', 'fri', 'sat', 'sun'], opens: '10:00', closes: '17:00', label: 'Viewings by appointment' }],
      contactPerson: 'Clara Whitcombe, Head of Weddings',
      priceRange: '££££',
      foundedYear: 2019,
    },
    social: socialFrom({
      instagram: 'https://www.instagram.com/rosewoodcourtyard.example',
      pinterest: 'https://www.pinterest.com/rosewoodcourtyard_example',
      facebook: 'https://www.facebook.com/rosewoodcourtyard.example',
    }),
    branding: { wordmark: NAME },
    seo: {
      siteTitle: NAME,
      titleTemplate: `%s · ${NAME}`,
      description: DESCRIPTION,
      ogImage: photoUrl('weddingCouple', 1200),
      robots: { index: true, follow: true },
      canonicalBase: 'https://rosewood.example',
      structuredData: [
        { type: 'EventVenue', auto: true },
        { type: 'WebSite', auto: true },
      ],
      verification: {},
    },
    localization: { defaultLocale: 'en', locales: ['en'], strategy: 'prefix-except-default' },
    scripts: [],
    cookieConsent: {
      enabled: true,
      title: 'A note on cookies',
      message: 'We use essential cookies to run this site and, if you agree, anonymous analytics to improve it.',
      policyUrl: '/privacy',
      categories: ['necessary', 'analytics'],
      position: 'bottom-left',
    },
    analytics: { builtIn: true },
    variables: { curfew: '11.30pm', season: '2027' },
  },
  theme: themeFrom('wedding-blush', 'wedding-blush', { name: 'Rosewood Blush', motion: { intensity: 'moderate', ease: 'power3.out', duration: 1.1 } }),
  navigation: {
    menus: {
      primary: [
        { id: 'nav-venues', label: 'Venues', link: '/venues' },
        { id: 'nav-weddings', label: 'Weddings', link: '/weddings' },
        { id: 'nav-corporate', label: 'Corporate', link: '/corporate' },
        { id: 'nav-gallery', label: 'Gallery', link: '/gallery' },
        { id: 'nav-testimonials', label: 'Kind words', link: '/testimonials' },
        { id: 'nav-faq', label: 'FAQ', link: '/faq' },
      ],
      'footer-explore': [
        { id: 'ft-venues', label: 'The spaces', link: '/venues' },
        { id: 'ft-stay', label: 'Stay the night', link: '/venues#stay' },
        { id: 'ft-weddings', label: 'Weddings', link: '/weddings' },
        { id: 'ft-packages', label: 'Packages', link: '/weddings#packages' },
        { id: 'ft-corporate', label: 'Corporate events', link: '/corporate' },
      ],
      'footer-plan': [
        { id: 'ft-gallery', label: 'Gallery', link: '/gallery' },
        { id: 'ft-testimonials', label: 'Kind words', link: '/testimonials' },
        { id: 'ft-faq', label: 'FAQ', link: '/faq' },
        { id: 'ft-open-days', label: 'Open days', link: '/#open-days' },
        { id: 'ft-enquire', label: 'Enquire', link: '/enquire#inquiry' },
      ],
      legal: [{ id: 'legal-privacy', label: 'Privacy & cookies', link: '/privacy' }],
    },
  },
  header: {
    type: 'site-header',
    variant: 'centered',
    props: { menu: 'primary', cta: VIEWING, sticky: true, transparentOnHero: true, showSocial: true, showContact: false, width: 'wide' },
  },
  footer: {
    type: 'site-footer',
    variant: 'statement',
    props: {
      statement: 'A walled rose garden, a glass Orangery and one wedding at a time.',
      description: 'Rosewood Courtyard · Chew Valley, near Bath. Viewings Wednesday to Sunday, 10am – 5pm.',
      cta: VIEWING,
      columns: [
        { title: 'Explore', menu: 'footer-explore', links: [] },
        { title: 'Plan', menu: 'footer-plan', links: [] },
      ],
      showContact: true,
      showSocial: true,
      showNewsletter: true,
      newsletterFormId: 'form-open-days',
      newsletterHeading: 'Open days & seasonal letters',
      showMap: false,
      legalMenu: 'legal',
      copyright: '© {{year}} Rosewood Courtyard Ltd. Licensed for civil ceremonies.',
      tone: 'inverse',
    },
  },
  pages: [home, venues, weddings, corporate, gallery, testimonials, faq, enquire, privacy],
  forms: [weddingInquiry, corporateInquiry, openDays],
  collections: [],
};

export const rosewoodCourtyard: DemoSite = {
  key: KEY,
  slug: 'rosewood',
  name: NAME,
  description: 'A romantic walled-garden wedding venue — four spaces with capacity tables, packages, open days, galleries and a wedding inquiry form that routes large events and corporate leads.',
  category: 'events',
  tags: ['wedding', 'venue', 'events', 'garden', 'romantic', 'corporate events', 'inquiry form'],
  thumbnail: photoUrl('weddingCouple', 1200),
  website,
};
