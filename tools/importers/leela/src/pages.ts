/**
 * The eight pages + 404, in the order and composition of src/app/<page>/page.tsx.
 * Copy that lives in page JSX (not in data/) is transcribed here verbatim; `name` is the
 * site's display name (the only systematic difference between the two builds).
 */
import { box, button, divider, eyebrow, fadeUp, heading, lineReveal, node, section, setScope, text, type N } from './nodes.ts';
import type { Ctx } from './context.ts';
import { breadcrumb, bentoGrid, contactLink, ctaBand, eventTypeGrid, facilityStrip, galleryGrid, galleryPreview, grid12, col, homeHero, iconGrid, intro, locationBlock, mq, MD, packages, pageHero, quote, scrollStory, splitFeature, statBand, videoGallery, type Treatment } from './sections.ts';

const by = <T extends { slug: string }>(list: T[], slug: string) => list.find((x) => x.slug === slug)!;

export function homePage(c: Ctx): N[] {
  setScope('home');
  const d = c.data;
  const name = d.SITE.name;
  const HALL = by(d.SPACES, 'grand-hall');
  const TERRACE = by(d.SPACES, 'terrace');
  return [
    homeHero(c),
    intro(c, {
      eyebrow: 'About Us',
      title: 'Where Every Celebration Becomes a Memory',
      body: [
        `Welcome to ${name} — a luxury banquet venue dedicated to weddings, receptions, engagements, birthdays and corporate events, hosted with exceptional service and an unusual attention to detail.`,
        'Our kitchen is in the same building. Valet parking takes ninety cars, and there is room for two hundred two-wheelers. Everything your evening needs is on one site, run by one team — which is why the evening runs.',
      ],
      link: { href: c.pageLink('about'), label: 'Read Our Story' },
    }),
    statBand(c, d.HEADLINE_STATS),
    splitFeature(c, { eyebrow: HALL.eyebrow, title: HALL.title, body: HALL.body, detail: HALL.detail, image: HALL.image, imageHeight: 'tall', link: { href: c.pageLink('venue'), label: 'Explore the Venue' } }, { tone: 'surface' }),
    splitFeature(c, { treatment: 'double', eyebrow: TERRACE.eyebrow, title: TERRACE.title, body: TERRACE.body, detail: TERRACE.detail, image: TERRACE.image, reverse: true }),
    scrollStory(c, {
      eyebrow: 'The Wedding Experience',
      title: 'A Day, In Sequence',
      stages: d.WEDDING_STAGES.filter((s: { slug: string }) => ['ceremony', 'reception', 'dining'].includes(s.slug)),
      link: { href: c.pageLink('weddings'), label: 'The Full Wedding Experience' },
    }, { tone: 'surface-alt' }),
    eventTypeGrid(c, { eyebrow: 'Our Events', title: 'Celebrate Every Occasion', lead: 'Weddings and receptions, corporate evenings, birthdays and engagements — the same spaces, dressed for the occasion.', linkTo: '/events' }),
    packages(c, {}, { tone: 'surface' }),
    galleryPreview(c),
    facilityStrip(c),
    iconGrid(c, { eyebrow: 'Our Services', title: 'What We Offer', lead: 'Everything under one roof, run by one team.', items: d.SERVICES }, { tone: 'surface' }),
    quote(c),
    locationBlock(c),
    ctaBand(c, {
      title: 'Reserve Your Event',
      lead: 'Tell us the date and the numbers, and we will tell you what the evening could look like. Our team replies within one working day.',
      action: { href: c.pageLink('contact'), label: 'Enquire Now' },
      secondary: { href: c.pageLink('gallery'), label: 'See the Gallery' },
      image: 'crest-night',
    }),
  ];
}

