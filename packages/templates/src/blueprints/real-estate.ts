import type { ImageKey } from '../images';
import { photoUrl } from '../images';
import type { Blueprint, BlueprintInput } from '../types';
import {
  anim, assemble, btn, buildForm, contactPage, contextOf, ctaSection, faqSection, field, footer, header, heroCopy, homeTitle, img, item,
  metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type Collection, type Section,
} from './shared';

interface PropertySeed {
  slug: string; name: string; category: string; location: string; price: string; beds: string; baths: string; area: string; summary: string; description: string; image: ImageKey; gallery: ImageKey[];
}

const PROPERTIES: PropertySeed[] = [
  { slug: 'the-glass-house', name: 'The Glass House', category: 'For sale', location: 'Hillside', price: '$2,450,000', beds: '4', baths: '3', area: '320 m²', summary: 'A light-filled contemporary home with an infinity pool and panoramic views.', description: 'Set on a private hillside plot, The Glass House opens almost entirely to the garden and pool. An open-plan living space with double-height glazing leads to a terrace for long summer evenings.\n\nFour bedrooms, three bathrooms, a home office and a double garage complete a rare family home.', image: 'villaPool', gallery: ['livingOpen', 'kitchen', 'bathStone', 'houseTwilight'] },
  { slug: 'oak-lane-residence', name: 'Oak Lane Residence', category: 'For sale', location: 'Old Town', price: '$1,180,000', beds: '3', baths: '2', area: '210 m²', summary: 'A beautifully renovated family home on a quiet, tree-lined lane.', description: 'Timber cladding, generous windows and a walled garden make this a calm retreat close to schools, cafés and the station.\n\nA kitchen with charcoal cabinetry opens to the garden; upstairs, three bedrooms include a principal suite with a dressing room.', image: 'houseModern', gallery: ['kitchen', 'livingModern', 'roomWhite'] },
  { slug: 'harbour-loft', name: 'Harbour Loft', category: 'For rent', location: 'Waterfront', price: '$4,800 / month', beds: '2', baths: '2', area: '145 m²', summary: 'A double-height loft apartment with city and water views.', description: 'Exposed beams, polished concrete and a mezzanine bedroom define this striking loft in a converted warehouse.\n\nIncludes a concierge, secure parking and a residents’ roof terrace.', image: 'livingLoft', gallery: ['livingLight', 'skylineSunset', 'bathWhite'] },
  { slug: 'palm-court-villa', name: 'Palm Court Villa', category: 'For sale', location: 'Coastal', price: '$3,200,000', beds: '5', baths: '5', area: '410 m²', summary: 'A tropical villa with a pool pavilion, mature palms and guest house.', description: 'A gated villa set in landscaped gardens with a 20-metre pool, outdoor kitchen and a separate two-bedroom guest house.\n\nMinutes from the beach and the marina.', image: 'villaTropical', gallery: ['poolTropical', 'livingOpen', 'roomGlassSuite'] },
  { slug: 'twilight-house', name: 'Twilight House', category: 'Sold', location: 'Parkside', price: '$1,950,000', beds: '4', baths: '3', area: '280 m²', summary: 'An architect-designed home overlooking the park, sold off-market.', description: 'A home of warm timber and stone with a garden that borders the park.\n\nSold off-market to a buyer from our private register.', image: 'houseTwilight', gallery: ['houseFacade', 'livingModern', 'kitchen'] },
];

