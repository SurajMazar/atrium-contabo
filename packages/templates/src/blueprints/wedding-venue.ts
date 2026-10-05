import { photoUrl } from '../images';
import type { Blueprint, BlueprintInput } from '../types';
import {
  anim, assemble, btn, buildForm, contactPage, contextOf, ctaSection, faqSection, field, footer, galleryImages, header, heroCopy, homeTitle, img,
  metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type FaqItem, type Section,
} from './shared';

const SPACES = [
  { name: 'The Rose Garden', image: 'weddingPavilion', size: '850 m²', description: 'Our ceremony garden: climbing roses, a stone pavilion and an aisle beneath old oaks. Golden-hour light from May to September.', capacities: [{ layout: 'Ceremony', guests: '220' }, { layout: 'Cocktail', guests: '300' }], features: ['Stone pavilion', 'Sunset light', 'Wet-weather plan'] },
  { name: 'The Orangery', image: 'ballroom', size: '420 m²', description: 'A glass-roofed hall with chandeliers and a sprung dance floor, for dinners and dancing in any season.', capacities: [{ layout: 'Banquet', guests: '180' }, { layout: 'Theatre', guests: '240' }, { layout: 'Cocktail', guests: '260' }], features: ['Dance floor', 'In-house AV', 'Bridal suite'] },
  { name: 'The Courtyard', image: 'toastLights', size: '300 m²', description: 'A cobbled courtyard strung with festoon lights — drinks receptions, late-night food and sparklers.', capacities: [{ layout: 'Cocktail', guests: '200' }, { layout: 'Banquet', guests: '120' }], features: ['Festoon lighting', 'Fire pits'] },
  { name: 'The Long Barn', image: 'longTable', size: '260 m²', description: 'Exposed beams and one long table for intimate weddings and rehearsal dinners.', capacities: [{ layout: 'Banquet', guests: '90' }, { layout: 'Cocktail', guests: '120' }], features: ['Exposed beams', 'Private bar'] },
] as const;