const PILLARS = [
  { title: 'Uncompromising Luxury', body: 'From the architecture down to the linen, every element is chosen to hold its own in a photograph and in person.', icon: 'diamond' },
  { title: 'Meticulous Detail', body: 'Dedicated coordinators, carefully planned timelines, and an experienced team committed to making your special occasion seamless and memorable.', icon: 'team' },
  { title: 'Elevated Experience', body: 'We do not simply host events. We build the evening around the people it is for.', icon: 'glasses' },
];

export function aboutPage(c: Ctx): N[] {
  setScope('about');
  const name = c.data.SITE.name;
  return [
    pageHero(c, { page: 'about', crumb: 'About', eyebrow: `About ${name}`, title: 'The Art of Celebration', lead: 'A luxury banquet estate in Kathmandu, built for the evenings people remember for the rest of their lives.', image: 'crest-night' }),
    splitFeature(c, {
      eyebrow: 'Our Heritage',
      title: 'A Legacy of Grandeur',
      body: [
        `Welcome to ${name}, where every celebration becomes a cherished memory. We are a luxury banquet venue dedicated to hosting weddings, receptions, engagements, birthdays, corporate events and special occasions with exceptional service and attention to detail.`,
        'Our venue accommodates up to 800 guests and offers premium catering, modern facilities, valet parking and professional event management. We believe in marrying timeless elegance with modern sophistication — and in the unglamorous operational discipline that makes elegance possible on the night.',
      ],
      image: 'facade-daylight',
      imageHeight: 'tall',
      link: { href: c.pageLink('venue'), label: 'Discover Our Spaces' },
    }),
    iconGrid(c, { eyebrow: 'Our Standards', title: 'The Pillars of Perfection', items: PILLARS }, { tone: 'surface-alt' }),
    quote(c),
    splitFeature(c, {
      eyebrow: 'Our Kitchen',
      title: 'Cooked Here, Served Here',
      body: [
        'Our kitchens are in the same building as the hall — vegetarian and non-vegetarian, staffed by our own team. It is the least glamorous fact about the venue and the one that most affects your evening.',
        'Menus are assembled with you rather than handed to you, and served from glimmering counters under brass lamps by people who work here every week.',
      ],
      image: 'catering-service',
      treatment: 'notch',
      reverse: true,
    }),
    statBand(c, c.data.HEADLINE_STATS, { tone: 'surface' }),
    ctaBand(c, {
      title: 'Come and See It',
      lead: 'Words and photographs only go so far. Walk the hall, stand on the stage, and picture your own evening in it.',
      action: { href: c.pageLink('contact'), label: 'Arrange a Visit' },
      secondary: { href: c.pageLink('gallery'), label: 'See the Gallery' },
      image: 'banquet-hall',
    }),
  ];
}

const SPACE_TREATMENTS: Treatment[] = ['arch', 'notch', 'scallop', 'square'];

export function venuePage(c: Ctx): N[] {
  setScope('venue');
  const d = c.data;
  return [
    pageHero(c, { page: 'venue', crumb: 'Venue', eyebrow: 'The Estate', title: 'Spaces For The Occasion', lead: 'We have several spaces that work together across one evening — arrival, ceremony, dinner and the quiet hour afterwards.', image: 'banquet-hall' }),
    intro(c, {
      eyebrow: 'The Canvas',
      title: 'Architectural Rigour, Space to Breathe',
      body: [
        'The hall is laid out in two sections — dining on one side, snacks on the other, with a wall between them — so the two halves of an evening can run at once without either getting in the way of the other.',
        'Around it sit the spaces that make an evening work: a lit bar for arrivals, a VIP lounge off the hall, glimmering counters for the dining, and an open terrace for the part of the night that wants to be outdoors.',
      ],
    }),
    statBand(c, d.CAPACITY_STATS),
    ...d.SPACES.map((space: { slug: string; eyebrow: string; title: string; body: string; detail: string[]; image: string }, index: number) =>
      splitFeature(c, {
        eyebrow: space.eyebrow,
        title: space.title,
        body: space.body,
        detail: space.detail,
        image: space.image,
        reverse: index % 2 === 1,
        imageHeight: index === 0 ? 'tall' : 'standard',
        treatment: SPACE_TREATMENTS[index % SPACE_TREATMENTS.length],
      }, { tone: index % 2 === 0 ? 'surface' : 'default', anchor: space.slug }),
    ),
    facilityStrip(c, { tone: 'surface-alt', anchor: 'facilities' }),
    iconGrid(c, { eyebrow: 'Our Services', title: 'What We Offer', items: d.SERVICES }),
    ctaBand(c, {
      title: 'See the Scale For Yourself',
      lead: c.cfg.copy.venueCtaLead,
      action: { href: c.pageLink('contact'), label: 'Book a Viewing' },
      secondary: { href: c.pageLink('weddings'), label: 'Weddings' },
      image: 'wedding-stage',
    }),
  ];
}