function propertiesCollection(): Collection {
  return {
    slug: 'properties',
    name: 'Properties',
    singularName: 'Property',
    description: 'Listings shown on the Properties page and homepage.',
    fields: [
      { key: 'name', label: 'Title', type: 'text', required: true },
      { key: 'category', label: 'Status', type: 'select', options: [{ label: 'For sale', value: 'For sale' }, { label: 'For rent', value: 'For rent' }, { label: 'Under offer', value: 'Under offer' }, { label: 'Sold', value: 'Sold' }] },
      { key: 'location', label: 'Area', type: 'text' },
      { key: 'price', label: 'Price', type: 'text' },
      { key: 'beds', label: 'Bedrooms', type: 'text' },
      { key: 'baths', label: 'Bathrooms', type: 'text' },
      { key: 'area', label: 'Floor area', type: 'text' },
      { key: 'summary', label: 'Summary', type: 'textarea' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'image', label: 'Main image', type: 'image' },
      { key: 'gallery', label: 'Gallery', type: 'gallery' },
    ],
    titleField: 'name',
    routePrefix: 'properties',
    items: PROPERTIES.map((p, i) => item('properties', p.slug, i, { name: p.name, category: p.category, location: p.location, price: p.price, beds: p.beds, baths: p.baths, area: p.area, summary: p.summary, description: p.description, image: img(p.image, { width: 1800 }), gallery: p.gallery.map((g) => img(g, { width: 1800 })) })),
  };
}

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'Homes of *distinction*', 'Exceptional homes for sale and to rent, represented by agents who know every street — and every buyer.');
  const notSold = { match: 'all' as const, conditions: [{ field: 'category', op: 'neq' as const, value: 'Sold' }] };

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'fullscreen-image',
      props: {
        tone: 'inverse', eyebrow: '{{business.name}} · {{vars.location}}', heading: hero.heading, subheading: hero.subheading,
        buttons: [btn('View properties', '/properties'), btn('Book a valuation', '/contact#enquire', 'outline')],
        image: img('houseTwilight'), overlayOpacity: 0.4, height: 'screen', contentPosition: 'bottom-left',
        meta: [{ label: 'Homes sold', value: '1,200+' }, { label: 'Average days to sell', value: '34' }, { label: 'Asking price achieved', value: '98%' }],
        spacingTop: 'none', spacingBottom: 'none',
      },
      animation: anim.cinematic,
    },
    {
      type: 'collection-list',
      variant: 'featured',
      binding: { collection: 'properties', limit: 4, filter: notSold, map: { title: '{{item.name}}', image: '{{item.image}}', text: '{{item.summary}}', tag: '{{item.category}}', meta: '{{item.location}} · {{item.beds}} bed · {{item.price}}', slug: '{{item.slug}}' } },
      props: { eyebrow: 'Featured', heading: 'Current *listings*', collection: 'properties', columns: 3, imageAspect: '4:3', linkLabel: 'View property', buttons: [btn('All properties', '/properties', 'outline')] },
      animation: anim.stagger,
    },
    {
      type: 'content-split',
      variant: 'overlap',
      props: { tone: 'surface', eyebrow: 'Selling with us', heading: 'Sell for *more*, with less stress', body: 'Every home we represent receives architectural photography, a film tour, a printed brochure and a launch to our private register of qualified buyers.\n\nOne agent handles your sale from valuation to completion, with weekly updates throughout.', buttons: [btn('Book a free valuation', '/contact#enquire')], image: img('livingOpen'), secondaryImage: img('kitchen', { width: 1200 }), imageSide: 'left', imageAspect: '4:5' },
      animation: anim.mask,
    },
    { type: 'stats', variant: 'large', props: { items: [{ value: '1,200', suffix: '+', label: 'Homes sold' }, { value: '34', label: 'Average days on market' }, { value: '98', suffix: '%', label: 'Of asking price achieved' }, { value: '15', label: 'Years in {{vars.location}}' }], columns: 4 }, animation: anim.stagger },
    testimonialsSection([
      { quote: 'They sold our home in two weeks, above asking, and made the whole process feel calm. Exceptional service.', author: 'Rachel & Ben', role: 'Sold in Old Town', source: 'Google' },
      { quote: 'Our agent found us a home before it reached the market. Honest advice from start to finish.', author: 'Daniel K.', role: 'Bought in Hillside' },
    ], { variant: 'carousel', tone: 'default', eyebrow: 'Client stories' }),
    ctaSection({ eyebrow: 'Valuations', heading: 'What is your home *worth*?', subheading: 'Book a free, no-obligation valuation with a local expert.', buttons: [btn('Book a valuation', '/contact#enquire')], image: 'houseFacade' }),
  ];

  const properties: Section[] = [
    { type: 'hero', variant: 'minimal', props: { eyebrow: 'Properties', heading: 'Homes for sale & *to rent*', subheading: 'Browse our current listings. Register with us to hear about new homes before they reach the market.', buttons: [btn('Register as a buyer', '/contact#enquire', 'outline')], height: 'auto', spacingTop: 'xl', spacingBottom: 'md' }, animation: anim.hero },
    {
      type: 'collection-list',
      variant: 'grid',
      anchor: 'listings',
      binding: { collection: 'properties', map: { title: '{{item.name}}', image: '{{item.image}}', text: '{{item.summary}}', tag: '{{item.category}}', meta: '{{item.location}} · {{item.beds}} bed · {{item.baths}} bath · {{item.area}}', slug: '{{item.slug}}' } },
      props: { collection: 'properties', columns: 3, imageAspect: '4:3', linkLabel: 'View property', emptyText: 'New homes are coming soon — register to hear first.', spacingTop: 'md' },
      animation: anim.stagger,
    },
    { type: 'newsletter', variant: 'banner', props: { formId: 'form-newsletter', eyebrow: 'Private register', heading: 'Hear about homes *first*', text: 'Many of our homes sell before they are listed. Join the register for early access.', image: img('livingModern'), buttonLabel: 'Join the register', placeholder: 'Your email address' } },
  ];

  const propertyDetail: Section[] = [
    { type: 'hero', variant: 'fullscreen-image', props: { tone: 'inverse', eyebrow: '{{item.category}} · {{item.location}}', heading: '{{item.name}}', subheading: '{{item.summary}}', buttons: [btn('Arrange a viewing', '#viewing'), btn('All properties', '/properties', 'outline')], image: { src: '{{item.image}}', alt: '{{item.name}}' }, height: 'tall', overlayOpacity: 0.4, spacingTop: 'none', spacingBottom: 'none' }, animation: anim.cinematic },
    { type: 'stats', variant: 'inline', props: { items: [{ value: '{{item.price}}', label: 'Price' }, { value: '{{item.beds}}', label: 'Bedrooms' }, { value: '{{item.baths}}', label: 'Bathrooms' }, { value: '{{item.area}}', label: 'Floor area' }], columns: 4, spacingTop: 'md', spacingBottom: 'md' } },
    { type: 'text-section', variant: 'two-column', props: { eyebrow: 'The property', heading: 'About this *home*', body: '{{item.description}}', align: 'left' }, animation: anim.fadeUp },
    { type: 'gallery', variant: 'editorial', props: { tone: 'surface', eyebrow: 'Gallery', heading: 'Inside & *out*', images: [], fromItemField: 'gallery', columns: 3, lightbox: true } , animation: anim.stagger },
    { type: 'section', props: { spacingTop: 'lg', spacingBottom: 'md' }, children: [{ type: 'heading', props: { text: 'Location', level: 'h2' } }, { type: 'map', props: { query: '{{item.location}}, {{vars.location}}', height: 'md', title: 'Map showing the property area' } }] },
    { type: 'form', variant: 'split-with-text', anchor: 'viewing', props: { tone: 'surface', formId: 'form-enquiry', eyebrow: 'Viewings', heading: 'Arrange a *viewing*', subheading: 'Tell us when suits you and the listing agent will confirm a time — usually the same day.', showContactDetails: true } },
    { type: 'collection-list', variant: 'grid', props: { eyebrow: 'You may also like', heading: 'Similar *homes*', collection: 'properties', limit: 3, columns: 3, imageAspect: '4:3', excludeCurrent: true, linkLabel: 'View property' } },
  ];

  const about: Section[] = [
    { type: 'hero', variant: 'split', props: { eyebrow: 'About & agents', heading: 'Local knowledge, *personal* service', subheading: 'An independent agency founded on a simple idea: one experienced agent, from first call to keys in hand.', buttons: [btn('Meet the team', '#team', 'link')], image: img('officeCorridor'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' }, animation: anim.hero },
    { type: 'text-section', variant: 'two-column', props: { eyebrow: 'Our approach', heading: 'Fewer homes, *better* represented', body: 'We deliberately take on fewer instructions than the big chains, so every home gets the attention it deserves — beautiful marketing, honest pricing advice and an agent who answers the phone.\n\nOur private register of buyers means many homes sell before they ever reach the portals.', align: 'left' }, animation: anim.fadeUp },
    {
      type: 'team',
      variant: 'grid',
      anchor: 'team',
      props: {
        tone: 'surface', eyebrow: 'Agents', heading: 'Meet the *team*',
        members: [
          { name: 'Olivia Grant', role: 'Founder & Director', bio: 'Fifteen years selling homes across the city.', photo: img('portraitW7', { width: 800 }), links: [] },
          { name: 'James Whitfield', role: 'Senior Sales Agent', bio: 'Specialist in architect-designed and period homes.', photo: img('portraitM7', { width: 800 }), links: [] },
          { name: 'Sofia Marin', role: 'Lettings Manager', bio: 'Looks after landlords and tenants with care.', photo: img('portraitW8', { width: 800 }), links: [] },
          { name: 'Ethan Cole', role: 'Valuer', bio: 'Accurate, evidence-based valuations.', photo: img('portraitM6', { width: 800 }), links: [] },
        ],
        columns: 4, portraitAspect: '4:5',
      },
      animation: anim.stagger,
    },
    faqSection([
      { question: 'How much do you charge to sell?', answer: 'Our fee is a percentage of the final sale price, agreed up front, with no upfront marketing costs. Ask for a tailored quote.' },
      { question: 'How long does a valuation take?', answer: 'Around 45 minutes at your home, with a written report within 48 hours.' },
      { question: 'Do you manage rental properties?', answer: 'Yes — full management or tenant-find services for landlords.' },
    ]),
    ctaSection({ heading: 'Thinking of *moving*?', buttons: [btn('Talk to an agent', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Estate agents'), seoDescription: metaDescription(`${name} is an independent estate agency selling and letting exceptional homes in ${input.location ?? 'the area'}.`, 'Free valuations.'), sections: home }),
    page({ title: 'Properties', slug: 'properties', seoTitle: metaTitle('Properties for sale & rent', name), seoDescription: metaDescription(`Browse homes for sale and to rent with ${name}. Register for early access to new listings before they reach the market.`), sections: properties }),
    page({ title: 'Property', slug: 'property-detail', kind: 'collection-template', collection: 'properties', seoTitle: '{{item.name}}', seoDescription: '{{item.summary}}', sections: propertyDetail, structuredData: [{ type: 'Product', auto: true }] }),
    page({ title: 'About & agents', slug: 'about', seoTitle: metaTitle('About & agents', name), seoDescription: metaDescription(`Meet the agents at ${name}, an independent agency offering honest advice, beautiful marketing and one agent from start to finish.`), sections: about }),
    contactPage({
      name, formId: 'form-enquiry', heroImage: 'houseFacade', heading: 'Talk to an *agent*', intro: 'Buying, selling, letting or just curious about the market — we are happy to help.',
      formHeading: 'How can we *help*?', formSubheading: 'Book a valuation, arrange a viewing or register as a buyer. We reply the same working day.', formImage: 'livingLight', detailsHeading: 'Visit our *office*',
      seoDescription: metaDescription(`Contact ${name} to book a free valuation, arrange a viewing or register as a buyer. We reply the same working day.`),
    }),
    privacyPage(name),
  ];

  const enquiry = buildForm({
    id: 'form-enquiry', name: 'Property enquiry', slug: 'property-enquiry', notify, subject: 'New property enquiry from {{name}} ({{interest}})',
    fields: [field.name(), field.email(), field.phone('half', true), field.select('interest', 'I would like to', ['Book a valuation', 'Arrange a viewing', 'Register as a buyer', 'Let my property', 'Something else'], { required: true }), { id: 'f-property', type: 'text', name: 'property', label: 'Property or address', width: 'half', required: false }, field.date('preferredDate', 'Preferred date'), field.message('Anything else?', 'Budget, timing, what you are looking for…'), field.consent()],
    submitLabel: 'Send enquiry',
    successMessage: 'Thank you — an agent will be in touch the same working day.',
    rules: [{ id: 'form-enquiry-valuation', name: 'Tag valuation leads', enabled: true, when: { match: 'all', conditions: [{ field: 'interest', op: 'eq', value: 'book-a-valuation' }] }, then: [{ type: 'tag', tags: ['valuation'] }], otherwise: [], stopProcessing: false }],
  });

  return assemble(ctx, {
    type: 'RealEstateAgent',
    description: `${name} is an independent estate agency selling and letting exceptional homes, with free valuations and a private buyer register.`,
    structuredData: ['LocalBusiness', 'WebSite'],
    theme: 'midnight-luxe',
    ogImage: 'houseTwilight',
    defaultLocation: 'the city',
    menus: {
      primary: [navItem('nav-properties', 'Properties', '/properties'), navItem('nav-about', 'About & agents', '/about'), navItem('nav-contact', 'Contact', '/contact')],
      'footer-explore': [navItem('nav-f-properties', 'Properties', '/properties'), navItem('nav-f-team', 'Our agents', '/about#team'), navItem('nav-f-valuation', 'Book a valuation', '/contact#enquire'), navItem('nav-f-office', 'Visit the office', '/contact#visit')],
    },
    header: header({ variant: 'classic', cta: btn('Book a valuation', '/contact#enquire'), showContact: true }),
    footer: footer({ variant: 'columns', columns: [{ title: 'Explore', menu: 'footer-explore' }], newsletterHeading: 'New homes, first' }),
    pages,
    forms: [enquiry],
    collections: [propertiesCollection()],
  });
}

export const realEstate: Blueprint = {
  key: 'real-estate',
  name: 'Real estate agency',
  description: 'Luxury property site with a listings collection and property detail pages (price, beds, baths, area), agents and a valuation enquiry form.',
  category: 'real-estate',
  tags: ['real estate', 'property', 'listings', 'agents', 'valuation'],
  thumbnail: photoUrl('houseTwilight', 1200),
  build,
};
