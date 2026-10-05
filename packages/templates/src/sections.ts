/**
 * Section template library: ready-made, section-level nodes the builder can drop
 * into any page. Copy is tasteful placeholder text owners are expected to edit;
 * links only point at '/contact', '/' or anchors so they work in any site.
 */
import type { NodeInput } from '@atrium/schema';
import { img, type ImageKey } from './images';
import type { SectionTemplate } from './types';

const b = (label: string, link: string, style: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' = 'primary') => ({ label, link, style, iconPosition: 'end' as const });
const pic = (key: ImageKey, width = 1600) => img(key, { width });

function t(key: string, name: string, description: string, category: SectionTemplate['category'], tags: string[], node: NodeInput): SectionTemplate {
  return { key, name, description, category, tags, node };
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  // ---------------------------------------------------------------- hero
  t('hero-cinematic-resort', 'Cinematic resort hero', 'Letterboxed full-bleed photograph with oversized type, quick facts and a scroll cue.', 'hero', ['resort', 'hotel', 'hospitality', 'fullscreen'], {
    type: 'hero',
    variant: 'cinematic',
    props: {
      tone: 'inverse', eyebrow: '{{business.name}}', heading: 'Where slow days *begin*', subheading: 'Gardens, water and unhurried service — a retreat designed for rest, good food and the occasional adventure.',
      buttons: [b('Plan your stay', '/contact'), b('Discover more', '#intro', 'outline')], image: img('poolTropical'), overlayOpacity: 0.35, height: 'screen', contentPosition: 'bottom-left', showScrollCue: true,
      meta: [{ label: 'Rooms', value: '32' }, { label: 'Spa', value: 'Open daily' }, { label: 'Dining', value: 'Two restaurants' }], spacingTop: 'none', spacingBottom: 'none',
    },
    animation: { preset: 'cinematic-reveal' },
  }),
  t('hero-editorial', 'Editorial hero', 'Large serif headline beside offset photography — refined and magazine-like.', 'hero', ['editorial', 'boutique', 'luxury'], {
    type: 'hero',
    variant: 'editorial',
    props: {
      eyebrow: 'Welcome', heading: 'A quiet place, *beautifully* considered', subheading: 'Introduce the essence of your business in a sentence or two — what it feels like, and who it is for.',
      buttons: [b('Get in touch', '/contact'), b('Read more', '#intro', 'link')], image: img('roomGardenSuite'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg',
    },
    animation: { preset: 'editorial-reveal' },
  }),
  t('hero-split-corporate', 'Split corporate hero', 'Headline, proof points and two actions beside a crisp photograph.', 'hero', ['corporate', 'saas', 'business', 'split'], {
    type: 'hero',
    variant: 'split',
    props: {
      eyebrow: '{{business.name}}', heading: 'Clear thinking for *ambitious* teams', subheading: 'We help organisations set direction, make better decisions and deliver change that lasts.',
      buttons: [b('Talk to us', '/contact'), b('How we work', '#intro', 'outline')], image: img('officeOpen'), imageSide: 'right', height: 'tall',
      meta: [{ label: 'Clients', value: '250+' }, { label: 'Sectors', value: '12' }, { label: 'Founded', value: '2008' }], spacingTop: 'xl', spacingBottom: 'lg',
    },
    animation: { preset: 'editorial-reveal' },
  }),
  t('hero-minimal-portfolio', 'Minimal portfolio hero', 'Typography-only opening with generous whitespace and a word-by-word reveal.', 'hero', ['portfolio', 'minimal', 'personal', 'agency'], {
    type: 'hero',
    variant: 'minimal',
    props: {
      eyebrow: '{{business.name}}', heading: 'Design with *quiet* confidence', subheading: 'Independent designer working across identity, editorial and digital products for people who care about the details.',
      buttons: [b('Get in touch', '/contact'), b('Read more', '#intro', 'link')], height: 'tall', contentPosition: 'left', spacingTop: 'xl', spacingBottom: 'md',
    },
    animation: { preset: 'word-reveal' },
  }),
  t('hero-carousel-wedding', 'Wedding carousel hero', 'Crossfading slideshow of romantic imagery behind a centred headline.', 'hero', ['wedding', 'venue', 'events', 'carousel'], {
    type: 'hero',
    variant: 'carousel',
    props: {
      tone: 'inverse', eyebrow: 'Weddings & celebrations', heading: 'Your day, *beautifully* held', subheading: 'Gardens, a glass orangery and a team that looks after one wedding at a time.',
      buttons: [b('Book a viewing', '/contact'), b('Explore the venue', '#spaces', 'outline')], images: [img('weddingAisle'), img('weddingTable'), img('weddingCouple'), img('toastLights')],
      overlayOpacity: 0.35, height: 'screen', contentPosition: 'bottom-center', showScrollCue: true, spacingTop: 'none', spacingBottom: 'none',
    },
    animation: { preset: 'cinematic-reveal' },
  }),

  // ---------------------------------------------------------------- intro
  t('intro-statement', 'Statement intro', 'Oversized centred statement with a short supporting paragraph.', 'intro', ['statement', 'welcome', 'manifesto'], {
    type: 'text-section',
    variant: 'statement',
    anchor: 'intro',
    props: {
      eyebrow: 'Welcome', heading: 'A place where days are measured by *light* — morning swims, long lunches and evenings beneath the stars.',
      body: 'Use this space for the one idea you want every visitor to remember. Keep it short, warm and specific to you.', align: 'center', containerWidth: 'narrow', spacingTop: 'xl', spacingBottom: 'lg',
    },
    animation: { preset: 'text-reveal' },
  }),
  t('intro-two-column', 'Two-column intro', 'Heading on the left, two paragraphs of story on the right.', 'intro', ['about', 'story', 'philosophy'], {
    type: 'text-section',
    variant: 'two-column',
    props: {
      eyebrow: 'Our philosophy', heading: 'Small details, *done* properly',
      body: 'We believe the best experiences come from care in the details: the right light at the right time, a name remembered, a recommendation that turns into a favourite memory.\n\nEverything we do is shaped by the people who work here and the place we call home.',
      buttons: [b('Get in touch', '/contact', 'link')], align: 'left',
    },
    animation: { preset: 'fade-up' },
  }),

  // ---------------------------------------------------------------- features
  t('features-grid-icons', 'Icon feature grid', 'Six features with line icons in circles — services, amenities or product capabilities.', 'features', ['services', 'icons', 'grid', 'saas'], {
    type: 'features',
    variant: 'grid',
    props: {
      eyebrow: 'What we offer', heading: 'Everything in *one* place', subheading: 'A short line that frames the list below.',
      items: [
        { icon: 'sparkles', title: 'Thoughtful service', text: 'A team who anticipates what you need before you ask.' },
        { icon: 'leaf', title: 'Locally rooted', text: 'Suppliers, makers and growers from just down the road.' },
        { icon: 'shield-check', title: 'Peace of mind', text: 'Clear policies and flexible terms, always.' },
        { icon: 'clock', title: 'Always available', text: 'Reach us any time — we reply within hours.' },
        { icon: 'heart', title: 'Made with care', text: 'Every detail considered, nothing left to chance.' },
        { icon: 'award', title: 'Award-winning', text: 'Recognised by guests and industry alike.' },
      ],
      columns: 3, iconStyle: 'circle',
    },
    animation: { preset: 'stagger' },
  }),
  t('features-alternating', 'Alternating features', 'Three rich rows alternating image and text — ideal for services or product tours.', 'features', ['services', 'alternating', 'images'], {
    type: 'features',
    variant: 'alternating',
    props: {
      eyebrow: 'Services', heading: 'How we *help*',
      items: [
        { image: pic('workshop'), eyebrow: '01', title: 'Discover', text: 'Workshops and research to understand the real problem — and what success looks like for you.' },
        { image: pic('teamTable'), eyebrow: '02', title: 'Design', text: 'Ideas, options and trade-offs, shaped together into a clear recommendation.' },
        { image: pic('teamPresentation'), eyebrow: '03', title: 'Deliver', text: 'Hands-on support from kick-off to launch, with your team leading the way.' },
      ],
      imageAspect: '4:3',
    },
    animation: { preset: 'fade-up' },
  }),
  t('features-cards', 'Feature cards', 'Three image cards with eyebrow, title and short description.', 'features', ['cards', 'highlights', 'images'], {
    type: 'features',
    variant: 'cards',
    props: {
      tone: 'surface', eyebrow: 'Highlights', heading: 'Reasons to *visit*',
      items: [
        { image: pic('spaStones', 1400), eyebrow: 'Wellness', title: 'The spa', text: 'Warm stones, botanical oils and thermal pools.' },
        { image: pic('diningTerrace', 1400), eyebrow: 'Dining', title: 'The terrace', text: 'Seasonal plates served beside the water.' },
        { image: pic('forestPath', 1400), eyebrow: 'Nature', title: 'Forest trails', text: 'Guided walks from the garden gate.' },
      ],
      columns: 3, imageAspect: '4:5',
    },
    animation: { preset: 'stagger' },
  }),
  t('amenities-icon-grid', 'Amenities icon grid', 'Eight hotel amenities with icons and one-line descriptions.', 'features', ['hotel', 'amenities', 'hospitality', 'icons'], {
    type: 'amenities',
    variant: 'icon-grid',
    props: {
      eyebrow: 'Amenities', heading: 'Everything you need, *nothing* you don’t',
      items: [
        { icon: 'wifi', title: 'Fast Wi-Fi', text: 'Throughout the property.' },
        { icon: 'coffee', title: 'Breakfast', text: 'Served until 11am.' },
        { icon: 'waves', title: 'Pool', text: 'Heated, open year-round.' },
        { icon: 'dumbbell', title: 'Fitness', text: 'Open 24 hours.' },
        { icon: 'car', title: 'Transfers', text: 'Airport pick-up on request.' },
        { icon: 'concierge-bell', title: 'Concierge', text: 'Tours, tables and tickets.' },
        { icon: 'dog', title: 'Pet friendly', text: 'Dogs welcome in garden rooms.' },
        { icon: 'circle-parking', title: 'Parking', text: 'Free on-site parking.' },
      ],
      columns: 4,
    },
    animation: { preset: 'stagger' },
  }),
  t('experiences-cards', 'Experience cards', 'Tall image cards for tours, classes and activities with duration and price.', 'features', ['hospitality', 'experiences', 'activities', 'tours'], {
    type: 'experiences',
    variant: 'cards',
    props: {
      eyebrow: 'Experiences', heading: 'Days worth *remembering*',
      items: [
        { title: 'Sunrise paddle', tag: 'On the water', image: pic('lakeBoat'), duration: '2 hours', price: '$45', text: 'Still water, first light and coffee on the jetty.' },
        { title: 'Garden cooking class', tag: 'Culinary', image: pic('cookingClass'), duration: '3 hours', price: '$85', text: 'Pick, cook and share a long lunch with our chefs.' },
        { title: 'Waterfall walk', tag: 'Nature', image: pic('waterfall'), duration: 'Half day', price: '$70', text: 'Old trails and a swim beneath the falls.' },
      ],
      columns: 3, imageAspect: '3:4', buttons: [b('Plan your days', '/contact', 'outline')],
    },
    animation: { preset: 'stagger' },
  }),
  t('attractions-list', 'Nearby attractions', 'Two-column list of places nearby with distance and category.', 'features', ['hospitality', 'local', 'area guide'], {
    type: 'attractions',
    variant: 'list',
    props: {
      eyebrow: 'The area', heading: 'Explore *nearby*',
      items: [
        { name: 'Old town & market', distance: '10 min walk', category: 'Culture', text: 'Cafés, craft stores and a lively Saturday market.' },
        { name: 'Hilltop viewpoint', distance: '25 min drive', category: 'Nature', text: 'The best sunrise in the region.' },
        { name: 'Riverside galleries', distance: '15 min walk', category: 'Art', text: 'Contemporary art in converted warehouses.' },
        { name: 'Vineyards', distance: '40 min drive', category: 'Food & wine', text: 'Tastings and long lunches with local producers.' },
      ],
      columns: 2,
    },
    animation: { preset: 'stagger' },
  }),

  // ---------------------------------------------------------------- rooms
  t('rooms-cards-bound', 'Room cards (from collection)', 'Room cards bound to the "rooms" collection — new rooms appear automatically. Includes a static fallback.', 'rooms', ['hotel', 'rooms', 'collection', 'binding'], {
    type: 'rooms',
    variant: 'cards',
    binding: { collection: 'rooms', limit: 3, map: { name: '{{item.name}}', image: '{{item.image}}', price: '{{item.price}}', priceSuffix: '/ night', size: '{{item.size}}', guests: '{{item.guests}}', bed: '{{item.bed}}', view: '{{item.view}}', summary: '{{item.summary}}', slug: '{{item.slug}}' } },
    props: {
      eyebrow: 'Stay', heading: 'Rooms & *suites*', subheading: 'Each room opens to the garden or the water.',
      items: [
        { name: 'Garden Room', image: pic('roomGardenSuite'), price: '$240', priceSuffix: '/ night', size: '38 m²', guests: '2 guests', bed: 'King bed', features: [] },
        { name: 'Terrace Suite', image: pic('roomGlassSuite'), price: '$420', priceSuffix: '/ night', size: '62 m²', guests: '3 guests', bed: 'King bed', features: [] },
        { name: 'Pool Villa', image: pic('poolInfinity'), price: '$690', priceSuffix: '/ night', size: '120 m²', guests: '4 guests', bed: 'King + twin', features: [] },
      ],
      columns: 3, imageAspect: '4:5', ctaLabel: 'View room', collection: 'rooms', buttons: [b('Check availability', '/contact', 'outline')],
    },
    animation: { preset: 'stagger' },
  }),
  t('rooms-editorial-list', 'Rooms editorial list', 'Large alternating room rows with facts, features and price — a luxury feel.', 'rooms', ['hotel', 'rooms', 'luxury', 'editorial'], {
    type: 'rooms',
    variant: 'editorial-list',
    props: {
      eyebrow: 'Rooms', heading: 'Rooms made for *resting*',
      items: [
        { name: 'Classic King', image: pic('roomTufted', 1800), price: '$210', priceSuffix: '/ night', size: '24 m²', guests: '2 guests', bed: 'King bed', view: 'Street', summary: 'Tall windows, oak floors and a king bed dressed in linen.', features: ['Rain shower', 'Reading chair', 'Minibar of local makers'], href: '/contact' },
        { name: 'Corner Studio', image: pic('roomVelvet', 1800), price: '$270', priceSuffix: '/ night', size: '32 m²', guests: '3 guests', bed: 'King + sofa bed', view: 'Two aspects', summary: 'Dual-aspect light, a lounge corner and space to spread out.', features: ['Walk-in shower', 'Sofa bed', 'Work desk'], href: '/contact' },
        { name: 'Rooftop Suite', image: pic('roomLuxeGrey', 1800), price: '$390', priceSuffix: '/ night', size: '45 m²', guests: '2 guests', bed: 'King bed', view: 'Skyline', summary: 'A separate living room and a private terrace above the rooftops.', features: ['Private terrace', 'Freestanding bath', 'Breakfast in suite'], href: '/contact' },
      ],
      imageAspect: '4:5', showPrice: true, showFacts: true, ctaLabel: 'Enquire',
    },
    animation: { preset: 'clip-reveal' },
  }),

  // ---------------------------------------------------------------- dining
  t('dining-split', 'Restaurant split', 'Restaurant introduction with photo, highlights, opening hours and reservation actions.', 'dining', ['restaurant', 'dining', 'hours', 'hospitality'], {
    type: 'dining',
    variant: 'split',
    props: {
      eyebrow: 'Dining', heading: 'Seasonal, wood-fired, *unhurried*', body: 'Our kitchen follows the seasons — line-caught fish, garden herbs and slow-roasted meats, with a cellar of natural and old-world wines.\n\nOpen to residents and visitors alike.',
      image: img('diningTerrace'), highlights: [{ label: 'Cuisine', value: 'Modern, seasonal' }, { label: 'Dress code', value: 'Relaxed' }],
      hours: [{ label: 'Breakfast', value: '7:00 – 11:00' }, { label: 'Lunch', value: '12:30 – 15:00' }, { label: 'Dinner', value: '18:30 – 22:30' }],
      buttons: [b('Reserve a table', '/contact'), b('See the menu', '#menu', 'link')], imageSide: 'left',
    },
    animation: { preset: 'image-mask' },
  }),
  t('menu-tabs', 'Tabbed menu', 'Food menu with categories behind tabs, prices and dietary tags.', 'dining', ['restaurant', 'menu', 'food', 'cafe'], {
    type: 'menu',
    variant: 'tabs',
    anchor: 'menu',
    props: {
      tone: 'surface', eyebrow: 'The menu', heading: 'From the *kitchen*', align: 'center',
      categories: [
        { name: 'To begin', items: [{ name: 'House sourdough', description: 'Cultured butter', price: '7', tags: ['V'] }, { name: 'Market crudo', description: 'Citrus, chilli, fennel', price: '18', tags: ['GF'] }, { name: 'Burrata', description: 'Heritage tomatoes, basil oil', price: '16', tags: ['V', 'GF'] }] },
        { name: 'Mains', items: [{ name: 'Coal-roasted lamb', description: 'Smoked aubergine, yoghurt', price: '38', tags: ['GF'] }, { name: 'Market fish', description: 'Sea herbs, beurre blanc', price: '36', tags: ['GF'] }, { name: 'Wild mushroom risotto', description: 'Aged parmesan, thyme', price: '26', tags: ['V', 'GF'] }] },
        { name: 'Desserts', items: [{ name: 'Honey panna cotta', description: 'Roasted stone fruit', price: '11', tags: ['GF'] }, { name: 'Chocolate delice', description: 'Salted caramel', price: '12', tags: ['V'] }] },
      ],
      note: 'V vegetarian · GF gluten free. Please tell us about any allergies.',
    },
    animation: { preset: 'fade-up' },
  }),

  // ---------------------------------------------------------------- gallery
  t('gallery-editorial', 'Editorial gallery', 'Magazine rhythm of large and small photographs with a lightbox.', 'gallery', ['gallery', 'photos', 'editorial'], {
    type: 'gallery',
    variant: 'editorial',
    props: {
      eyebrow: 'Gallery', heading: 'A closer *look*',
      images: [pic('lakeBoathouse'), pic('roomGardenSuite'), pic('spaStones'), pic('diningTerrace'), pic('himalayaRange'), pic('spaTowels')],
      columns: 3, lightbox: true,
    },
    animation: { preset: 'stagger' },
  }),
  t('gallery-masonry', 'Masonry gallery', 'Natural aspect ratios in staggered columns with captions.', 'gallery', ['gallery', 'masonry', 'photos', 'portfolio'], {
    type: 'gallery',
    variant: 'masonry',
    props: {
      eyebrow: 'Moments', heading: 'Seen *here*',
      images: [
        { ...pic('weddingAisle'), caption: 'Garden ceremony' }, { ...pic('weddingRings'), caption: 'Details' }, { ...pic('weddingTable'), caption: 'Dinner' },
        { ...pic('weddingBouquet'), caption: 'Florals' }, { ...pic('toastLights'), caption: 'Toasts' }, { ...pic('weddingField'), caption: 'Golden hour' },
        { ...pic('dessertTable'), caption: 'Dessert table' }, { ...pic('weddingWalk'), caption: 'Portraits' },
      ],
      columns: 3, gap: 'md', lightbox: true, showCaptions: true,
    },
    animation: { preset: 'stagger' },
  }),

  // ---------------------------------------------------------------- testimonials
  t('testimonials-carousel', 'Testimonial carousel', 'Centred quotes that rotate, with ratings and sources.', 'testimonials', ['reviews', 'social proof', 'carousel'], {
    type: 'testimonials',
    variant: 'carousel',
    props: {
      tone: 'surface', eyebrow: 'Kind words', heading: 'What people *say*', align: 'center',
      items: [
        { quote: 'Every detail felt quietly anticipated. We started planning our return before we had even left.', author: 'Clara & Tomás', role: 'Guests', rating: 5, source: 'Google' },
        { quote: 'Warm, thoughtful and genuinely kind people. The experience exceeded every expectation.', author: 'Priya R.', role: 'Returning client', rating: 5 },
        { quote: 'Professional from first message to last — we would recommend them to anyone.', author: 'James O.', role: 'Client', rating: 5, source: 'Tripadvisor' },
      ],
      showRating: true,
    },
    animation: { preset: 'fade-up' },
  }),
  t('testimonials-grid', 'Testimonial grid', 'Three customer quotes with portraits in a grid — strong for SaaS and services.', 'testimonials', ['reviews', 'saas', 'grid', 'customers'], {
    type: 'testimonials',
    variant: 'grid',
    props: {
      eyebrow: 'Customers', heading: 'Loved by *teams* everywhere',
      items: [
        { quote: 'We replaced four tools with one and our weekly status meeting disappeared.', author: 'Maya Chen', role: 'Head of Operations', avatar: pic('portraitW3', 400), rating: 5 },
        { quote: 'Setup took an afternoon. Within a month every team was using it.', author: 'Daniel Brooks', role: 'COO', avatar: pic('portraitM1', 400), rating: 5 },
        { quote: 'The most intuitive product we have rolled out in years.', author: 'Sara Ali', role: 'Support Lead', avatar: pic('portraitW7', 400), rating: 5 },
      ],
      columns: 3, showRating: false,
    },
    animation: { preset: 'stagger' },
  }),

  // ---------------------------------------------------------------- cta
  t('cta-centered', 'Centred call to action', 'Short headline and two buttons on a tinted band.', 'cta', ['cta', 'conversion', 'simple'], {
    type: 'cta',
    variant: 'centered',
    props: { tone: 'surface', eyebrow: 'Get started', heading: 'Ready when *you* are', subheading: 'Tell us a little about what you need and we will reply within one working day.', buttons: [b('Get in touch', '/contact')] },
    animation: { preset: 'fade-up' },
  }),
  t('cta-image-background', 'Image call to action', 'Full-width photograph behind a closing headline and button.', 'cta', ['cta', 'image', 'hospitality', 'closing'], {
    type: 'cta',
    variant: 'image-background',
    props: { tone: 'inverse', eyebrow: 'Plan your visit', heading: 'Your *escape* is closer than you think', subheading: 'Send us your dates and we will shape everything around you.', buttons: [b('Enquire now', '/contact')], image: img('starryPeaks'), overlayOpacity: 0.45 },
    animation: { preset: 'fade-up' },
  }),
  t('cta-banner', 'Banner call to action', 'Slim inverse banner with a one-line headline and action.', 'cta', ['cta', 'banner', 'compact'], {
    type: 'cta',
    variant: 'banner',
    props: { tone: 'inverse', heading: 'Book direct and *save* 10%', subheading: 'Our best rate, flexible cancellation and a welcome gift.', buttons: [b('Check availability', '/contact')], spacingTop: 'md', spacingBottom: 'md' },
  }),
  t('booking-bar', 'Booking bar', 'Arrival, departure and guests search that hands off to your booking engine.', 'cta', ['hotel', 'booking', 'availability', 'hospitality'], {
    type: 'booking-cta',
    variant: 'bar',
    props: { tone: 'surface', heading: 'Plan your stay', text: 'Best rates guaranteed when you book direct.', bookingUrl: 'https://booking.example.com/reserve', maxGuests: 6, defaultNights: 2, buttonLabel: 'Check availability', spacingTop: 'md', spacingBottom: 'md' },
  }),

  // ---------------------------------------------------------------- faq
  t('faq-two-column', 'FAQ two-column', 'Intro on the left, expandable questions on the right; emits FAQPage schema.', 'faq', ['faq', 'questions', 'seo'], {
    type: 'faq',
    variant: 'two-column',
    props: {
      eyebrow: 'Good to know', heading: 'Questions, *answered*', subheading: 'Anything else? Write to {{business.email | our team}} — we reply within a day.',
      items: [
        { question: 'How do I book?', answer: 'Use the enquiry form on our contact page or call us on {{business.phone | the number in the footer}}. We confirm every booking by email.' },
        { question: 'What is your cancellation policy?', answer: 'Free cancellation up to 14 days before your date. Special offers may have different terms, shown when you book.' },
        { question: 'Do you cater for dietary requirements?', answer: 'Always — tell us in advance and our team will take care of it.' },
        { question: 'Is there parking?', answer: 'Yes, free on-site parking is available for all guests.' },
      ],
      cta: b('Contact us', '/contact', 'link'),
    },
    animation: { preset: 'fade-up' },
  }),

  // ---------------------------------------------------------------- contact
  t('contact-info-split', 'Contact details with map', 'Phone, email, address and hours from business settings beside a privacy-friendly map.', 'contact', ['contact', 'map', 'address', 'hours'], {
    type: 'contact-info',
    variant: 'split',
    anchor: 'visit',
    props: { eyebrow: 'Find us', heading: 'Where to *find* us', subheading: '{{business.address | Add your address in site settings.}}', showPhone: true, showEmail: true, showWhatsapp: true, showAddress: true, showHours: true, showSocial: true },
    animation: { preset: 'fade-up' },
  }),
  t('contact-form-split', 'Enquiry form with text', 'Form beside an introduction and contact details. Choose the form after inserting.', 'contact', ['form', 'enquiry', 'contact', 'lead'], {
    type: 'form',
    variant: 'split-with-text',
    anchor: 'enquire',
    props: { tone: 'surface', formId: '', eyebrow: 'Enquire', heading: 'Tell us about your *plans*', subheading: 'Share a few details and our team will reply within one working day.', image: pic('lakeDeckBed'), showContactDetails: true },
  }),
  t('newsletter-inline', 'Newsletter sign-up', 'Inline email sign-up. Connect a form with an email field after inserting.', 'contact', ['newsletter', 'email', 'subscribe'], {
    type: 'newsletter',
    variant: 'inline',
    props: { tone: 'surface', formId: '', eyebrow: 'Newsletter', heading: 'Letters, now and then', text: 'Seasonal news, offers and the occasional recipe. No more than once a month.', buttonLabel: 'Subscribe', placeholder: 'Your email address', image: undefined },
  }),

  // ---------------------------------------------------------------- pricing
  t('pricing-cards', 'Pricing cards', 'Three plans with a highlighted favourite, inclusions and actions.', 'pricing', ['pricing', 'plans', 'saas', 'packages'], {
    type: 'pricing',
    variant: 'cards',
    props: {
      eyebrow: 'Pricing', heading: 'Simple, transparent *plans*', subheading: 'Start small and upgrade whenever you are ready.', align: 'center',
      plans: [
        { name: 'Starter', price: '$0', period: 'forever', description: 'For individuals and small projects.', features: ['Up to 3 users', 'Core features', 'Community support'], cta: b('Get started', '/contact', 'outline') },
        { name: 'Team', price: '$12', period: 'per user / month', description: 'For growing teams.', features: ['Unlimited users', 'Advanced reporting', 'Priority support'], cta: b('Start free trial', '/contact'), highlighted: true, badge: 'Most popular' },
        { name: 'Enterprise', price: 'Custom', period: 'annual billing', description: 'For organisations with advanced needs.', features: ['SSO & audit logs', 'Dedicated manager', 'Uptime SLA'], cta: b('Talk to sales', '/contact', 'outline') },
      ],
      footnote: 'Prices in USD. Cancel any time.',
    },
    animation: { preset: 'stagger' },
  }),
  t('pricing-comparison', 'Plan comparison table', 'Side-by-side comparison of plans or room types with a highlighted column.', 'pricing', ['comparison', 'table', 'plans'], {
    type: 'comparison-table',
    props: {
      tone: 'surface', eyebrow: 'Compare', heading: 'Find the right *fit*',
      columns: [{ label: 'Starter', highlighted: false }, { label: 'Team', highlighted: true }, { label: 'Enterprise', highlighted: false }],
      rows: [
        { label: 'Users', values: ['Up to 3', 'Unlimited', 'Unlimited'] },
        { label: 'Reporting', values: ['Basic', 'Advanced', 'Advanced'] },
        { label: 'SSO', values: ['no', 'no', 'yes'] },
        { label: 'Support', values: ['Community', 'Priority', 'Dedicated'] },
      ],
      caption: 'All plans include unlimited projects.',
    },
  }),
  t('offers-cards', 'Packages & offers', 'Offer cards with badge, price, inclusions and validity.', 'pricing', ['offers', 'packages', 'hotel', 'deals'], {
    type: 'offers',
    variant: 'cards',
    props: {
      eyebrow: 'Offers', heading: 'Reasons to stay *longer*',
      items: [
        { title: 'Stay Longer', badge: 'Save 20%', image: pic('lakeDeckBed'), price: 'From $1,120', priceNote: 'for 4 nights', description: 'Four nights for the price of three, with breakfast.', inclusions: ['Daily breakfast', 'Sunset cruise', 'Late check-out'], validity: 'Year-round', cta: b('Book this offer', '/contact', 'outline') },
        { title: 'Spa Escape', image: pic('spaMassage'), price: 'From $760', priceNote: 'for 2 nights', description: 'Two nights with daily treatments and wellness dining.', inclusions: ['Two treatments', 'Daily yoga', 'Wellness dinner'], validity: 'Sunday to Thursday', cta: b('Book this offer', '/contact', 'outline') },
        { title: 'Romance', image: pic('winePour'), price: 'From $640', priceNote: 'for 2 nights', description: 'Champagne on arrival and a private dinner for two.', inclusions: ['Champagne', 'Private dinner', 'Couples massage'], validity: 'Year-round', cta: b('Book this offer', '/contact', 'outline') },
      ],
      columns: 3, imageAspect: '3:2',
    },
    animation: { preset: 'stagger' },
  }),

  // ---------------------------------------------------------------- team
  t('team-grid', 'Team grid', 'Four portraits with names, roles and short bios.', 'team', ['team', 'people', 'about'], {
    type: 'team',
    variant: 'grid',
    anchor: 'team',
    props: {
      eyebrow: 'Our people', heading: 'Meet the *team*',
      members: [
        { name: 'Elena Marsh', role: 'Founder', bio: 'Twenty years of making people feel welcome.', photo: pic('portraitW1', 800), links: [] },
        { name: 'David Okoro', role: 'Operations', bio: 'Keeps everything running beautifully.', photo: pic('portraitM3', 800), links: [] },
        { name: 'Hannah Lee', role: 'Guest experience', bio: 'Remembers every name and every preference.', photo: pic('portraitW3', 800), links: [] },
        { name: 'Marcus Webb', role: 'Head chef', bio: 'Cooks with the seasons and local growers.', photo: pic('portraitM5', 800), links: [] },
      ],
      columns: 4, portraitAspect: '4:5',
    },
    animation: { preset: 'stagger' },
  }),

  // ---------------------------------------------------------------- stats
  t('stats-large', 'Large stats', 'Three oversized numbers with labels and context on an inverse band.', 'stats', ['stats', 'numbers', 'credibility'], {
    type: 'stats',
    variant: 'large',
    props: {
      tone: 'inverse', eyebrow: 'In numbers', heading: 'Measured in *outcomes*',
      items: [
        { value: '15', label: 'Years of experience', description: 'Serving guests and clients since 2011' },
        { value: '4.9', label: 'Average rating', description: 'Across more than 2,000 reviews' },
        { value: '92', suffix: '%', label: 'Return visitors', description: 'Who come back within two years' },
      ],
      columns: 3,
    },
    animation: { preset: 'stagger' },
  }),

  // ---------------------------------------------------------------- events
  t('events-list', 'Upcoming events', 'Date-led list of upcoming events; past events hide automatically.', 'events', ['events', 'calendar', 'whats on'], {
    type: 'events',
    variant: 'list',
    props: {
      eyebrow: 'What’s on', heading: 'Upcoming *events*',
      items: [
        { title: 'Winter Supper Club', date: '2026-12-11', time: '19:00', location: 'The dining room', category: 'Dining', summary: 'Five courses by candlelight with live music.' },
        { title: 'New Year’s Eve Party', date: '2026-12-31', time: '20:00', location: 'The terrace', category: 'Celebration', summary: 'Dinner, dancing and fireworks over the water.' },
        { title: 'Spring Wellness Week', date: '2027-03-15', endDate: '2027-03-21', location: 'Garden pavilion', category: 'Wellness', summary: 'Seven days of yoga, breathwork and nourishing food.' },
        { title: 'Summer Garden Party', date: '2027-07-10', time: '16:00', location: 'The lawn', category: 'Community', summary: 'Live music, local food and drink in the garden.' },
      ],
      buttons: [b('Enquire about an event', '/contact', 'outline')],
    },
    animation: { preset: 'stagger' },
  }),
  t('venues-detailed', 'Venue spaces', 'Event spaces with photography, size, capacity per layout and a comparison table.', 'events', ['venue', 'events', 'weddings', 'meetings', 'capacity'], {
    type: 'venues',
    variant: 'detailed',
    anchor: 'spaces',
    props: {
      eyebrow: 'Spaces', heading: 'Rooms to *gather*',
      items: [
        { name: 'The Garden', image: img('weddingPavilion'), size: '850 m²', description: 'An open-air garden with a stone pavilion — ideal for ceremonies and summer receptions.', capacities: [{ layout: 'Ceremony', guests: '220' }, { layout: 'Cocktail', guests: '300' }], features: ['Natural light', 'Festoon lighting'] },
        { name: 'The Orangery', image: img('ballroom'), size: '420 m²', description: 'A glass-roofed hall for dinners, conferences and dancing in any season.', capacities: [{ layout: 'Banquet', guests: '180' }, { layout: 'Theatre', guests: '240' }, { layout: 'Cocktail', guests: '260' }], features: ['Dance floor', 'In-house AV'] },
        { name: 'The Library', image: img('boardroom'), size: '80 m²', description: 'A quiet panelled room for board meetings and private dinners.', capacities: [{ layout: 'Boardroom', guests: '16' }, { layout: 'Banquet', guests: '24' }], features: ['Screen & VC', 'Private bar'] },
      ],
      showTable: true,
    },
    animation: { preset: 'fade-up' },
  }),

  // ---------------------------------------------------------------- collection
  t('collection-posts-grid', 'Blog posts grid', 'Latest posts from the "posts" collection as image cards linking to each article.', 'collection', ['blog', 'journal', 'news', 'collection'], {
    type: 'collection-list',
    variant: 'grid',
    props: { eyebrow: 'Journal', heading: 'Latest *stories*', collection: 'posts', limit: 3, columns: 3, imageAspect: '3:2', linkLabel: 'Read more', emptyText: 'New stories are on their way.' },
    animation: { preset: 'stagger' },
  }),

  // ---------------------------------------------------------------- media
  t('media-background-video', 'Background video band', 'Ambient full-width video behind a headline; shows the poster on mobile and for reduced motion. Upload a video after inserting.', 'media', ['video', 'ambient', 'fullscreen'], {
    type: 'background-video',
    props: {
      tone: 'inverse', poster: img('lakeJetty'), eyebrow: 'Slow mornings', heading: 'Where the water sets the *pace*', subheading: 'Add a short, silent loop — waves, steam from a cup, light through leaves.',
      buttons: [b('Plan your visit', '/contact')], overlayOpacity: 0.4, height: 'tall', contentPosition: 'center', mobilePosterOnly: true, spacingTop: 'none', spacingBottom: 'none',
    },
    animation: { preset: 'cinematic-reveal' },
  }),
  t('media-parallax-band', 'Parallax image band', 'Full-bleed photograph that drifts subtly on scroll with an overlaid statement.', 'media', ['parallax', 'image', 'statement'], {
    type: 'parallax-band',
    props: { tone: 'inverse', image: img('himalayaClouds'), eyebrow: 'Perspective', heading: 'Above the clouds, *below* the peaks', text: 'A single sentence that lets the photograph do the talking.', height: 'lg', overlayOpacity: 0.3, intensity: 'subtle', spacingTop: 'none', spacingBottom: 'none' },
    animation: { preset: 'fade' },
  }),
  t('media-logo-marquee', 'Logo marquee', 'Slow, continuous scroll of client or press names (pauses on hover).', 'media', ['logos', 'clients', 'press', 'marquee'], {
    type: 'logo-cloud',
    variant: 'marquee',
    props: { eyebrow: 'As featured in', align: 'center', logos: [{ name: 'Wanderlore' }, { name: 'The Quiet Traveller' }, { name: 'Atlas Journal' }, { name: 'Northfield' }, { name: 'Maison Verde' }, { name: 'Halcyon' }, { name: 'Meridian' }], grayscale: true, speed: 40, spacingTop: 'md', spacingBottom: 'md' },
  }),

  // ---------------------------------------------------------------- story
  t('story-timeline', 'Story timeline', 'Milestones in a vertical timeline — company history or a wedding-day schedule.', 'story', ['history', 'timeline', 'about'], {
    type: 'timeline',
    variant: 'vertical',
    props: {
      eyebrow: 'Our story', heading: 'From small beginnings to *today*',
      items: [
        { date: '2009', title: 'The first chapter', text: 'A family home opens its doors to a handful of guests.' },
        { date: '2016', title: 'Growing carefully', text: 'New rooms, a garden kitchen and a team of twenty.' },
        { date: '2022', title: 'Recognition', text: 'Our first national award — and many more friends.' },
        { date: 'Today', title: 'Still family-run', text: 'Independent, rooted in place and proud of it.' },
      ],
    },
    animation: { preset: 'stagger' },
  }),
  t('story-sticky', 'Sticky storytelling', 'Pinned image that changes as story steps scroll past.', 'story', ['story', 'scroll', 'immersive', 'day in the life'], {
    type: 'sticky-story',
    props: {
      tone: 'surface', eyebrow: 'A day here', heading: 'How a day *unfolds*',
      steps: [
        { eyebrow: '07:00', title: 'First light', text: 'Yoga in the pavilion, or a quiet paddle while the water is still.', image: pic('meditationSunrise', 1800) },
        { eyebrow: '10:00', title: 'A late breakfast', text: 'Fresh bread, garden fruit and eggs any way you like.', image: pic('breakfastToast', 1800) },
        { eyebrow: '15:00', title: 'Spa afternoon', text: 'Warm stones, botanical oils and the pools at their quietest.', image: pic('spaTowels', 1800) },
        { eyebrow: '19:30', title: 'Dinner by the water', text: 'Wood-fired plates as the sky turns pink.', image: pic('diningTerrace', 1800) },
      ],
      mediaSide: 'left', mediaAspect: '4:5',
    },
  }),
  t('story-horizontal-scroll', 'Horizontal scroll story', 'Pinned section where scrolling moves a row of cards sideways.', 'story', ['scroll', 'immersive', 'cards', 'journey'], {
    type: 'horizontal-scroll',
    props: {
      eyebrow: 'The journey', heading: 'From first light to *firelight*',
      items: [
        { eyebrow: '06:00', title: 'Sunrise paddle', image: pic('lakeBoat'), text: 'Mist lifting off the water.' },
        { eyebrow: '09:00', title: 'Breakfast on the terrace', image: pic('breakfastEggs'), text: 'Served until eleven.' },
        { eyebrow: '14:00', title: 'Forest walk', image: pic('forestPath'), text: 'Old trails and birdsong.' },
        { eyebrow: '19:30', title: 'Dinner by the water', image: pic('diningTerrace'), text: 'Candles and good wine.' },
        { eyebrow: '22:00', title: 'Stargazing', image: pic('starryPeaks'), text: 'The Milky Way, no city lights.' },
      ],
      cardWidth: 'md', imageAspect: '3:4', pin: true,
    },
    animation: { preset: 'horizontal-scroll' },
  }),
  t('story-content-collage', 'Story collage', 'Two overlapping photographs beside a story with facts and a signature.', 'story', ['about', 'story', 'collage', 'founder'], {
    type: 'content-split',
    variant: 'collage',
    props: {
      eyebrow: 'Our story', heading: 'Rooted in place, *open* to the world',
      body: 'What began as a small family business is now a place people return to year after year — shaped by local craft, honest food and service that feels like being looked after by friends.\n\nWe are still independent, still family-run, and still learning every day.',
      buttons: [b('Get in touch', '/contact', 'link')], image: img('lakeBoathouse'), secondaryImage: pic('roomGardenSuite', 1400), imageSide: 'left', imageAspect: '4:5',
      facts: [{ label: 'Founded', value: '2009' }, { label: 'Team', value: '40 people' }], signature: 'The founders',
    },
    animation: { preset: 'image-mask' },
  }),
];

export function getSectionTemplate(key: string): SectionTemplate | undefined {
  return SECTION_TEMPLATES.find((s) => s.key === key);
}