export function weddingsPage(c: Ctx): N[] {
  setScope('weddings');
  const d = c.data;
  return [
    pageHero(c, { page: 'weddings', crumb: 'Weddings', eyebrow: 'The Wedding Experience', title: 'The Royal Wedding', lead: 'A celebration of unparalleled grandeur, held in one place, run by one team, from the first arrival to the last photograph.', image: 'wedding-stage', clip: true }),
    intro(c, {
      eyebrow: 'Exquisite Celebrations',
      title: 'One Address For The Whole Day',
      body: [
        'The haldi and mehendi on the terrace, the ceremony on the stage, the reception in the hall — without moving your guests across Kathmandu between them.',
        'Every part of the day has a space built for it, and the turnaround between them happens while your guests are outside with a drink in their hand.',
      ],
      link: { href: c.pageLink('contact'), label: 'Check Your Date' },
    }),
    scrollStory(c, { eyebrow: 'The Day', title: 'The Experience', stages: d.WEDDING_STAGES }, { tone: 'surface' }),
    bentoGrid(c, { eyebrow: 'Curated Inclusions', title: 'What a Wedding Here Includes', lead: 'Spaces designed with intentional symmetry and cinematic framing — and the practical things that decide whether an evening runs.', items: d.WEDDING_INCLUSIONS }),
    packages(c, {}, { tone: 'surface-alt' }),
    quote(c),
    ctaBand(c, {
      title: 'Begin Your Legacy',
      lead: 'Tell us your date and your numbers. We will come back with availability, a menu and what the evening could look like.',
      action: { href: c.pageLink('contact'), label: 'Enquire About Your Date' },
      secondary: { href: c.pageLink('gallery'), label: 'Wedding Photographs' },
      image: 'table-centerpiece',
    }),
  ];
}

export function eventsPage(c: Ctx): N[] {
  setScope('events');
  const d = c.data;
  return [
    pageHero(c, { page: 'events', crumb: 'Events', eyebrow: 'Our Events', title: 'Every Kind of Gathering', lead: 'The same spaces, dressed for the occasion — from a board dinner to a full reception.', image: 'table-centerpiece' }),
    intro(c, {
      eyebrow: 'The Range',
      title: 'Built To Be Redressed',
      body: [
        'A venue that only does weddings is a venue that looks like a wedding at your product launch. Ours is deliberately neutral in its bones: charcoal, cream and brass, with the character supplied by how it is dressed.',
        'The LED wall carries your brand or the couple’s film. The lighting shifts to suit. The menu is rebuilt each time. What stays the same is the hall, the valet parking and the team.',
      ],
    }),
    eventTypeGrid(c, { eyebrow: 'Occasions', title: 'Celebrate Every Occasion', lead: 'Six kinds of evening we run most often.', detailed: true }, { tone: 'surface' }),
    packages(c, { href: '/packages' }),
    facilityStrip(c, { tone: 'surface-alt', anchor: 'facilities' }),
    iconGrid(c, { eyebrow: 'Our Services', title: 'What We Offer', items: d.SERVICES }),
    ctaBand(c, {
      title: "Let's Plan Your Event",
      lead: 'Send us the date, the numbers and the kind of evening you have in mind. We reply within one working day.',
      action: { href: c.pageLink('contact'), label: 'Enquire Now' },
      secondary: { href: c.pageLink('venue'), label: 'See the Venue' },
      image: 'bar-lounge',
    }),
  ];
}