const FAQ: FaqItem[] = [
  { question: 'How many guests can you host?', answer: 'Up to 220 for a ceremony and 180 for a seated dinner. Larger celebrations are possible with a marquee on the lawn — mention it in your enquiry.' },
  { question: 'Do you have exclusive use?', answer: 'Yes. We host one wedding per day, so the gardens, spaces and team are yours from morning until midnight.' },
  { question: 'Can we bring our own suppliers?', answer: 'You are welcome to choose your own photographer, florist and band. Catering and bar are provided by our in-house team.' },
  { question: 'Is there accommodation on site?', answer: 'The bridal suite is included with every wedding, and we partner with nearby hotels for guest rooms at preferential rates.' },
  { question: 'What happens if it rains?', answer: 'Every outdoor ceremony has an indoor plan in the Orangery, set up in parallel so you can decide on the morning.' },
  { question: 'How far ahead should we book?', answer: 'Popular summer Saturdays book 12 to 18 months ahead. Weekdays and winter dates are often available at shorter notice.' },
  { question: 'Do you cater for dietary requirements?', answer: 'Always. Our chefs create vegetarian, vegan and allergy-friendly menus as standard and will happily tailor any dish.' },
  { question: 'Can we visit before booking?', answer: 'Of course — book a private viewing with our wedding coordinator through the enquiry form, any day of the week.' },
];

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'Your day, *beautifully* held', 'Gardens, an orangery and a team that has looked after hundreds of couples — one wedding at a time.');

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'carousel',
      props: {
        tone: 'inverse', eyebrow: '{{business.name}} · {{vars.location}}', heading: hero.heading, subheading: hero.subheading,
        buttons: [btn('Book a viewing', '/enquire#enquire'), btn('Explore the venue', '/venues', 'outline')],
        images: [img('weddingAisle'), img('weddingTable'), img('weddingCouple'), img('marqueeReception')], height: 'screen', overlayOpacity: 0.35, contentPosition: 'bottom-center', showScrollCue: true,
        spacingTop: 'none', spacingBottom: 'none',
      },
      animation: anim.cinematic,
    },
    {
      type: 'text-section',
      variant: 'statement',
      props: { eyebrow: 'Welcome', heading: 'One wedding a day, a team who *remembers* every name, and gardens that look their best in photographs.', body: 'From your first viewing to the last dance, a dedicated coordinator shapes every detail with you — the flowers, the menu, the music and the moments in between.', align: 'center', containerWidth: 'narrow', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.text,
    },
    {
      type: 'venues',
      variant: 'cards',
      props: {
        tone: 'surface', eyebrow: 'Spaces', heading: 'Four spaces, *one* celebration',
        items: SPACES.slice(0, 3).map((s) => ({ ...s, image: img(s.image, { width: 1600 }), capacities: [...s.capacities], features: [...s.features], link: '/venues' })),
        showTable: false, columns: 3,
      },
      animation: anim.stagger,
    },
    {
      type: 'content-split',
      variant: 'collage',
      props: {
        eyebrow: 'Your coordinator', heading: 'Someone in your *corner*', body: 'Every couple is paired with a coordinator who knows the venue inside out — timings, suppliers, seating plans and the little rituals that make a day yours.\n\nOn the day, they quietly run the show so you never have to look at a watch.',
        buttons: [btn('How we plan', '/weddings', 'link')], image: img('weddingBouquet'), secondaryImage: img('florals', { width: 1600 }), imageSide: 'left', imageAspect: '4:5',
      },
      animation: anim.mask,
    },
    {
      type: 'marquee',
      props: { items: [{ text: 'Garden ceremonies' }, { text: 'Long-table dinners' }, { text: 'Dancing till midnight' }, { text: 'Elopements' }, { text: 'Rehearsal dinners' }], separator: '✦', speed: 40, size: 'lg', italic: true, spacingTop: 'sm', spacingBottom: 'sm' },
    },
    {
      type: 'offers',
      variant: 'cards',
      props: {
        eyebrow: 'Packages', heading: 'Ways to *celebrate*',
        items: [
          { title: 'Intimate', price: 'From $6,500', priceNote: 'up to 40 guests', image: img('dinnerParty', { width: 1600 }), description: 'Ceremony in the Rose Garden and dinner in the Long Barn.', inclusions: ['Ceremony & dinner', 'Coordinator', 'Bridal suite'], cta: btn('View packages', '/weddings', 'outline') },
          { title: 'Classic', badge: 'Most loved', price: 'From $16,000', priceNote: 'up to 120 guests', image: img('weddingTable', { width: 1600 }), description: 'A full day from ceremony to dancing in the Orangery.', inclusions: ['Three-course dinner', 'Drinks package', 'Evening food'], cta: btn('View packages', '/weddings', 'outline') },
          { title: 'Grand', price: 'From $28,000', priceNote: 'up to 220 guests', image: img('ballroom', { width: 1600 }), description: 'Exclusive use of every space, with a marquee option for more.', inclusions: ['All four spaces', 'Welcome drinks', 'Late licence'], cta: btn('View packages', '/weddings', 'outline') },
        ],
        columns: 3, imageAspect: '3:2',
      },
      animation: anim.stagger,
    },
    testimonialsSection([
      { quote: 'Our coordinator thought of things we never would have. On the day we just got to be present — it was perfect.', author: 'Sophie & Daniel', role: 'Married in the Rose Garden', source: 'Google' },
      { quote: 'The Orangery at night, with candles everywhere, took our breath away. Guests still talk about the food.', author: 'Aisha & Marcus', role: 'Classic package' },
      { quote: 'Calm, kind and incredibly organised. We could not recommend the team more highly.', author: 'Hannah & Leo', role: 'Intimate wedding', source: 'Hitched' },
    ], { eyebrow: 'Love notes', heading: 'From our *couples*' }),
    {
      type: 'gallery',
      variant: 'editorial',
      props: { eyebrow: 'Gallery', heading: 'Real *weddings*', images: galleryImages(['weddingRings', 'weddingCelebration', 'dessertTable', 'weddingHands', 'mingling', 'weddingWalk']), columns: 3, lightbox: true, buttons: [] },
      animation: anim.stagger,
    },
    ctaSection({ eyebrow: 'Visit us', heading: 'Come and *see* it for yourself', subheading: 'Private viewings every day of the week — walk the gardens, taste the menu and meet your coordinator.', buttons: [btn('Book a viewing', '/enquire#enquire'), btn('Read the FAQ', '/faq', 'outline')], image: 'gardenPath' }),
  ];

  const venues: Section[] = [
    {
      type: 'hero',
      variant: 'editorial',
      props: { eyebrow: 'The venue', heading: 'Spaces for every *moment*', subheading: 'A ceremony garden, a glass orangery, a lantern-lit courtyard and a timber barn — all for you, all day.', buttons: [btn('Book a viewing', '/enquire#enquire')], image: img('weddingPavilion'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'venues',
      variant: 'detailed',
      anchor: 'spaces',
      props: { eyebrow: 'Spaces', heading: 'Explore the *venue*', items: SPACES.map((s) => ({ ...s, image: img(s.image, { width: 1800 }), capacities: [...s.capacities], features: [...s.features] })), showTable: true },
      animation: anim.fadeUp,
    },
    {
      type: 'amenities',
      variant: 'list',
      props: {
        tone: 'surface', eyebrow: 'Included', heading: 'Thoughtfully *equipped*',
        items: [
          { icon: 'gem', title: 'Bridal suite', text: 'A private suite for getting ready.' },
          { icon: 'utensils', title: 'In-house catering', text: 'Seasonal menus from our own kitchen.' },
          { icon: 'wine', title: 'Bar & cellar', text: 'Drinks packages and a sommelier.' },
          { icon: 'music', title: 'Sound & lighting', text: 'PA, dance floor and uplighting.' },
          { icon: 'circle-parking', title: 'Parking', text: 'Free parking for 120 cars.' },
          { icon: 'accessibility', title: 'Step-free access', text: 'Throughout every space.' },
        ],
        columns: 3,
      },
    },
    {
      type: 'parallax-band',
      props: { image: img('weddingField'), heading: 'Golden hour, *every* hour', text: 'West-facing gardens mean beautiful light for portraits from late afternoon.', height: 'md', overlayOpacity: 0.3, intensity: 'subtle', tone: 'inverse', spacingTop: 'none', spacingBottom: 'none' },
      animation: anim.fade,
    },
    ctaSection({ heading: 'Find your *date*', subheading: 'Tell us your season and guest numbers and we will share availability.', buttons: [btn('Check availability', '/enquire#enquire')], variant: 'banner', tone: 'surface' }),
  ];

  const weddings: Section[] = [
    {
      type: 'hero',
      variant: 'split',
      props: { eyebrow: 'Weddings', heading: 'Packages, *simply* priced', subheading: 'Everything you need for the day, with room to make it entirely your own.', buttons: [btn('Request a brochure', '/enquire#enquire'), btn('See inclusions', '#packages', 'link')], image: img('weddingBacklit'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'offers',
      variant: 'list',
      anchor: 'packages',
      props: {
        eyebrow: 'Packages', heading: 'Choose your *celebration*',
        items: [
          { title: 'Elopement', image: img('weddingHands', { width: 1600 }), price: 'From $2,800', priceNote: 'up to 10 guests', description: 'A weekday ceremony in the Rose Garden, a photographer for two hours and a private dinner.', inclusions: ['Ceremony & celebrant', 'Two-hour photography', 'Dinner for up to 10'], validity: 'Monday to Thursday', cta: btn('Enquire', '/enquire#enquire', 'outline') },
          { title: 'Intimate', image: img('dinnerParty', { width: 1600 }), price: 'From $6,500', priceNote: 'up to 40 guests', description: 'Ceremony, drinks in the Courtyard and dinner around one long table in the Barn.', inclusions: ['Ceremony & drinks', 'Three-course dinner', 'Coordinator & bridal suite'], cta: btn('Enquire', '/enquire#enquire', 'outline') },
          { title: 'Classic', badge: 'Most loved', image: img('weddingTable', { width: 1600 }), price: 'From $16,000', priceNote: 'up to 120 guests', description: 'The full day — ceremony, reception, dinner and dancing in the Orangery.', inclusions: ['Drinks reception', 'Three-course dinner & wine', 'Evening food & DJ booth'], cta: btn('Enquire', '/enquire#enquire', 'outline') },
          { title: 'Grand', image: img('ballroom', { width: 1600 }), price: 'From $28,000', priceNote: 'up to 220 guests', description: 'Exclusive use of every space, a late licence and a marquee option for larger parties.', inclusions: ['All four spaces', 'Champagne reception', 'Late licence to 1am'], cta: btn('Enquire', '/enquire#enquire', 'outline') },
        ],
        imageAspect: '3:2',
      },
      animation: anim.stagger,
    },
    {
      type: 'timeline',
      variant: 'steps',
      props: {
        tone: 'surface', eyebrow: 'Planning', heading: 'From hello to *happily* ever after',
        items: [
          { date: 'Step 1', title: 'Viewing', text: 'Walk the venue, taste the menu and meet the team.' },
          { date: 'Step 2', title: 'Reserve your date', text: 'A deposit secures your date and your coordinator.' },
          { date: 'Step 3', title: 'Planning meetings', text: 'Menu tasting, styling and a timeline built around you.' },
          { date: 'Step 4', title: 'The day', text: 'We run the show — you enjoy every minute.' },
        ],
      },
      animation: anim.stagger,
    },
    {
      type: 'menu',
      variant: 'classic',
      props: {
        eyebrow: 'Sample wedding menu', heading: 'Seasonal and *generous*', align: 'center',
        categories: [
          { name: 'Canapés', items: [{ name: 'Beetroot tartlet', description: 'Goat’s curd, thyme', tags: ['V'] }, { name: 'Smoked trout blini', description: 'Crème fraîche, dill', tags: [] }] },
          { name: 'Wedding breakfast', items: [{ name: 'Heritage tomato salad', description: 'Burrata, basil oil', tags: ['V', 'GF'] }, { name: 'Roast sirloin', description: 'Duck-fat potatoes, red wine jus', tags: ['GF'] }, { name: 'Lemon posset', description: 'Shortbread, summer berries', tags: ['V'] }] },
        ],
        columns: 2, note: 'Menus are tailored to your season and tastes at your tasting.',
      },
    },
    testimonialsSection([
      { quote: 'Booking the Classic package took all the stress away — and they still let us personalise every detail.', author: 'Priya & Sam', role: 'Classic package' },
    ], { variant: 'single', tone: 'default', eyebrow: 'Love notes' }),
    ctaSection({ heading: 'Let us start *planning*', subheading: 'Request a brochure with full pricing and available dates.', buttons: [btn('Request a brochure', '/enquire#enquire')], image: 'weddingCelebration' }),
  ];

  const gallery: Section[] = [
    {
      type: 'hero',
      variant: 'minimal',
      props: { eyebrow: 'Gallery', heading: 'Moments we have *loved*', subheading: 'Ceremonies, dinners and dance floors from recent celebrations.', buttons: [btn('Book a viewing', '/enquire#enquire', 'outline')], height: 'auto', spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.hero,
    },
    {
      type: 'gallery',
      variant: 'masonry',
      props: { images: galleryImages([['weddingAisle', 'The Rose Garden aisle'], ['weddingRings', 'Details'], ['weddingTable', 'Orangery dinner'], ['weddingBouquet', 'Peach roses'], ['toastLights', 'Courtyard toasts'], ['weddingField', 'Golden hour'], ['dessertTable', 'Dessert table'], ['weddingCelebration', 'The send-off'], ['banquetTable', 'Table styling'], ['weddingWalk', 'Portraits'], ['florals', 'Florals'], ['marqueeReception', 'Marquee wedding']]), columns: 3, gap: 'md', lightbox: true, showCaptions: true, spacingTop: 'none' },
      animation: anim.stagger,
    },
    {
      type: 'carousel',
      variant: 'peek',
      props: { tone: 'surface', eyebrow: 'Real weddings', heading: 'Stories in *pictures*', slides: [{ image: img('weddingCouple'), title: 'Sophie & Daniel', text: 'A June garden wedding for 110 guests.' }, { image: img('ballroom'), title: 'Aisha & Marcus', text: 'Candlelit dinner and dancing in the Orangery.' }, { image: img('weddingHands'), title: 'Hannah & Leo', text: 'An intimate elopement in early spring.' }], aspect: '16:9' },
    },
    ctaSection({ heading: 'Imagine *your* day here', buttons: [btn('Start your enquiry', '/enquire#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const faq: Section[] = [
    {
      type: 'text-section',
      variant: 'intro',
      props: { eyebrow: 'FAQ', heading: 'Questions couples *ask*', headingLevel: 'h1', body: 'Everything you might want to know before your viewing. If we have missed something, our coordinators are a message away.', buttons: [btn('Ask a question', '/enquire#enquire', 'outline')], align: 'center', spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.fadeUp,
    },
    faqSection(FAQ, { eyebrow: 'Good to know', heading: 'Planning *essentials*', subheading: 'Still wondering? Write to {{business.email | our coordinators}} — we reply within a day.', ctaLink: '/enquire#enquire' }),
    ctaSection({ heading: 'Ready to *visit*?', subheading: 'Viewings are available seven days a week.', buttons: [btn('Book a viewing', '/enquire#enquire')], image: 'weddingChairs' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Wedding venue'), seoDescription: metaDescription(`${name} is a wedding venue in ${input.location ?? 'beautiful gardens'} with a rose garden, orangery and courtyard for up to 220 guests.`), sections: home }),
    page({ title: 'Venues', slug: 'venues', seoTitle: metaTitle('Spaces & capacities', name), seoDescription: metaDescription(`Explore the ceremony garden, orangery, courtyard and barn at ${name}, with capacities for ceremonies, dinners and receptions.`), sections: venues }),
    page({ title: 'Weddings', slug: 'weddings', seoTitle: metaTitle('Wedding packages', name), seoDescription: metaDescription(`Wedding packages at ${name}, from elopements to grand celebrations for 220 guests, with a dedicated coordinator.`), sections: weddings }),
    page({ title: 'Gallery', slug: 'gallery', seoTitle: metaTitle('Gallery', name), seoDescription: metaDescription(`Photographs of real weddings at ${name}: garden ceremonies, candlelit dinners and dance floors.`), sections: gallery }),
    page({ title: 'FAQ', slug: 'faq', seoTitle: metaTitle('Wedding FAQ', name), seoDescription: metaDescription(`Answers to common questions about weddings at ${name}: capacity, exclusive use, suppliers, accommodation and wet-weather plans.`), sections: faq, structuredData: [{ type: 'FAQPage', auto: true }] }),
    contactPage({
      name, title: 'Enquire', slug: 'enquire', formId: 'form-wedding', heroImage: 'weddingCouple', eyebrow: 'Enquire', heading: 'Let us talk about your *day*', intro: 'Tell us your date, guest numbers and ideas. Our coordinators reply within one working day with availability and a brochure.',
      formEyebrow: 'Wedding enquiry', formHeading: 'Your *wedding* details', formSubheading: 'The more you share, the better we can tailor our reply — and every enquiry includes an invitation to a private viewing.', formImage: 'weddingBouquet',
      seoDescription: metaDescription(`Enquire about your wedding at ${name}. Check availability, request a brochure and book a private viewing with our coordinators.`),
    }),
    privacyPage(name),
  ];

  const wedding = buildForm({
    id: 'form-wedding', name: 'Wedding enquiry', slug: 'wedding-enquiry', notify, subject: 'New wedding enquiry from {{name}}',
    fields: [
      field.name(), { id: 'f-partner', type: 'text', name: 'partnerName', label: 'Partner’s name', width: 'half', required: false }, field.email(), field.phone(),
      field.date('weddingDate', 'Preferred date'), { id: 'f-flexible', type: 'checkbox', name: 'flexibleDates', label: 'Our dates are flexible', width: 'half', required: false },
      field.number('guestCount', 'Number of guests', { min: 1, max: 1000, required: true }), field.select('package', 'Package of interest', ['Elopement', 'Intimate', 'Classic', 'Grand', 'Not sure yet']),
      field.message('Tell us about your plans', 'Season, style, must-haves…'), field.consent(),
    ],
    submitLabel: 'Send wedding enquiry',
    successMessage: 'Thank you — your coordinator will be in touch within one working day with availability and our brochure.',
    autoreply: { subject: 'Your wedding enquiry', html: '<p>Dear {{name}},</p><p>Thank you for thinking of {{business.name}} for your wedding. A coordinator will reply within one working day.</p>' },
    rules: [{ id: 'form-wedding-large', name: 'Large weddings to the events director', enabled: true, when: { match: 'all', conditions: [{ field: 'guestCount', op: 'gt', value: 200 }] }, then: [{ type: 'email', to: [notify], subject: 'Large wedding enquiry ({{guestCount}} guests)' }, { type: 'tag', tags: ['large-event'] }], otherwise: [], stopProcessing: false }],
  });

  return assemble(ctx, {
    type: 'EventVenue',
    description: `${name} is a wedding venue with a rose garden, glass orangery, courtyard and barn — one wedding a day, with a dedicated coordinator.`,
    structuredData: ['EventVenue', 'LocalBusiness', 'WebSite'],
    theme: 'wedding-blush',
    ogImage: 'weddingAisle',
    defaultLocation: 'the countryside',
    contactPath: '/enquire',
    menus: {
      primary: [
        navItem('nav-venues', 'Venues', '/venues'),
        navItem('nav-weddings', 'Weddings', '/weddings'),
        navItem('nav-gallery', 'Gallery', '/gallery'),
        navItem('nav-faq', 'FAQ', '/faq'),
        navItem('nav-enquire', 'Enquire', '/enquire'),
      ],
      'footer-explore': [
        navItem('nav-f-venues', 'The venue', '/venues'),
        navItem('nav-f-packages', 'Packages', '/weddings#packages'),
        navItem('nav-f-gallery', 'Real weddings', '/gallery'),
        navItem('nav-f-faq', 'FAQ', '/faq'),
        navItem('nav-f-viewing', 'Book a viewing', '/enquire#enquire'),
      ],
    },
    header: header({ variant: 'centered', cta: btn('Book a viewing', '/enquire#enquire') }),
    footer: footer({ variant: 'statement', statement: 'We would love to *meet* you.', cta: btn('Book a viewing', '/enquire#enquire'), columns: [{ title: 'Explore', menu: 'footer-explore' }], newsletterHeading: 'Wedding inspiration, monthly' }),
    pages,
    forms: [wedding],
  });
}

export const weddingVenue: Blueprint = {
  key: 'wedding-venue',
  name: 'Wedding venue',
  description: 'Romantic venue site with spaces and capacities, packages, real-wedding gallery, FAQ and a wedding enquiry form that flags large events.',
  category: 'events',
  tags: ['wedding', 'venue', 'events', 'packages', 'enquiry'],
  thumbnail: photoUrl('weddingAisle', 1200),
  build,
};
