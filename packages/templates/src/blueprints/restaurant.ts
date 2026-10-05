import { photoUrl } from '../images';
import type { Blueprint, BlueprintInput } from '../types';
import {
  anim, assemble, btn, buildForm, contactPage, contextOf, ctaSection, field, footer, galleryImages, header, heroCopy, homeTitle, img,
  metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type Section,
} from './shared';

const HOURS = [
  { label: 'Tuesday – Thursday', value: '17:30 – 22:30' },
  { label: 'Friday – Saturday', value: '12:00 – 23:00' },
  { label: 'Sunday', value: '12:00 – 21:00' },
  { label: 'Monday', value: 'Closed' },
];

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'Seasonal plates, *good* wine, long evenings', 'A neighbourhood restaurant cooking honest, produce-led food — with a wine list chosen by people who love to share it.');

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'fullscreen-image',
      props: {
        tone: 'inverse', eyebrow: '{{business.name}} · {{vars.location}}', heading: hero.heading, subheading: hero.subheading,
        buttons: [btn('Book a table', '/reservations#enquire'), btn('See the menu', '/menu', 'outline')],
        image: img('diningMoody'), overlayOpacity: 0.45, height: 'screen', contentPosition: 'bottom-left',
        meta: [{ label: 'Dinner', value: 'Tue – Sun' }, { label: 'Lunch', value: 'Fri – Sun' }, { label: 'Private room', value: 'Up to 24' }],
        spacingTop: 'none', spacingBottom: 'none',
      },
      animation: anim.cinematic,
    },
    {
      type: 'text-section',
      variant: 'statement',
      props: { eyebrow: 'The kitchen', heading: 'We cook what is *in season*, buy from people we know, and change the menu whenever the market tells us to.', body: 'Small plates to share, a few big ones to fight over, and desserts worth saving room for. Come for a glass at the bar or settle in for the evening.', buttons: [btn('Read our story', '#story', 'link')], align: 'center', containerWidth: 'narrow', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.text,
    },
    {
      type: 'features',
      variant: 'cards',
      props: {
        tone: 'surface', eyebrow: 'Tonight', heading: 'A taste of the *menu*',
        items: [
          { image: img('diningPlate', { width: 1400 }), eyebrow: 'Small plates', title: 'Market crudo', text: 'Citrus-cured fish, chilli, fennel and herbs from the garden.' },
          { image: img('foodSpread', { width: 1400 }), eyebrow: 'From the grill', title: 'Coal-roasted lamb', text: 'Smoked aubergine, yoghurt, pickled shallots and flatbread.' },
          { image: img('dessert', { width: 1400 }), eyebrow: 'Desserts', title: 'Honey panna cotta', text: 'Roasted stone fruit and almond crumb.' },
        ],
        columns: 3, imageAspect: '4:5', buttons: [btn('Full menu', '/menu', 'outline')],
      },
      animation: anim.stagger,
    },
    {
      type: 'content-split',
      variant: 'overlap',
      anchor: 'story',
      props: {
        eyebrow: 'Our story', heading: 'A *neighbourhood* table', body: '{{business.name}} began with a simple idea: the kind of place we wanted to eat in ourselves. Warm light, a busy open kitchen, and food that tastes of where it comes from.\n\nWe work with a handful of farms, fishers and winemakers, and we cook everything from scratch — bread, butter, ferments and all.',
        buttons: [btn('Private dining', '/private-dining', 'link')], image: img('restaurantIndustrial'), secondaryImage: img('cocktailPour', { width: 1400 }), imageSide: 'right', imageAspect: '4:5',
        facts: [{ label: 'Covers', value: '64 + terrace' }, { label: 'Wine list', value: '180 bottles' }],
      },
      animation: anim.mask,
    },
    {
      type: 'dining',
      variant: 'split',
      props: {
        tone: 'surface', eyebrow: 'Opening hours', heading: 'Join us for *dinner*', body: 'Walk-ins are always welcome at the bar. For tables of seven or more, see our private dining options.',
        image: img('diningWindow'), highlights: [{ label: 'Cuisine', value: 'Seasonal, produce-led' }, { label: 'Price', value: 'Mains $24 – $42' }], hours: HOURS,
        buttons: [btn('Book a table', '/reservations#enquire'), btn('Private dining', '/private-dining', 'link')], imageSide: 'left',
      },
    },
    testimonialsSection([
      { quote: 'The best meal we have had all year. Warm, unpretentious and every plate was a reason to come back.', author: 'Jess M.', role: 'Dinner for two', source: 'Google' },
      { quote: 'A wine list that is fun to explore and staff who genuinely love food. Our new favourite spot.', author: 'Arjun P.', role: 'Regular guest' },
      { quote: 'We booked the private room for a birthday and the team made it feel effortless and special.', author: 'Marta L.', role: 'Private dining', source: 'Tripadvisor' },
    ], { variant: 'grid', tone: 'default', eyebrow: 'Kind words', heading: 'What our *guests* say' }),
    {
      type: 'gallery',
      variant: 'grid',
      props: { images: galleryImages(['winePour', 'bar', 'brunchTable', 'cocktails']), columns: 4, aspect: '1:1', gap: 'sm', spacingTop: 'none' },
      animation: anim.stagger,
    },
    ctaSection({ eyebrow: 'Reservations', heading: 'Your table is *waiting*', subheading: 'Book online in a minute, or call us on {{business.phone | the number below}}.', buttons: [btn('Book a table', '/reservations#enquire')], image: 'diningTerrace' }),
  ];

  const menu: Section[] = [
    {
      type: 'hero',
      variant: 'split',
      props: { eyebrow: 'The menu', heading: 'Cooked from the *market*', subheading: 'Our menu changes weekly with the season. This is a sample — ask your server what is new tonight.', buttons: [btn('Book a table', '/reservations#enquire')], image: img('diningPlate'), imageSide: 'right', height: 'auto', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'menu',
      variant: 'classic',
      anchor: 'food',
      props: {
        eyebrow: 'Food', heading: 'Dinner *menu*', align: 'center',
        categories: [
          { name: 'Snacks', items: [{ name: 'House sourdough', description: 'Cultured butter', price: '7', tags: ['V'] }, { name: 'Gordal olives', description: 'Orange, fennel seed', price: '6', tags: ['VG', 'GF'] }, { name: 'Fried artichokes', description: 'Lemon aioli', price: '11', tags: ['V'] }] },
          { name: 'Small plates', items: [{ name: 'Market crudo', description: 'Citrus, chilli, fennel', price: '18', tags: ['GF'] }, { name: 'Burrata', description: 'Heritage tomatoes, basil oil', price: '16', tags: ['V', 'GF'] }, { name: 'Charred hispi cabbage', description: 'Miso butter, crispy shallots', price: '14', tags: ['V'] }] },
          { name: 'Large plates', items: [{ name: 'Coal-roasted lamb', description: 'Smoked aubergine, yoghurt', price: '38', tags: ['GF'] }, { name: 'Market fish', description: 'Brown shrimp, sea herbs, beurre blanc', price: '36', tags: ['GF'] }, { name: 'Wild mushroom risotto', description: 'Aged parmesan, thyme', price: '26', tags: ['V', 'GF'] }] },
          { name: 'Desserts', items: [{ name: 'Honey panna cotta', description: 'Roasted stone fruit', price: '11', tags: ['GF'] }, { name: 'Chocolate delice', description: 'Salted caramel, crème fraîche', price: '12', tags: ['V'] }] },
        ],
        columns: 2, note: 'V vegetarian · VG vegan · GF gluten free. A discretionary 12.5% service charge is added to all bills. Please tell us about any allergies.',
      },
      animation: anim.fadeUp,
    },
    {
      type: 'menu',
      variant: 'grid',
      anchor: 'drinks',
      props: {
        tone: 'surface', eyebrow: 'Drinks', heading: 'From the *bar*', align: 'center',
        categories: [
          { name: 'Cocktails', items: [{ name: 'Garden gimlet', description: 'Gin, cucumber, lime, basil', price: '14' }, { name: 'Smoked negroni', description: 'Mezcal, vermouth, bitter', price: '15' }] },
          { name: 'By the glass', items: [{ name: 'Skin-contact white', description: 'Rotating natural pour', price: '12' }, { name: 'Light red', description: 'Chilled, juicy, local', price: '11' }] },
        ],
        columns: 2,
      },
    },
    ctaSection({ heading: 'Hungry *yet*?', subheading: 'Tables are released 60 days in advance.', buttons: [btn('Book a table', '/reservations#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const privateDining: Section[] = [
    {
      type: 'hero',
      variant: 'editorial',
      props: { eyebrow: 'Private dining', heading: 'Gather around *our* table', subheading: 'Birthdays, rehearsal dinners, team celebrations — a private room and set menus for 8 to 24 guests, or the whole restaurant for up to 90.', buttons: [btn('Enquire about an event', '#event-enquiry')], image: img('longTable'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'venues',
      variant: 'cards',
      props: {
        eyebrow: 'Spaces', heading: 'Rooms for every *occasion*',
        items: [
          { name: 'The Cellar Room', image: img('dinnerParty', { width: 1600 }), size: '45 m²', description: 'A candlelit room beneath the restaurant, lined with our wine collection.', capacities: [{ layout: 'Seated', guests: '24' }, { layout: 'Standing', guests: '35' }], features: ['Private bar', 'AV screen'] },
          { name: 'The Chef’s Table', image: img('cookingClass', { width: 1600 }), size: 'Counter', description: 'Eight seats at the pass with a tasting menu cooked in front of you.', capacities: [{ layout: 'Seated', guests: '8' }], features: ['Tasting menu', 'Wine pairing'] },
          { name: 'Full buy-out', image: img('restaurantBright', { width: 1600 }), size: '180 m²', description: 'The whole restaurant and terrace, styled for your event.', capacities: [{ layout: 'Seated', guests: '64' }, { layout: 'Standing', guests: '90' }], features: ['Terrace', 'Custom menu'] },
        ],
        showTable: false, columns: 3,
      },
      animation: anim.stagger,
    },
    {
      type: 'pricing',
      variant: 'cards',
      props: {
        tone: 'surface', eyebrow: 'Set menus', heading: 'Simple, *shared* menus', align: 'center',
        plans: [
          { name: 'Feast', price: '$65', period: 'per guest', description: 'Snacks, four sharing plates and dessert.', features: ['Served family-style', 'Vegetarian option'], cta: btn('Enquire', '#event-enquiry', 'outline') },
          { name: 'Celebration', price: '$85', period: 'per guest', description: 'Our most popular menu with a welcome cocktail.', features: ['Welcome cocktail', 'Six sharing plates', 'Celebration cake'], highlighted: true, badge: 'Popular', cta: btn('Enquire', '#event-enquiry') },
          { name: 'Chef’s tasting', price: '$120', period: 'per guest', description: 'Seven courses with optional wine pairing.', features: ['Seven courses', 'Pairing from $60'], cta: btn('Enquire', '#event-enquiry', 'outline') },
        ],
        footnote: 'Minimum spends apply on Friday and Saturday evenings.',
      },
      animation: anim.stagger,
    },
    {
      type: 'form',
      variant: 'split-with-text',
      anchor: 'event-enquiry',
      props: { formId: 'form-events', eyebrow: 'Enquire', heading: 'Plan your *event*', subheading: 'Tell us the date, the number of guests and the occasion. Our events team will reply within one working day with availability and menus.', image: img('toastLights', { width: 1600 }), showContactDetails: true },
    },
  ];

  const gallery: Section[] = [
    {
      type: 'hero',
      variant: 'minimal',
      props: { eyebrow: 'Gallery', heading: 'Plates, people & *candlelight*', subheading: 'A look inside the kitchen, the dining room and the bar.', buttons: [btn('Book a table', '/reservations#enquire', 'outline')], height: 'auto', spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.hero,
    },
    {
      type: 'gallery',
      variant: 'masonry',
      props: { images: galleryImages([['diningMoody', 'The dining room'], ['diningPlate', 'Market crudo'], ['cocktails', 'Bar'], ['restaurantIndustrial', 'Evening service'], ['dessert', 'Panna cotta'], ['winePour', 'By the glass'], ['foodSpread', 'Sharing plates'], ['bar', 'The bar'], ['longTable', 'Private dining']]), columns: 3, gap: 'md', lightbox: true, showCaptions: true, spacingTop: 'none' },
      animation: anim.stagger,
    },
    ctaSection({ heading: 'Come hungry', buttons: [btn('Book a table', '/reservations#enquire')], variant: 'banner', tone: 'surface' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Restaurant & bar'), seoDescription: metaDescription(`${name} is a seasonal restaurant and wine bar in ${input.location ?? 'the neighbourhood'}.`, 'Sharing plates, natural wines and private dining.'), sections: home }),
    page({ title: 'Menu', slug: 'menu', seoTitle: metaTitle('Menu', name), seoDescription: metaDescription(`The seasonal dinner and drinks menu at ${name}: snacks, small plates, wood-fired mains, desserts and cocktails.`), sections: menu }),
    page({ title: 'Private dining', slug: 'private-dining', seoTitle: metaTitle('Private dining', name), seoDescription: metaDescription(`Private dining at ${name} for 8 to 90 guests — a cellar room, chef’s table and full buy-outs with set menus.`), sections: privateDining }),
    page({ title: 'Gallery', slug: 'gallery', seoTitle: metaTitle('Gallery', name), seoDescription: metaDescription(`Photographs of the food, dining room, bar and private events at ${name}.`), sections: gallery }),
    contactPage({
      name, title: 'Reservations', slug: 'reservations', formId: 'form-reservation', heroImage: 'restaurantBright', eyebrow: 'Reservations', heading: 'Book a *table*', intro: 'Reserve online below or call us. For parties of seven or more, see private dining.',
      formEyebrow: 'Reserve', formHeading: 'Request a *table*', formSubheading: 'We confirm every request by email within a few hours. Walk-ins are welcome at the bar.', formImage: 'diningWindow', detailsHeading: 'Find the *restaurant*',
      faq: [
        { question: 'Do you take walk-ins?', answer: 'Yes — the bar and terrace are kept for walk-ins every evening.' },
        { question: 'Can you cater for allergies?', answer: 'Absolutely. Tell us when you book and your server will guide you through the menu.' },
        { question: 'Is there a cancellation fee?', answer: 'For groups of six or more we ask for 24 hours’ notice, otherwise a fee of $20 per guest applies.' },
      ],
      seoDescription: metaDescription(`Book a table at ${name}. Reserve online, find our address and opening hours, or ask about private dining.`),
    }),
    privacyPage(name),
  ];

  const reservation = buildForm({
    id: 'form-reservation', name: 'Table reservation', slug: 'reservation', notify, subject: 'Table request: {{partySize}} guests on {{date}}',
    fields: [field.name(), field.email(), field.phone('half', true), field.date('date', 'Date', 'third', true), { id: 'f-time', type: 'time', name: 'time', label: 'Time', width: 'third', required: true }, field.number('partySize', 'Guests', { min: 1, max: 12, width: 'third', required: true }), { id: 'f-notes', type: 'textarea', name: 'notes', label: 'Allergies or occasion', width: 'full', required: false }, field.consent('I agree to be contacted about my reservation.')],
    submitLabel: 'Request table',
    successMessage: 'Thank you — we will confirm your table by email shortly.',
    autoreply: { subject: 'Your table request', html: '<p>Dear {{name}},</p><p>Thank you for your request at {{business.name}}. We will confirm your table by email shortly.</p>' },
  });
  const events = buildForm({
    id: 'form-events', name: 'Private dining enquiry', slug: 'private-dining', notify, subject: 'Private dining enquiry from {{name}}',
    fields: [field.name(), field.email(), field.phone(), field.date('eventDate', 'Date'), field.number('guestCount', 'Guests', { min: 6, max: 120, required: true }), field.select('space', 'Space', ['The Cellar Room', 'The Chef’s Table', 'Full buy-out', 'Not sure']), field.message('Tell us about the occasion'), field.consent()],
    submitLabel: 'Send enquiry',
  });

  return assemble(ctx, {
    type: 'Restaurant',
    description: `${name} is a seasonal restaurant and wine bar — produce-led sharing plates, natural wines and private dining.`,
    structuredData: ['Restaurant', 'LocalBusiness', 'WebSite'],
    theme: 'bistro-classic',
    ogImage: 'diningMoody',
    defaultLocation: 'the neighbourhood',
    contactPath: '/reservations',
    menus: {
      primary: [
        navItem('nav-menu', 'Menu', '/menu', [navItem('nav-menu-food', 'Food', '/menu#food'), navItem('nav-menu-drinks', 'Drinks', '/menu#drinks')]),
        navItem('nav-private', 'Private dining', '/private-dining'),
        navItem('nav-gallery', 'Gallery', '/gallery'),
        navItem('nav-reservations', 'Reservations', '/reservations'),
      ],
      'footer-explore': [
        navItem('nav-f-menu', 'Menu', '/menu'),
        navItem('nav-f-private', 'Private dining', '/private-dining'),
        navItem('nav-f-gallery', 'Gallery', '/gallery'),
        navItem('nav-f-book', 'Book a table', '/reservations#enquire'),
      ],
    },
    header: header({ variant: 'classic', cta: btn('Book a table', '/reservations#enquire'), showContact: true }),
    footer: footer({ variant: 'columns', columns: [{ title: 'Visit', menu: 'footer-explore' }, { title: 'Hours', links: [{ label: 'Tue – Thu · 17:30 – 22:30', link: '/reservations#visit' }, { label: 'Fri – Sat · 12:00 – 23:00', link: '/reservations#visit' }, { label: 'Sun · 12:00 – 21:00', link: '/reservations#visit' }] }], newsletterHeading: 'Menus & events, monthly' }),
    pages,
    forms: [reservation, events],
  });
}

export const restaurant: Blueprint = {
  key: 'restaurant',
  name: 'Restaurant & bar',
  description: 'Warm restaurant site with a sample menu, private dining packages, gallery and a table reservation form.',
  category: 'food',
  tags: ['restaurant', 'bar', 'menu', 'reservations', 'private dining'],
  thumbnail: photoUrl('diningMoody', 1200),
  build,
};