const HOW_IT_WORKS = [
  { title: 'Choose the package', body: 'Silver or Platinum. The difference is the number of items and the salad bar, not the standard of the cooking.', icon: 'menu-card' },
  { title: 'Build the menu with us', body: 'The totals are fixed; the dishes are not. You pick what fills them, vegetarian and non-vegetarian, with our chef.', icon: 'dining' },
  { title: 'Confirm the numbers', body: 'Pricing is per person, so the final figure follows your guest count. We confirm it before anything is ordered.', icon: 'guests' },
  { title: 'Taste before you commit', body: 'Arrange a tasting ahead of the date and change anything that is not right while there is still time to change it.', icon: 'glasses' },
];

export function packagesPage(c: Ctx): N[] {
  setScope('packages');
  const [silver, platinum] = c.data.PACKAGES;
  return [
    pageHero(c, { page: 'packages', crumb: 'Packages', eyebrow: 'Our Packages', title: 'Wedding & Event Menus', lead: 'Two dining packages, priced per person and cooked in our own kitchen. Both are built with you rather than handed to you.', image: 'buffet-counter' }),
    intro(c, {
      eyebrow: 'The Approach',
      title: 'A Fixed Count, Not a Fixed Menu',
      body: [
        `Each package is quoted as a total number of food items — ${silver?.total ?? 43} on Silver, ${platinum?.total ?? 48} on Platinum — spread across snacks, main course, desserts and the salad and pickle bar.`,
        'What fills those items is settled with you. Vegetarian and non-vegetarian kitchens sit under the same roof as the hall, so what leaves the pass arrives at the counter still hot, and a menu built for a mehendi looks nothing like one built for an annual dinner.',
      ],
    }),
    packages(c, {}, { tone: 'surface' }),
    iconGrid(c, { eyebrow: 'How It Works', title: 'From Package to Plate', items: HOW_IT_WORKS }),
    ctaBand(c, {
      title: 'Ask Us For a Quote',
      lead: 'Tell us your date, your numbers and which package you are leaning towards. We reply within one working day with a full quotation.',
      action: { href: c.pageLink('contact'), label: 'Enquire Now' },
      secondary: { href: c.pageLink('gallery'), label: 'See the Gallery' },
      image: 'buffet-tiered',
    }),
  ];
}

export function galleryPage(c: Ctx): N[] {
  setScope('gallery');
  return [
    pageHero(c, { page: 'gallery', crumb: 'Gallery', eyebrow: 'Our Gallery', title: 'Curated Moments', lead: 'A visual anthology of celebrations, quiet corners and grand affairs hosted within the estate — on film and in photographs.' }),
    videoGallery(c),
    galleryGrid(c),
    ctaBand(c, {
      title: 'Your Evening, Next',
      lead: "Every photograph here was somebody's date in the diary. Tell us yours.",
      action: { href: c.pageLink('contact'), label: 'Enquire Now' },
      image: 'terrace-firepit',
    }),
  ];
}

