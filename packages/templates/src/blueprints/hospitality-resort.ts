import { photoUrl } from '../images';
import { ROOM_BINDING_MAP, roomDetailPage, roomsCollection, type RoomSeed } from './rooms';
import type { Blueprint, BlueprintInput } from '../types';
import {
  anim, assemble, bookingBar, bookingRef, btn, buildForm, contactPage, contextOf, ctaSection, faqSection, field, footer, galleryImages, header, heroCopy,
  homeTitle, img, metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type Section,
} from './shared';

const ROOMS: RoomSeed[] = [
  { slug: 'garden-room', name: 'Garden Room', summary: 'A calm, timber-lined room opening onto a private garden terrace.', price: '$280', size: '42 m²', guests: '2 guests', bed: 'King bed', view: 'Garden', description: 'Our Garden Rooms sit low among frangipani and fern, each with a shaded terrace for slow breakfasts. Inside: hand-woven textiles, a deep rain shower and a writing desk by the window.\n\nIdeal for couples who want quiet, greenery and a short stroll to the pool.', image: 'roomGardenSuite', gallery: ['roomGardenSuite', 'bathPalm', 'breakfastEggs'] },
  { slug: 'terrace-suite', name: 'Terrace Suite', summary: 'Floor-to-ceiling glass, a wide terrace and sunsets over the water.', price: '$420', size: '64 m²', guests: '3 guests', bed: 'King bed + daybed', view: 'Water', description: 'The Terrace Suites face west for long, golden evenings. A separate lounge, a freestanding stone bath and a terrace with loungers make it easy to never leave.\n\nSuites include evening canapés and priority spa bookings.', image: 'roomGlassSuite', gallery: ['roomGlassSuite', 'bathStone', 'terraceMountains'] },
  { slug: 'pool-villa', name: 'Pool Villa', summary: 'A private villa with its own plunge pool, outdoor shower and sala.', price: '$690', size: '120 m²', guests: '4 guests', bed: 'King bed + twin', view: 'Pool & garden', description: 'Set apart behind a walled garden, each Pool Villa has a heated plunge pool, an open-air shower and a shaded sala for afternoon naps.\n\nA dedicated host arranges in-villa dining, treatments and excursions.', image: 'poolInfinity', gallery: ['poolInfinity', 'roomWarmWood', 'bathWhite'] },
  { slug: 'family-residence', name: 'Family Residence', summary: 'Two bedrooms, a kitchen and a lawn for families and friends.', price: '$860', size: '160 m²', guests: '6 guests', bed: '2 bedrooms', view: 'Garden & hills', description: 'Our largest home: two en-suite bedrooms, a living room with a kitchen, and a lawn that runs down to the garden path.\n\nChildren are welcomed with their own bathrobes, a nature kit and an afternoon with our gardeners.', image: 'roomClassic', gallery: ['roomClassic', 'livingOpen', 'poolTimber'] },
];

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'Where slow days *begin*', 'A retreat of gardens, water and unhurried service — designed for rest, good food and the occasional adventure.');

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'cinematic',
      props: {
        tone: 'inverse', eyebrow: '{{business.name}} · {{vars.location}}', heading: hero.heading, subheading: hero.subheading,
        buttons: [btn('Explore the rooms', '/rooms'), btn('Plan your stay', '/contact#enquire', 'outline')],
        image: img('poolTropical'), overlayOpacity: 0.35, height: 'screen', contentPosition: 'bottom-left', showScrollCue: true,
        meta: [{ label: 'Rooms & villas', value: '32' }, { label: 'Spa', value: 'Open daily' }, { label: 'Restaurants', value: 'Two' }],
        spacingTop: 'none', spacingBottom: 'none',
      },
      animation: anim.cinematic,
    },
    bookingRef,
    {
      type: 'text-section',
      variant: 'statement',
      props: {
        eyebrow: 'Welcome',
        heading: 'A place where the days are measured by *light* — morning swims, long lunches and evenings that end beneath the stars.',
        body: 'Thirty-two rooms and villas set within mature gardens, a spa built around water, and a kitchen that cooks with what grows nearby. Stay for a weekend, or long enough to forget what day it is.',
        buttons: [btn('Our story', '/experiences', 'link')],
        align: 'center', containerWidth: 'narrow', spacingTop: 'xl', spacingBottom: 'lg',
      },
      animation: anim.text,
    },
    {
      type: 'rooms',
      variant: 'cards',
      binding: { collection: 'rooms', limit: 3, map: ROOM_BINDING_MAP },
      props: {
        eyebrow: 'Stay', heading: 'Rooms & *villas*', subheading: 'From garden rooms to private pool villas — every stay includes breakfast, yoga and access to the thermal pools.',
        items: [], columns: 3, imageAspect: '4:5', ctaLabel: 'View room', collection: 'rooms', buttons: [btn('All rooms & villas', '/rooms', 'outline')],
      },
      animation: anim.stagger,
    },
    {
      type: 'dining',
      variant: 'feature',
      props: {
        tone: 'surface', eyebrow: 'Dining', heading: 'Cooked over fire, *served* by the water',
        body: 'Our open kitchen follows the seasons — line-caught fish, garden herbs and slow-roasted meats, with a cellar of natural and old-world wines.\n\nBreakfast is served until late, because holidays should be.',
        image: img('diningTerrace'), highlights: [{ label: 'Cuisine', value: 'Seasonal, wood-fired' }, { label: 'Setting', value: 'Waterside terrace' }],
        hours: [{ label: 'Breakfast', value: '7:00 – 11:00' }, { label: 'Lunch', value: '12:30 – 15:00' }, { label: 'Dinner', value: '18:30 – 22:30' }],
        buttons: [btn('Discover dining', '/dining'), btn('Reserve a table', '/contact#enquire', 'link')], imageSide: 'left',
      },
      animation: anim.mask,
    },
    {
      type: 'experiences',
      variant: 'horizontal-scroll',
      props: {
        eyebrow: 'Experiences', heading: 'Days worth *remembering*',
        items: [
          { title: 'Sunrise paddle', tag: 'On the water', image: img('lakeBoat', { width: 1600 }), duration: '2 hours', text: 'Glide out on still water as the mist lifts, with coffee waiting on your return.' },
          { title: 'Spa rituals', tag: 'Wellness', image: img('spaStones', { width: 1600 }), duration: '90 minutes', text: 'Warm stones, botanical oils and a long soak in the thermal pools.' },
          { title: 'Guided forest walk', tag: 'Nature', image: img('forestPath', { width: 1600 }), duration: 'Half day', text: 'Follow old trails with a local guide, ending at a hidden waterfall.' },
          { title: 'Garden cooking class', tag: 'Culinary', image: img('cookingClass', { width: 1600 }), duration: '3 hours', text: 'Pick, prepare and share a long lunch with our chefs.' },
        ],
        imageAspect: '3:4', buttons: [btn('All experiences', '/experiences', 'outline')],
      },
      animation: { preset: 'horizontal-scroll' },
    },
    {
      type: 'parallax-band',
      props: { image: img('resortWaterfront'), eyebrow: 'Celebrations', heading: 'Weddings and gatherings, *beautifully* hosted', text: 'Garden ceremonies, long-table dinners and private buy-outs for up to 180 guests.', buttons: [btn('Weddings & events', '/weddings', 'secondary')], height: 'lg', overlayOpacity: 0.35, intensity: 'subtle', tone: 'inverse', spacingTop: 'none', spacingBottom: 'none' },
      animation: anim.fade,
    },
    testimonialsSection([
      { quote: 'The kind of place you start planning to return to before you have even left. Every detail felt quietly anticipated.', author: 'Clara & Tomás', role: 'Stayed in a Pool Villa', source: 'Google' },
      { quote: 'Breakfast until eleven, the best massage of my life and staff who remembered our names on day one.', author: 'Priya R.', role: 'Spa retreat guest', source: 'Tripadvisor' },
      { quote: 'Our children still talk about the cooking class and the frogs in the garden pond. A genuinely family-friendly luxury stay.', author: 'The Okafor family', role: 'Family Residence', source: 'Google' },
    ], { eyebrow: 'Guest words', heading: 'Stories from our *guests*' }),
    {
      type: 'offers',
      variant: 'featured',
      props: {
        eyebrow: 'Offers', heading: 'Reasons to stay *longer*',
        items: [
          { title: 'Stay Longer', badge: 'Save 20%', image: img('lakeDeckBed', { width: 1600 }), price: 'From $1,120', priceNote: 'for 4 nights', description: 'Four nights for the price of three, with breakfast and a sunset cruise.', inclusions: ['Daily breakfast', 'Sunset cruise for two', 'Late check-out'], validity: 'Valid year-round', cta: btn('Book this offer', '/contact#enquire', 'outline') },
          { title: 'Spa Escape', image: img('spaMassage', { width: 1600 }), price: 'From $760', priceNote: 'for 2 nights', description: 'Two nights with daily treatments and wellness dining.', inclusions: ['Two 60-minute treatments', 'Daily yoga', 'Wellness dinner'], validity: 'Sunday to Thursday', cta: btn('Book this offer', '/contact#enquire', 'outline') },
          { title: 'Family Summer', image: img('poolTimber', { width: 1600 }), price: 'From $1,480', priceNote: 'for 3 nights', description: 'Kids stay and eat free, plus a nature club every afternoon.', inclusions: ['Children eat free', 'Nature club', 'Family photo session'], validity: 'June to August', cta: btn('Book this offer', '/contact#enquire', 'outline') },
        ],
        columns: 3, imageAspect: '3:2',
      },
      animation: anim.stagger,
    },
    ctaSection({ eyebrow: 'Plan your stay', heading: 'Your *escape* is closer than you think', subheading: 'Tell us your dates and we will shape the stay around you — rooms, dining, treatments and transfers.', buttons: [btn('Check availability', '/contact#enquire'), btn('Call {{business.phone | us}}', '/contact', 'outline')], image: 'starryPeaks' }),
  ];

  const rooms: Section[] = [
    {
      type: 'hero',
      variant: 'editorial',
      props: { eyebrow: 'Rooms & villas', heading: 'Rooms made for *resting*', subheading: 'Natural materials, generous space and views of the garden or the water. Every stay includes breakfast, yoga and the thermal pools.', buttons: [btn('Check availability', '/contact#enquire')], image: img('roomGlassSuite'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'rooms',
      variant: 'editorial-list',
      anchor: 'rooms',
      binding: { collection: 'rooms', map: ROOM_BINDING_MAP },
      props: { eyebrow: 'Choose your stay', heading: 'Four ways to *stay*', items: [], imageAspect: '4:5', showPrice: true, showFacts: true, ctaLabel: 'Explore', collection: 'rooms' },
      animation: anim.clip,
    },
    {
      type: 'amenities',
      variant: 'icon-grid',
      props: {
        tone: 'surface', eyebrow: 'In every room', heading: 'The little things, *taken care of*',
        items: [
          { icon: 'bed-double', title: 'Hand-finished beds', text: 'Organic cotton linen and a pillow menu.' },
          { icon: 'coffee', title: 'Coffee & tea', text: 'Local roast, loose-leaf teas, fresh milk.' },
          { icon: 'wifi', title: 'Fast Wi-Fi', text: 'Throughout the rooms and gardens.' },
          { icon: 'bath', title: 'Rain showers', text: 'Botanical bath products made nearby.' },
          { icon: 'waves', title: 'Thermal pools', text: 'Open to all guests from 7am to 10pm.' },
          { icon: 'sunrise', title: 'Morning yoga', text: 'Daily classes in the garden pavilion.' },
          { icon: 'car', title: 'Transfers', text: 'Private airport transfers on request.' },
          { icon: 'concierge-bell', title: 'Concierge', text: 'Excursions, dinners and treatments arranged.' },
        ],
        columns: 4,
      },
      animation: anim.stagger,
    },
    {
      type: 'comparison-table',
      props: {
        eyebrow: 'Compare', heading: 'Find the right *fit*',
        columns: [{ label: 'Garden Room', highlighted: false }, { label: 'Terrace Suite', highlighted: true }, { label: 'Pool Villa', highlighted: false }, { label: 'Family Residence', highlighted: false }],
        rows: [
          { label: 'Size', values: ['42 m²', '64 m²', '120 m²', '160 m²'] },
          { label: 'Guests', values: ['2', '3', '4', '6'] },
          { label: 'Private terrace', values: ['yes', 'yes', 'yes', 'yes'] },
          { label: 'Plunge pool', values: ['no', 'no', 'yes', 'no'] },
          { label: 'Kitchen', values: ['no', 'no', 'no', 'yes'] },
        ],
        caption: 'All rates include breakfast, yoga and thermal pool access.',
      },
    },
    faqSection([
      { question: 'What time are check-in and check-out?', answer: 'Check-in is from 3pm and check-out until 11am. Early arrival and late departure can be arranged when available.' },
      { question: 'Is breakfast included?', answer: 'Yes — a seasonal breakfast is included with every stay and served until 11am.' },
      { question: 'Do you welcome children?', answer: 'Children of all ages are welcome. Cots and extra beds are available in suites, villas and the Family Residence.' },
      { question: 'Can you arrange airport transfers?', answer: 'Yes, private transfers can be added to any booking. Let us know your flight details when you enquire.' },
    ], { tone: 'surface' }),
    ctaSection({ heading: 'Ready when *you* are', subheading: 'Best rates and flexible terms when you book directly with us.', buttons: [btn('Enquire about a stay', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const experiences: Section[] = [
    {
      type: 'hero',
      variant: 'fullscreen-image',
      props: { tone: 'inverse', eyebrow: 'Experiences', heading: 'Slow mornings, *wild* afternoons', subheading: 'Guided walks, water, wellness and food — arranged by people who know {{vars.location}} best.', buttons: [btn('Plan your days', '/contact#enquire')], image: img('hikerClouds'), height: 'tall', overlayOpacity: 0.35, contentPosition: 'bottom-left', spacingTop: 'none', spacingBottom: 'none' },
      animation: anim.cinematic,
    },
    {
      type: 'experiences',
      variant: 'cards',
      props: {
        eyebrow: 'Curated for you', heading: 'Choose your *pace*', subheading: 'Book any experience on arrival or ahead of your stay. Private versions are available for every activity.',
        items: [
          { title: 'Sunrise paddle', tag: 'On the water', image: img('lakeBoat', { width: 1600 }), duration: '2 hours', price: '$45', text: 'Calm water, first light and coffee on the jetty.' },
          { title: 'Forest & waterfall walk', tag: 'Nature', image: img('waterfall', { width: 1600 }), duration: 'Half day', price: '$70', text: 'Old trails, birdsong and a swim beneath the falls.' },
          { title: 'Garden cooking class', tag: 'Culinary', image: img('cookingClass', { width: 1600 }), duration: '3 hours', price: '$85', text: 'Pick, cook and share a long lunch with our chefs.' },
          { title: 'Spa journey', tag: 'Wellness', image: img('spaOil', { width: 1600 }), duration: '2 hours', price: '$160', text: 'Scrub, massage and a private soak in the thermal pools.' },
          { title: 'Yoga & breathwork', tag: 'Wellness', image: img('yogaMist', { width: 1600 }), duration: '75 minutes', price: 'Included', text: 'Daily practice in the garden pavilion for every level.' },
          { title: 'Campfire evenings', tag: 'Together', image: img('campfire', { width: 1600 }), duration: 'Evening', price: '$30', text: 'Stories, stargazing and toasted treats by the fire.' },
        ],
        columns: 3, imageAspect: '3:4',
      },
      animation: anim.stagger,
    },
    {
      type: 'sticky-story',
      props: {
        tone: 'surface', eyebrow: 'A day here', heading: 'How a day *unfolds*',
        steps: [
          { eyebrow: '07:00', title: 'First light', text: 'Yoga in the pavilion, or a quiet paddle while the water is still.', image: img('meditationSunrise', { width: 1800 }) },
          { eyebrow: '10:00', title: 'A late breakfast', text: 'Fresh bread, garden fruit and eggs any way you like, served until eleven.', image: img('breakfastToast', { width: 1800 }) },
          { eyebrow: '15:00', title: 'Spa afternoon', text: 'Warm stones, botanical oils and the thermal pools at their quietest.', image: img('spaTowels', { width: 1800 }) },
          { eyebrow: '19:30', title: 'Dinner by the water', text: 'Wood-fired plates and a glass of something good as the sky turns pink.', image: img('diningTerrace', { width: 1800 }) },
        ],
        mediaSide: 'left', mediaAspect: '4:5',
      },
    },
    {
      type: 'attractions',
      variant: 'list',
      props: {
        eyebrow: 'Nearby', heading: 'Explore *{{vars.location}}*',
        items: [
          { name: 'Old town & market', distance: '15 min drive', category: 'Culture', text: 'Craft stores, cafés and a lively Saturday market.' },
          { name: 'Waterfall trail', distance: '30 min walk', category: 'Nature', text: 'A shaded trail ending at a swimming hole beneath the falls.' },
          { name: 'Hilltop viewpoint', distance: '25 min drive', category: 'Viewpoint', text: 'The best sunrise in the region — we will pack breakfast.' },
          { name: 'Vineyards & farms', distance: '40 min drive', category: 'Food & wine', text: 'Tastings and long lunches with local producers.' },
        ],
        columns: 2,
      },
      animation: anim.stagger,
    },
    ctaSection({ heading: 'Let us plan your *days*', subheading: 'Tell us what you love and our concierge will build an itinerary around it.', buttons: [btn('Speak to our concierge', '/contact#enquire')], image: 'mountainValley' }),
  ];

  const dining: Section[] = [
    {
      type: 'hero',
      variant: 'editorial',
      props: { eyebrow: 'Dining', heading: 'Seasonal, wood-fired, *unhurried*', subheading: 'Two restaurants and a bar, all cooking with what the gardens and nearby farms provide.', buttons: [btn('Reserve a table', '/contact#enquire'), btn('See the menu', '#menu', 'link')], image: img('diningPlate'), imageSide: 'left', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'dining',
      variant: 'split',
      props: {
        eyebrow: 'The Terrace', heading: 'Lunch and dinner *by the water*', body: 'Our main restaurant opens onto a terrace above the water. Expect line-caught fish, wood-roasted vegetables and herbs picked an hour before service.',
        image: img('diningTerrace'), highlights: [{ label: 'Cuisine', value: 'Modern, seasonal' }, { label: 'Dress code', value: 'Relaxed' }],
        hours: [{ label: 'Lunch', value: '12:30 – 15:00' }, { label: 'Dinner', value: '18:30 – 22:30' }],
        buttons: [btn('Reserve the Terrace', '/contact#enquire')], imageSide: 'left',
      },
      animation: anim.mask,
    },
    {
      type: 'menu',
      variant: 'tabs',
      anchor: 'menu',
      props: {
        tone: 'surface', eyebrow: 'Sample menu', heading: 'From the *garden*', align: 'center',
        categories: [
          { name: 'To begin', items: [{ name: 'Charred garden greens', description: 'Whipped feta, lemon, toasted seeds', price: '14', tags: ['V'] }, { name: 'Cured local fish', description: 'Citrus, chilli, cucumber, herbs', price: '18', tags: ['GF'] }, { name: 'Wood-oven flatbread', description: 'Smoked butter, wild garlic', price: '9', tags: ['V'] }] },
          { name: 'From the fire', items: [{ name: 'Whole grilled fish', description: 'Salsa verde, charred lemon', price: '36', tags: ['GF'] }, { name: 'Slow-roasted lamb', description: 'Smoked aubergine, yoghurt, mint', price: '38', tags: [] }, { name: 'Roasted squash', description: 'Brown butter, sage, toasted grains', price: '26', tags: ['V'] }] },
          { name: 'To finish', items: [{ name: 'Honey panna cotta', description: 'Poached stone fruit', price: '12', tags: ['GF'] }, { name: 'Dark chocolate tart', description: 'Sea salt, crème fraîche', price: '13', tags: ['V'] }] },
        ],
        note: 'V vegetarian · GF gluten free. Menus change with the seasons; please tell us about any allergies.',
      },
      animation: anim.fadeUp,
    },
    {
      type: 'dining',
      variant: 'feature',
      props: {
        eyebrow: 'The Bar', heading: 'Golden hour, *shaken* and stirred', body: 'Botanical cocktails, low-intervention wines and small plates from late afternoon until midnight.',
        image: img('cocktailPour'), highlights: [{ label: 'Signature', value: 'Garden gimlet' }, { label: 'Music', value: 'Vinyl on Fridays' }],
        hours: [{ label: 'Daily', value: '16:00 – 00:00' }], buttons: [btn('Book a bar table', '/contact#enquire', 'outline')], imageSide: 'right',
      },
    },
    {
      type: 'gallery',
      variant: 'grid',
      props: { images: galleryImages([['brunchTable', 'Long lunches'], ['winePour', 'The cellar'], ['dessert', 'To finish'], ['foodSpread', 'Sharing plates']]), columns: 4, aspect: '1:1', gap: 'sm', showCaptions: true, spacingTop: 'md' },
      animation: anim.stagger,
    },
    ctaSection({ heading: 'Save a seat at the *table*', subheading: 'Dining is open to non-residents — reservations recommended for dinner.', buttons: [btn('Reserve a table', '/contact#enquire')], variant: 'banner', tone: 'surface' }),
  ];

  const weddings: Section[] = [
    {
      type: 'hero',
      variant: 'carousel',
      props: { tone: 'inverse', eyebrow: 'Weddings & events', heading: 'Celebrate in *every* season', subheading: 'Garden ceremonies, long-table dinners and full resort buy-outs for up to 180 guests.', buttons: [btn('Plan your event', '#event-enquiry')], images: [img('weddingAisle'), img('weddingTable'), img('toastLights')], height: 'screen', overlayOpacity: 0.4, spacingTop: 'none', spacingBottom: 'none' },
      animation: anim.cinematic,
    },
    {
      type: 'venues',
      variant: 'detailed',
      props: {
        eyebrow: 'Spaces', heading: 'Places to *gather*',
        items: [
          { name: 'The Garden Lawn', image: img('weddingChairs', { width: 1800 }), size: '900 m²', description: 'An open lawn framed by old trees — our most-loved ceremony setting.', capacities: [{ layout: 'Ceremony', guests: '180' }, { layout: 'Banquet', guests: '150' }, { layout: 'Cocktail', guests: '250' }], features: ['Sunset views', 'Festoon lighting'] },
          { name: 'The Pavilion', image: img('marqueeReception', { width: 1800 }), size: '320 m²', description: 'A timber pavilion with open sides for dinners and dancing in any weather.', capacities: [{ layout: 'Banquet', guests: '120' }, { layout: 'Theatre', guests: '160' }, { layout: 'Cocktail', guests: '200' }], features: ['Dance floor', 'In-house AV'] },
          { name: 'The Terrace', image: img('dinnerParty', { width: 1800 }), size: '180 m²', description: 'An intimate terrace above the water for rehearsal dinners and small celebrations.', capacities: [{ layout: 'Banquet', guests: '60' }, { layout: 'Cocktail', guests: '90' }], features: ['Water views', 'Private bar'] },
        ],
        showTable: true,
      },
      animation: anim.fadeUp,
    },
    {
      type: 'offers',
      variant: 'cards',
      props: {
        tone: 'surface', eyebrow: 'Packages', heading: 'Ways to *celebrate*',
        items: [
          { title: 'Elopement', price: 'From $4,500', priceNote: 'up to 10 guests', description: 'An intimate ceremony, photographer and dinner for two to ten.', inclusions: ['Garden ceremony', 'Two nights in a Pool Villa', 'Private dinner'], cta: btn('Enquire', '#event-enquiry', 'outline') },
          { title: 'Garden Wedding', badge: 'Most popular', price: 'From $18,000', priceNote: 'up to 100 guests', description: 'Ceremony, reception and a planner from first call to last dance.', inclusions: ['Ceremony & reception', 'Four-course dinner', 'Dedicated planner'], cta: btn('Enquire', '#event-enquiry', 'outline') },
          { title: 'Resort Buy-out', price: 'On request', priceNote: 'up to 180 guests', description: 'Every room, every space — a weekend that belongs to you.', inclusions: ['All 32 rooms & villas', 'Welcome & farewell events', 'Exclusive use'], cta: btn('Enquire', '#event-enquiry', 'outline') },
        ],
        columns: 3,
      },
      animation: anim.stagger,
    },
    testimonialsSection([
      { quote: 'From the first call to the last dance, the team made everything feel effortless. Our guests are still talking about the dinner.', author: 'Amara & James', role: 'Garden Wedding', source: 'Google' },
      { quote: 'We took over the whole resort for our company retreat. Flawless logistics and genuinely warm hospitality.', author: 'Lena Fischer', role: 'Corporate retreat' },
    ], { variant: 'single', tone: 'default' }),
    {
      type: 'form',
      variant: 'split-with-text',
      anchor: 'event-enquiry',
      props: { tone: 'surface', formId: 'form-events', eyebrow: 'Enquire', heading: 'Tell us about your *celebration*', subheading: 'Share your dates, guest numbers and ideas — our events team replies within one working day with availability and a tailored proposal.', image: img('weddingCouple', { width: 1600 }), showContactDetails: true },
    },
  ];

  const gallery: Section[] = [
    {
      type: 'hero',
      variant: 'minimal',
      props: { eyebrow: 'Gallery', heading: 'A closer *look*', subheading: 'Rooms, gardens, food and the moments in between.', buttons: [btn('Plan your stay', '/contact#enquire', 'outline')], height: 'auto', spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.hero,
    },
    {
      type: 'gallery',
      variant: 'masonry',
      props: {
        images: galleryImages([['poolTropical', 'The main pool'], ['roomGardenSuite', 'Garden Room'], ['spaStones', 'The spa'], ['diningTerrace', 'The Terrace'], ['lakeBoat', 'Morning paddle'], ['bathStone', 'Terrace Suite bathroom'], ['weddingAisle', 'A garden ceremony'], ['cocktails', 'The Bar'], ['forestPath', 'Forest trail'], ['poolInfinity', 'Pool Villa'], ['breakfastEggs', 'Breakfast'], ['campfire', 'Campfire evenings']]),
        columns: 3, gap: 'md', lightbox: true, showCaptions: true, spacingTop: 'none',
      },
      animation: anim.stagger,
    },
    ctaSection({ heading: 'See it for *yourself*', subheading: 'Photographs only tell half the story.', buttons: [btn('Check availability', '/contact#enquire')], image: 'resortWaterfront' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Resort & spa'), seoDescription: metaDescription(`${name} is a resort of gardens, water and unhurried service in ${input.location ?? 'a beautiful setting'}.`, 'Rooms and villas, spa, dining, weddings and experiences.'), sections: home }),
    page({ title: 'Rooms & villas', slug: 'rooms', seoTitle: metaTitle('Rooms & villas', name), seoDescription: metaDescription(`Garden rooms, terrace suites, pool villas and family residences at ${name}.`, 'Every stay includes breakfast, yoga and the thermal pools.'), sections: rooms }),
    roomDetailPage({ bookLink: '/contact#enquire', inclusions: [{ title: 'Breakfast until 11am', icon: 'coffee' }, { title: 'Daily garden yoga', icon: 'sunrise' }, { title: 'Thermal pools & sauna', icon: 'waves' }, { title: 'Bicycles to explore', icon: 'bike' }] }),
    page({ title: 'Experiences', slug: 'experiences', seoTitle: metaTitle('Experiences', name), seoDescription: metaDescription(`Guided walks, spa rituals, cooking classes and days on the water, arranged by the concierge at ${name}.`), sections: experiences }),
    page({ title: 'Dining', slug: 'dining', seoTitle: metaTitle('Dining', name), seoDescription: metaDescription(`Seasonal, wood-fired cooking and botanical cocktails at ${name}.`, 'Breakfast, lunch, dinner and the bar — open to residents and visitors.'), sections: dining }),
    page({ title: 'Weddings & events', slug: 'weddings', seoTitle: metaTitle('Weddings & events', name), seoDescription: metaDescription(`Garden weddings, celebrations and retreats for up to 180 guests at ${name}, with venues, packages and a dedicated planner.`), sections: weddings }),
    page({ title: 'Gallery', slug: 'gallery', seoTitle: metaTitle('Gallery', name), seoDescription: metaDescription(`Photographs of the rooms, villas, gardens, spa and dining at ${name}.`, 'Take a closer look before you arrive.'), sections: gallery }),
    contactPage({
      name, formId: 'form-enquiry', heroImage: 'lakeJetty', heading: 'Plan your *stay*', intro: 'Our reservations team will help with rooms, dining, treatments and transfers — just tell us your dates.',
      formHeading: 'Make an *enquiry*', formSubheading: 'Share a few details and we will reply within a few hours with availability and our best rate.', formImage: 'lakeDeckBed',
      faq: [
        { question: 'How do I get to the resort?', answer: 'We are around {{vars.transferTime}} from the nearest airport. Private transfers can be arranged with your booking.' },
        { question: 'What is your cancellation policy?', answer: 'Free cancellation up to 14 days before arrival on flexible rates. Offers may have different terms, shown when you book.' },
        { question: 'Can non-residents visit the spa or restaurants?', answer: 'Yes — reservations are recommended, especially for dinner and weekend treatments.' },
      ],
      seoDescription: metaDescription(`Contact ${name} to plan your stay, book a table or arrange treatments and transfers.`, 'Our reservations team replies within a few hours.'),
    }),
    privacyPage(name),
  ];

  const enquiry = buildForm({
    id: 'form-enquiry', name: 'Stay enquiry', slug: 'stay-enquiry', notify, subject: 'New stay enquiry from {{name}}',
    fields: [field.name(), field.email(), field.phone(), field.select('enquiryType', 'Enquiry about', ['A stay', 'Dining', 'Spa', 'Something else'], { required: true }), field.date('arrival', 'Arrival', 'third'), field.date('departure', 'Departure', 'third'), field.number('guests', 'Guests', { min: 1, max: 12, width: 'third' }), field.message('Anything we should know?', 'Celebrations, dietary needs, transfer times…'), field.consent()],
    submitLabel: 'Send enquiry',
    autoreply: { subject: 'Thank you for your enquiry', html: '<p>Dear {{name}},</p><p>Thank you for getting in touch with {{business.name}}. Our reservations team will reply within a few hours.</p>' },
  });
  const events = buildForm({
    id: 'form-events', name: 'Events enquiry', slug: 'events-enquiry', notify, subject: 'New event enquiry from {{name}}',
    fields: [field.name(), field.email(), field.phone(), field.select('eventType', 'Type of event', ['Wedding', 'Celebration', 'Corporate retreat', 'Other'], { required: true }), field.date('eventDate', 'Preferred date'), field.number('guestCount', 'Number of guests', { min: 1, max: 1000, required: true }), field.message('Tell us about your plans'), field.consent()],
    submitLabel: 'Send event enquiry',
    rules: [{ id: 'form-events-large', name: 'Large events to the events director', enabled: true, when: { match: 'all', conditions: [{ field: 'guestCount', op: 'gt', value: 120 }] }, then: [{ type: 'email', to: [notify], subject: 'Large event enquiry ({{guestCount}} guests)' }, { type: 'tag', tags: ['large-event'] }], otherwise: [], stopProcessing: false }],
  });

  return assemble(ctx, {
    type: 'Resort',
    description: `${name} is a resort of gardens, water and unhurried service — rooms and villas, a spa, seasonal dining and celebrations.`,
    structuredData: ['Resort', 'Hotel', 'WebSite'],
    theme: 'editorial-warm',
    ogImage: 'poolTropical',
    defaultLocation: 'the coast',
    variables: { transferTime: '45 minutes' },
    menus: {
      primary: [
        navItem('nav-rooms', 'Rooms', '/rooms'),
        navItem('nav-experiences', 'Experiences', '/experiences'),
        navItem('nav-dining', 'Dining', '/dining'),
        navItem('nav-weddings', 'Weddings', '/weddings'),
        navItem('nav-gallery', 'Gallery', '/gallery'),
        navItem('nav-contact', 'Contact', '/contact'),
      ],
      'footer-explore': [
        navItem('nav-f-rooms', 'Rooms & villas', '/rooms'),
        navItem('nav-f-experiences', 'Experiences', '/experiences'),
        navItem('nav-f-dining', 'Dining', '/dining'),
        navItem('nav-f-weddings', 'Weddings & events', '/weddings'),
      ],
      'footer-visit': [
        navItem('nav-f-gallery', 'Gallery', '/gallery'),
        navItem('nav-f-enquire', 'Plan your stay', '/contact#enquire'),
        navItem('nav-f-find', 'Getting here', '/contact#visit'),
      ],
    },
    header: header({ variant: 'centered', cta: btn('Book a stay', '/contact#enquire'), showSocial: true }),
    footer: footer({ variant: 'statement', statement: 'Come for the view. Stay for the *quiet*.', cta: btn('Plan your stay', '/contact#enquire'), columns: [{ title: 'Explore', menu: 'footer-explore' }, { title: 'Visit', menu: 'footer-visit' }], newsletterHeading: 'Letters from the resort' }),
    pages,
    forms: [enquiry, events],
    collections: [roomsCollection(ROOMS, 'Rooms & villas')],
    globalSections: [bookingBar('Plan your stay', 'Best rates guaranteed when you book direct.')],
  });
}

export const hospitalityResort: Blueprint = {
  key: 'hospitality-resort',
  name: 'Resort & spa',
  description: 'Editorial resort site with a rooms collection and detail pages, experiences, dining, weddings, gallery and a booking bar.',
  category: 'hospitality',
  tags: ['resort', 'hotel', 'spa', 'rooms', 'booking', 'weddings'],
  thumbnail: photoUrl('poolTropical', 1200),
  build,
};
