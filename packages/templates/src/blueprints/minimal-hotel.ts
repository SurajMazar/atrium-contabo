import { photoUrl } from '../images';
import type { Blueprint, BlueprintInput } from '../types';
import { ROOM_BINDING_MAP, roomDetailPage, roomsCollection, type RoomSeed } from './rooms';
import {
  anim, assemble, bookingBar, bookingRef, btn, buildForm, contactPage, contextOf, ctaSection, faqSection, field, footer, galleryImages, header, heroCopy,
  homeTitle, img, metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type Section,
} from './shared';

const ROOMS: RoomSeed[] = [
  { slug: 'small-double', name: 'Small Double', summary: 'Compact, clever and calm — everything you need for a city night.', price: '$160', size: '16 m²', guests: '2 guests', bed: 'Double bed', view: 'Courtyard', description: 'Our smallest rooms make every centimetre count: a hand-made bed, blackout curtains, a rain shower and a desk that doubles as a vanity.\n\nPerfect for solo travellers and short stays.', image: 'roomWhite', gallery: ['roomWhite', 'bathWhite', 'coffee'] },
  { slug: 'classic-king', name: 'Classic King', summary: 'A generous king room with tall windows onto the street.', price: '$210', size: '24 m²', guests: '2 guests', bed: 'King bed', view: 'Street', description: 'Tall sash windows, oak floors and a king-size bed dressed in linen. A reading chair by the window and a well-stocked minibar of local makers.\n\nOur most popular room.', image: 'roomTufted', gallery: ['roomTufted', 'bathStone', 'breakfastToast'] },
  { slug: 'corner-studio', name: 'Corner Studio', summary: 'Dual-aspect light, a sofa and space to spread out.', price: '$270', size: '32 m²', guests: '3 guests', bed: 'King bed + sofa bed', view: 'Corner, two aspects', description: 'Windows on two sides, a lounge corner with a sofa bed and a larger bathroom with a walk-in shower.\n\nIdeal for longer stays or a little more room to breathe.', image: 'roomVelvet', gallery: ['roomVelvet', 'livingLight', 'bathPalm'] },
  { slug: 'rooftop-suite', name: 'Rooftop Suite', summary: 'Our top-floor suite with a private terrace above the rooftops.', price: '$390', size: '45 m²', guests: '2 guests', bed: 'King bed', view: 'Rooftops & skyline', description: 'A separate bedroom and living room, a freestanding bath and a private terrace with city views.\n\nIncludes breakfast in the suite and a late check-out.', image: 'roomLuxeGrey', gallery: ['roomLuxeGrey', 'skylineSunset', 'bathStone'] },
];

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'A small hotel with *big* windows', 'Twenty-two rooms in the heart of the neighbourhood — good beds, great coffee and a team who know the best places nearby.');

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'editorial',
      props: {
        eyebrow: '{{business.name}} · {{vars.location}}', heading: hero.heading, subheading: hero.subheading,
        buttons: [btn('See the rooms', '/rooms'), btn('Book direct', '/contact#enquire', 'link')],
        image: img('roomTufted'), imageSide: 'right', height: 'tall',
        meta: [{ label: 'Rooms', value: '22' }, { label: 'Café', value: 'From 7am' }, { label: 'Check-in', value: '24 hours' }],
        spacingTop: 'xl', spacingBottom: 'lg',
      },
      animation: anim.hero,
    },
    bookingRef,
    { type: 'text-section', variant: 'statement', props: { heading: 'No lobby, no fuss — just *beautiful* rooms, a café downstairs and the city on your doorstep.', body: 'We kept what matters and left out the rest. Check in on your phone, drop your bags and head out: the best of {{vars.location}} is a short walk away.', align: 'center', containerWidth: 'narrow', spacingTop: 'xl', spacingBottom: 'lg' }, animation: anim.text },
    {
      type: 'rooms',
      variant: 'carousel',
      binding: { collection: 'rooms', map: ROOM_BINDING_MAP },
      props: { tone: 'surface', eyebrow: 'Rooms', heading: 'Four ways to *stay*', items: [], imageAspect: '4:5', ctaLabel: 'View room', collection: 'rooms', buttons: [btn('All rooms', '/rooms', 'outline')] },
      animation: anim.stagger,
    },
    {
      type: 'content-split',
      variant: 'standard',
      props: { eyebrow: 'The café', heading: 'Coffee, *pastries* and a long table', body: 'Our ground-floor café opens at 7am for guests and neighbours alike. Breakfast is served until noon — because nobody should rush the best meal of the day.', buttons: [], image: img('cafe'), imageSide: 'left', imageAspect: '4:5', facts: [{ label: 'Open', value: '7:00 – 18:00' }, { label: 'Breakfast', value: 'Until noon' }] },
      animation: anim.mask,
    },
    {
      type: 'amenities',
      variant: 'icon-grid',
      props: { eyebrow: 'The essentials', heading: 'Small hotel, *thoughtful* details', items: [{ icon: 'smartphone', title: 'Mobile check-in' }, { icon: 'wifi', title: 'Fast Wi-Fi' }, { icon: 'coffee', title: 'Café downstairs' }, { icon: 'bike', title: 'Bikes to borrow' }, { icon: 'dog', title: 'Dogs welcome' }, { icon: 'clock', title: 'Late check-out' }], columns: 6 },
      animation: anim.stagger,
    },
    testimonialsSection([
      { quote: 'Tiny bit of perfection. The bed was heavenly and the café breakfast was the best I had all trip.', author: 'Lucy H.', role: 'Classic King', source: 'Google' },
      { quote: 'Exactly what a city hotel should be: simple, beautiful and in the best location.', author: 'Marco B.', role: 'Corner Studio', source: 'Booking.com' },
    ], { variant: 'carousel', tone: 'surface' }),
    ctaSection({ heading: 'Book *direct*, save 10%', subheading: 'Our best rate, a welcome coffee and flexible cancellation when you book with us.', buttons: [btn('Check availability', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const rooms: Section[] = [
    { type: 'hero', variant: 'minimal', props: { eyebrow: 'Rooms', heading: 'Simple rooms, *done* properly', subheading: 'Hand-made beds, blackout curtains, rain showers and nothing you do not need.', buttons: [btn('Book direct', '/contact#enquire')], height: 'auto', spacingTop: 'xl', spacingBottom: 'md' }, animation: anim.hero },
    {
      type: 'rooms',
      variant: 'cards',
      binding: { collection: 'rooms', map: ROOM_BINDING_MAP },
      props: { items: [], columns: 2, imageAspect: '4:3', ctaLabel: 'View room', collection: 'rooms', spacingTop: 'md' },
      animation: anim.stagger,
    },
    { type: 'benefits', variant: 'list', props: { tone: 'surface', eyebrow: 'In every room', heading: 'The *details*', items: [{ title: 'Hand-made mattress & linen' }, { title: 'Blackout curtains' }, { title: 'Rain shower & local toiletries' }, { title: 'Smart TV & fast Wi-Fi' }, { title: 'Coffee & tea' }, { title: 'Desk & reading light' }], columns: 3, image: undefined } },
    faqSection([
      { question: 'What time is check-in?', answer: 'From 3pm, using the mobile key sent before arrival. Our team is on hand 24 hours a day.' },
      { question: 'Is breakfast included?', answer: 'Breakfast in the café is included on direct bookings and available to add on other rates.' },
      { question: 'Do you have parking?', answer: 'There is no on-site parking, but a public garage is two minutes’ walk away.' },
    ]),
  ];

  const neighbourhood: Section[] = [
    { type: 'hero', variant: 'fullscreen-image', props: { tone: 'inverse', eyebrow: 'Neighbourhood', heading: 'Your *local* guide', subheading: 'Galleries, bakeries, record shops and the best late-night bar — all within a short walk.', buttons: [btn('Plan your stay', '/contact#enquire')], image: img('skyline'), height: 'tall', overlayOpacity: 0.4, spacingTop: 'none', spacingBottom: 'none' }, animation: anim.cinematic },
    {
      type: 'attractions',
      variant: 'cards',
      props: {
        eyebrow: 'Nearby', heading: 'Within a short *walk*',
        items: [
          { name: 'The covered market', distance: '5 min walk', category: 'Food', text: 'Fresh produce, street food and the city’s best bakery.', image: img('foodSpread', { width: 1400 }) },
          { name: 'Riverside galleries', distance: '10 min walk', category: 'Culture', text: 'Contemporary art in converted warehouses.', image: img('glassArchitecture', { width: 1400 }) },
          { name: 'The old harbour', distance: '15 min walk', category: 'Views', text: 'Sunset walks along the water and boats to the islands.', image: img('skylineSunset', { width: 1400 }) },
          { name: 'Corner wine bar', distance: '2 min walk', category: 'Evenings', text: 'Natural wines and small plates until late.', image: img('winePour', { width: 1400 }) },
        ],
        columns: 4,
      },
      animation: anim.stagger,
    },
    {
      type: 'events',
      variant: 'list',
      props: {
        tone: 'surface', eyebrow: 'What’s on', heading: 'Coming up *nearby*',
        items: [
          { title: 'Winter Night Market', date: '2026-12-05', endDate: '2026-12-20', time: '17:00 – 22:00', location: 'The covered market', category: 'Food', summary: 'Mulled wine, street food and makers’ stalls.' },
          { title: 'Open Studios Weekend', date: '2027-03-13', endDate: '2027-03-14', location: 'Riverside galleries', category: 'Art', summary: 'Artists open their studios to the public.' },
          { title: 'Harbour Jazz Festival', date: '2027-06-18', endDate: '2027-06-20', location: 'The old harbour', category: 'Music', summary: 'Three days of free outdoor concerts.' },
        ],
      },
      animation: anim.stagger,
    },
    { type: 'gallery', variant: 'grid', props: { images: galleryImages(['coffee', 'cafe', 'bar', 'restaurantBright']), columns: 4, aspect: '1:1', gap: 'sm' }, animation: anim.stagger },
    ctaSection({ heading: 'Stay in the *middle* of it all', buttons: [btn('Book direct', '/contact#enquire')], image: 'skylineSunset' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Boutique city hotel'), seoDescription: metaDescription(`${name} is a small boutique hotel in ${input.location ?? 'the heart of the city'} with 22 rooms, a café and the neighbourhood on the doorstep.`), sections: home }),
    page({ title: 'Rooms', slug: 'rooms', seoTitle: metaTitle('Rooms', name), seoDescription: metaDescription(`Small doubles, classic kings, corner studios and a rooftop suite at ${name}.`, 'Book direct for our best rate and breakfast.'), sections: rooms }),
    roomDetailPage({ bookLink: '/contact#enquire', inclusions: [{ title: 'Café breakfast', icon: 'coffee' }, { title: 'Mobile check-in', icon: 'smartphone' }, { title: 'Fast Wi-Fi', icon: 'wifi' }, { title: 'Bikes to borrow', icon: 'bike' }] }),
    page({ title: 'Neighbourhood', slug: 'neighbourhood', seoTitle: metaTitle('Neighbourhood guide', name), seoDescription: metaDescription(`A local guide to the markets, galleries, bars and events within walking distance of ${name}.`), sections: neighbourhood }),
    contactPage({
      name, formId: 'form-enquiry', heroImage: 'roomClassic', heading: 'Book *direct*', intro: 'Save 10% and get a welcome coffee when you book with us. Questions? We reply within a few hours.',
      formHeading: 'Request a *room*', formSubheading: 'Tell us your dates and room preference and we will confirm availability and our best rate.',
      faq: [
        { question: 'How do I check in?', answer: 'We send a mobile key the day before arrival. Our team is here 24 hours if you need anything.' },
        { question: 'Can I leave my luggage?', answer: 'Of course — before check-in or after check-out, free of charge.' },
      ],
      seoDescription: metaDescription(`Book direct with ${name} for our best rate and a welcome coffee, or contact the team with any question about your stay.`),
    }),
    privacyPage(name),
  ];

  const enquiry = buildForm({
    id: 'form-enquiry', name: 'Room request', slug: 'room-request', notify, subject: 'Room request from {{name}}',
    fields: [field.name(), field.email(), field.date('arrival', 'Arrival', 'third', true), field.date('departure', 'Departure', 'third', true), field.number('guests', 'Guests', { min: 1, max: 4, width: 'third' }), field.select('room', 'Room', ['Small Double', 'Classic King', 'Corner Studio', 'Rooftop Suite', 'No preference']), field.message('Anything else?', 'Arrival time, special occasions…'), field.consent()],
    submitLabel: 'Request room',
    autoreply: { subject: 'Your room request', html: '<p>Dear {{name}},</p><p>Thank you for your request at {{business.name}}. We will confirm availability shortly.</p>' },
  });

  return assemble(ctx, {
    type: 'Hotel',
    description: `${name} is a small boutique hotel with 22 rooms, a ground-floor café and the best of the neighbourhood on its doorstep.`,
    structuredData: ['Hotel', 'WebSite'],
    theme: 'editorial-warm',
    ogImage: 'roomTufted',
    defaultLocation: 'the old town',
    menus: {
      primary: [navItem('nav-rooms', 'Rooms', '/rooms'), navItem('nav-neighbourhood', 'Neighbourhood', '/neighbourhood'), navItem('nav-contact', 'Contact', '/contact')],
      'footer-explore': [navItem('nav-f-rooms', 'Rooms', '/rooms'), navItem('nav-f-neighbourhood', 'Neighbourhood', '/neighbourhood'), navItem('nav-f-book', 'Book direct', '/contact#enquire'), navItem('nav-f-find', 'Find us', '/contact#visit')],
    },
    header: header({ variant: 'minimal', cta: btn('Book', '/contact#enquire'), transparentOnHero: false }),
    footer: footer({ variant: 'centered', columns: [{ title: 'Hotel', menu: 'footer-explore' }], newsletterHeading: 'Neighbourhood news' }),
    pages,
    forms: [enquiry],
    collections: [roomsCollection(ROOMS)],
    globalSections: [bookingBar('Book direct', 'Save 10% and enjoy a welcome coffee.')],
  });
}

export const minimalHotel: Blueprint = {
  key: 'minimal-hotel',
  name: 'Boutique city hotel',
  description: 'Pared-back hotel site with a rooms collection and detail pages, a neighbourhood guide with events and a direct booking request form.',
  category: 'hospitality',
  tags: ['hotel', 'boutique', 'city', 'rooms', 'minimal'],
  thumbnail: photoUrl('roomTufted', 1200),
  build,
};