export function contactPage(c: Ctx, formId: string): N[] {
  setScope('contact');
  const C = c.data.CONTACT;
  const small = (t: string) => text(t, 'sm', { css: '&{font-family:var(--a-font-body);font-size:.8125rem;line-height:1.125rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--lg-stone)}' });
  const linkList = (links: N[]) => box(links, { css: '&{margin-top:1.25rem;display:flex;flex-direction:column;align-items:flex-start;gap:.75rem}' });
  const left = box([
    breadcrumb(c, 'Contact', 'dark', { anim: fadeUp(12), css: '&{margin-bottom:1.5rem}' }),
    eyebrow('Contact Us', { anim: fadeUp(16, 0.08) }),
    heading('Let’s Plan Your Celebration', 'h1', 'lg', { anim: lineReveal(), css: '&{margin-top:1.25rem}' }),
    divider({ anim: fadeUp(16), css: '&{margin:1.5rem 0 0}' }),
    text('Send us your date and your numbers and we will come back with availability, a menu and what the evening could look like. A member of our team replies within one working day.', 'lg', { anim: fadeUp(20), css: '&{margin-top:2rem;max-width:28rem}' }),
    box([
      small('Or reach us directly'),
      linkList([
        contactLink(C.landline, { type: 'tel', phone: C.landline }, 'phone', 17),
        contactLink(C.mobile, { type: 'tel', phone: C.mobile }, 'phone', 17),
        contactLink('WhatsApp', { type: 'whatsapp', phone: C.whatsapp, message: C.whatsappMessage }, 'whatsapp', 17),
        contactLink(C.email, { type: 'email', email: C.email }, 'mail', 17),
      ]),
    ], { id: 'lg-contact-direct', anim: fadeUp(16), css: '&{margin-top:2.5rem}' }),
    box([
      small('Follow us'),
      linkList(c.data.SOCIAL.map((s: { label: string; href: string; icon: string }) => contactLink(s.label, { type: 'url', href: s.href, newTab: true }, s.icon, 17))),
    ], { anim: fadeUp(16), css: '&{margin-top:2.5rem}' }),
  ], { css: col(5) });
  const form = node('form', {
    tone: 'transparent', containerWidth: 'full', spacingTop: 'none', spacingBottom: 'none',
    formId, eyebrow: '', heading: '', subheading: '', showContactDetails: false, headingLevel: 'h2',
  }, undefined, {
    id: 'lg-inquiry',
    variant: 'stacked',
    name: 'Inquiry form',
    css: '& .a-fm__submit::after{content:"We reply within one working day.";font-size:.8125rem;line-height:1.125rem;color:var(--lg-stone)}& .a-container{max-width:none;padding:0}',
  });
  return [
    section([
      box([left, box([form], { css: col(7) })], { css: grid12('3.5rem') }),
    ], { name: 'Enquire', anchor: 'enquire', top: 'none', style: { padding: { base: 'calc(var(--lg-nav-h) + 3rem) 0 6rem', mobile: 'calc(var(--lg-nav-h) + 3rem) 0 4rem' } } }),
    locationBlock(c, { tone: 'surface' }),
  ];
}

export function notFoundPage(c: Ctx): N[] {
  setScope('nf');
  const nav = box(c.data.NAV.map((item: { label: string; href: string }) => button(item.label, item.href, 'ghost')), {
    tag: 'nav',
    css: '&{margin-top:3rem;display:flex;flex-direction:row;flex-wrap:wrap;column-gap:2rem;row-gap:1rem}& .a-btn.a-btn{font-size:.875rem;line-height:1.25rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;--b-fg:var(--lg-stone);border-bottom:1px solid transparent!important;border-radius:0;transition:color .3s,border-color .3s}& .a-btn.a-btn:hover{--b-fg:var(--lg-gold-ink);border-bottom-color:var(--lg-gold-ink)!important}',
  });
  return [
    section([
      box([
        eyebrow('404'),
        heading('This Page Does Not Exist', 'h1', 'display', { css: '&{margin-top:1.5rem}' }),
        divider({ css: '&{margin:2rem 0 0}' }),
        text('The page you were looking for has moved or was never here. Everything else is a click away.', 'lg', { css: '&{margin-top:2rem;max-width:36rem}' }),
        nav,
        box([button('Back to the Estate', c.pageLink('home'), 'primary', { size: 'lg' })], { css: '&{margin-top:3.5rem;align-items:flex-start}' }),
      ], { css: '&{min-height:80vh;display:flex;flex-direction:column;justify-content:center;padding:8rem 0}' }),
    ], { name: 'Not found', top: 'none' }),
  ];
}

export { mq, MD };
