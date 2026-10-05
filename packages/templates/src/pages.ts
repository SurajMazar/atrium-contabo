/**
 * Page template library: complete pages (sections + SEO) that can be added to any site.
 * Built from the section library where possible so both stay consistent. Every page has
 * exactly one h1, and links only point at '/', '/contact' or anchors on the same page.
 */
import type { NodeInput, PageInput } from '@atrium/schema';
import { img, type ImageKey } from './images';
import { getSectionTemplate } from './sections';
import type { PageTemplate } from './types';

const b = (label: string, link: string, style: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' = 'primary') => ({ label, link, style, iconPosition: 'end' as const });

/** Copy of a section template with prop overrides (and optional anchor/variant changes). */
function use(key: string, props: Record<string, unknown> = {}, extra: Partial<NodeInput> = {}): NodeInput {
  const tpl = getSectionTemplate(key);
  if (!tpl) throw new Error(`Unknown section template "${key}"`);
  const node = JSON.parse(JSON.stringify(tpl.node)) as NodeInput;
  return { ...node, ...extra, props: { ...node.props, ...props } };
}

function pageHero(variant: 'editorial' | 'split' | 'minimal' | 'fullscreen-image' | 'centered', o: { eyebrow: string; heading: string; subheading: string; buttons: ReturnType<typeof b>[]; image?: ImageKey }): NodeInput {
  const full = variant === 'fullscreen-image';
  return {
    type: 'hero',
    variant,
    props: {
      tone: full ? 'inverse' : 'default', eyebrow: o.eyebrow, heading: o.heading, subheading: o.subheading, buttons: o.buttons,
      image: o.image ? img(o.image) : undefined, imageSide: 'right', height: variant === 'minimal' ? 'auto' : 'tall', overlayOpacity: 0.4,
      spacingTop: full ? 'none' : 'xl', spacingBottom: full ? 'none' : variant === 'minimal' ? 'md' : 'lg',
    },
    animation: { preset: full ? 'cinematic-reveal' : 'editorial-reveal' },
  };
}

function h1Intro(eyebrow: string, heading: string, body: string, align: 'left' | 'center' = 'center'): NodeInput {
  return { type: 'text-section', variant: 'intro', props: { eyebrow, heading, headingLevel: 'h1', body, align, spacingTop: 'xl', spacingBottom: 'md' }, animation: { preset: 'fade-up' } };
}

function tpl(key: string, name: string, description: string, tags: string[], page: Omit<PageInput, 'status'>): PageTemplate {
  return { key, name, description, tags, page: { ...page, status: 'published' } };
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  tpl('about', 'About', 'Story, philosophy, milestones, team and numbers.', ['about', 'story', 'team'], {
    title: 'About', slug: 'about',
    seo: { title: 'About us', description: 'Our story, our philosophy and the people behind the business — how we started, what we believe in and why guests and clients keep coming back.' },
    sections: [
      pageHero('editorial', { eyebrow: 'About us', heading: 'A small team with a *big* heart', subheading: 'How we started, what we believe in and the people who make it all happen.', buttons: [b('Meet the team', '#team', 'link')], image: 'officeTeam' }),
      use('intro-two-column'),
      use('story-content-collage'),
      use('story-timeline', { tone: 'surface' }),
      use('team-grid'),
      use('stats-large'),
      use('cta-centered', { heading: 'We would love to *hear* from you' }),
    ],
  }),
  tpl('contact', 'Contact', 'Enquiry form, contact details with map and practical FAQs.', ['contact', 'form', 'map'], {
    title: 'Contact', slug: 'contact',
    seo: { title: 'Contact us', description: 'Get in touch with our team by phone, email or the enquiry form. Find our address, opening hours and directions, plus answers to common questions.' },
    sections: [
      pageHero('split', { eyebrow: 'Contact', heading: 'Let us *talk*', subheading: 'Questions, bookings or just saying hello — we reply to every message within one working day.', buttons: [b('Send an enquiry', '#enquire'), b('Find us', '#visit', 'link')], image: 'lakeJetty' }),
      use('contact-form-split'),
      use('contact-info-split'),
      use('faq-two-column', { cta: undefined }),
    ],
  }),
  tpl('rooms', 'Rooms & suites', 'Editorial room list, in-room amenities, comparison and booking FAQs.', ['hotel', 'rooms', 'hospitality'], {
    title: 'Rooms', slug: 'rooms',
    seo: { title: 'Rooms & suites', description: 'Explore our rooms and suites — sizes, beds, views and rates — with the amenities included in every stay and answers to common booking questions.' },
    sections: [
      pageHero('editorial', { eyebrow: 'Stay', heading: 'Rooms made for *resting*', subheading: 'Natural materials, generous space and quiet views. Every stay includes breakfast.', buttons: [b('Check availability', '/contact')], image: 'roomGlassSuite' }),
      use('rooms-editorial-list', { heading: 'Choose your *room*' }),
      use('amenities-icon-grid', { tone: 'surface', heading: 'In every *room*' }),
      {
        type: 'comparison-table',
        props: {
          eyebrow: 'Compare', heading: 'Find the right *fit*',
          columns: [{ label: 'Classic King', highlighted: false }, { label: 'Corner Studio', highlighted: true }, { label: 'Rooftop Suite', highlighted: false }],
          rows: [{ label: 'Size', values: ['24 m²', '32 m²', '45 m²'] }, { label: 'Guests', values: ['2', '3', '2'] }, { label: 'Sofa bed', values: ['no', 'yes', 'no'] }, { label: 'Private terrace', values: ['no', 'no', 'yes'] }],
          caption: 'All rates include breakfast and Wi-Fi.',
        },
      },
      use('faq-two-column', { tone: 'surface' }),
      use('cta-banner'),
    ],
  }),
  tpl('gallery', 'Gallery', 'Masonry and editorial galleries separated by a parallax band.', ['gallery', 'photos'], {
    title: 'Gallery', slug: 'gallery',
    seo: { title: 'Gallery', description: 'A closer look in photographs — the spaces, the details, the food and the moments in between. Browse the gallery and imagine yourself here.' },
    sections: [
      pageHero('minimal', { eyebrow: 'Gallery', heading: 'A closer *look*', subheading: 'Spaces, details and the moments in between.', buttons: [b('Plan a visit', '/contact', 'outline')] }),
      use('gallery-editorial', { eyebrow: undefined, heading: undefined, spacingTop: 'none' }),
      use('media-parallax-band'),
      use('gallery-masonry'),
      use('cta-centered', { heading: 'See it for *yourself*' }),
    ],
  }),
  tpl('faq', 'FAQ', 'Grouped questions with FAQPage structured data.', ['faq', 'help', 'seo'], {
    title: 'FAQ', slug: 'faq',
    seo: { title: 'Frequently asked questions', description: 'Answers to the questions we are asked most — bookings, payments, cancellations, accessibility, parking and more. Still unsure? Our team is happy to help.', structuredData: [{ type: 'FAQPage', auto: true }] },
    sections: [
      h1Intro('Help', 'Frequently asked *questions*', 'Everything you might want to know before you arrive. If we have missed something, we are only a message away.'),
      use('faq-two-column', { eyebrow: 'Booking', heading: 'Booking & *payments*', cta: undefined }),
      use('cta-banner', { heading: 'Still have a *question*?', subheading: 'Write to us and we will reply within a day.', buttons: [b('Contact us', '/contact')] }),
      {
        type: 'faq',
        variant: 'two-column',
        props: {
          tone: 'surface', eyebrow: 'Your visit', heading: 'During your *stay*',
          items: [
            { question: 'Is the property accessible?', answer: 'Yes — step-free access throughout the ground floor, with two fully accessible rooms. Tell us your needs and we will prepare.' },
            { question: 'Can I bring my dog?', answer: 'Well-behaved dogs are welcome in selected rooms for a small cleaning fee.' },
            { question: 'Is Wi-Fi available?', answer: 'Fast, free Wi-Fi is available throughout.' },
            { question: 'Do you offer late check-out?', answer: 'Whenever possible — just ask at reception on the morning of departure.' },
          ],
          cta: b('Ask us anything', '/contact', 'link'),
        },
      },
    ],
  }),
  tpl('pricing', 'Pricing', 'Plan cards, comparison table and billing FAQs.', ['pricing', 'plans', 'saas'], {
    title: 'Pricing', slug: 'pricing',
    seo: { title: 'Pricing & plans', description: 'Simple, transparent pricing. Compare plans side by side, see exactly what is included and find answers to common billing questions before you start.' },
    sections: [
      use('pricing-cards', { headingLevel: 'h1', heading: 'Plans for every *stage*', spacingTop: 'xl' }),
      use('pricing-comparison'),
      {
        type: 'faq',
        variant: 'accordion',
        props: {
          eyebrow: 'Billing', heading: 'Pricing *questions*', align: 'center',
          items: [
            { question: 'Can I change plans later?', answer: 'Yes — upgrade or downgrade at any time. Changes are pro-rated automatically.' },
            { question: 'Is there a free trial?', answer: 'Every paid plan includes a 14-day free trial. No card required.' },
            { question: 'Do you offer discounts?', answer: 'Annual billing saves two months. Non-profits and education receive 50% off.' },
          ],
          cta: b('Talk to us', '/contact', 'link'),
        },
      },
      use('cta-banner', { heading: 'Need a *custom* plan?', subheading: 'We will tailor a plan to your team.', buttons: [b('Contact sales', '/contact')] }),
    ],
  }),
  tpl('team', 'Team', 'Team grid with culture, numbers and an invitation to join.', ['team', 'people', 'about'], {
    title: 'Team', slug: 'team',
    seo: { title: 'Meet the team', description: 'Meet the people behind everything we do — their roles, their stories and what they love about the work. Plus how to join us if you would like to.' },
    sections: [
      pageHero('minimal', { eyebrow: 'Our people', heading: 'The people who make it *happen*', subheading: 'Experienced, curious and genuinely kind — say hello.', buttons: [b('Work with us', '/contact', 'outline')] }),
      use('team-grid', { eyebrow: undefined, heading: undefined, spacingTop: 'none' }),
      use('intro-two-column', { eyebrow: 'Culture', heading: 'How we *work* together', tone: 'surface' }),
      use('stats-large', { tone: 'default' }),
      use('cta-image-background', { eyebrow: 'Careers', heading: 'Want to *join* us?', subheading: 'We are always glad to hear from thoughtful people.', buttons: [b('Get in touch', '/contact')] }),
    ],
  }),
  tpl('blog', 'Blog', 'Journal index listing the "posts" collection, with a newsletter sign-up.', ['blog', 'journal', 'news', 'collection'], {
    title: 'Blog', slug: 'blog',
    seo: { title: 'Journal', description: 'News, stories, guides and ideas from our team — the latest updates, behind-the-scenes notes and practical advice, published regularly.' },
    sections: [
      h1Intro('Journal', 'Stories, news and *ideas*', 'Updates and behind-the-scenes notes from our team.'),
      use('collection-posts-grid', { eyebrow: undefined, heading: undefined, limit: undefined, spacingTop: 'md' }, { variant: 'featured' }),
      use('newsletter-inline'),
    ],
  }),
  tpl('services', 'Services', 'Service overview, process steps, testimonials and FAQ.', ['services', 'business', 'agency'], {
    title: 'Services', slug: 'services',
    seo: { title: 'Our services', description: 'What we do and how we do it — an overview of our services, our step-by-step process, what clients say and answers to the questions we hear most.' },
    sections: [
      pageHero('split', { eyebrow: 'Services', heading: 'Advice that turns into *results*', subheading: 'Senior people, small teams and a clear process from first conversation to delivery.', buttons: [b('Discuss your project', '/contact')], image: 'meetingRoom' }),
      use('features-alternating', { eyebrow: undefined, heading: undefined }),
      { type: 'timeline', variant: 'steps', props: { tone: 'surface', eyebrow: 'Process', heading: 'How we *work*', items: [{ date: '01', title: 'Listen', text: 'A free first conversation about your goals.' }, { date: '02', title: 'Propose', text: 'A clear, fixed proposal within a week.' }, { date: '03', title: 'Deliver', text: 'Regular check-ins and no surprises.' }, { date: '04', title: 'Support', text: 'We stay on hand after launch.' }] }, animation: { preset: 'stagger' } },
      use('testimonials-grid', { eyebrow: 'Clients', heading: 'What clients *say*' }),
      use('faq-two-column'),
      use('cta-centered', { heading: 'Let us find the right *starting point*' }),
    ],
  }),
  tpl('experiences', 'Experiences', 'Activities, a day-in-the-life story and nearby attractions.', ['hospitality', 'experiences', 'activities'], {
    title: 'Experiences', slug: 'experiences',
    seo: { title: 'Experiences & activities', description: 'Guided walks, water, wellness and food — experiences arranged by people who know the area best, plus a guide to the places worth exploring nearby.' },
    sections: [
      pageHero('fullscreen-image', { eyebrow: 'Experiences', heading: 'Slow mornings, *wild* afternoons', subheading: 'Activities and adventures arranged by our concierge.', buttons: [b('Plan your days', '/contact')], image: 'hikerClouds' }),
      use('experiences-cards'),
      use('story-sticky'),
      use('attractions-list'),
      use('cta-image-background', { heading: 'Let us plan your *days*', image: img('mountainValley') }),
    ],
  }),
  tpl('menu', 'Menu', 'Restaurant introduction, tabbed menu and reservation call to action.', ['restaurant', 'menu', 'dining', 'cafe'], {
    title: 'Menu', slug: 'menu',
    seo: { title: 'Menu', description: 'Our seasonal menu — starters, mains and desserts made with produce from local growers, with vegetarian and gluten-free choices clearly marked throughout.' },
    sections: [
      pageHero('split', { eyebrow: 'The menu', heading: 'Cooked from the *market*', subheading: 'Our menu changes with the seasons. Here is a taste of what is cooking now.', buttons: [b('See the menu', '#menu'), b('Book a table', '/contact', 'outline')], image: 'diningPlate' }),
      use('menu-tabs', { tone: 'default' }),
      use('dining-split', { tone: 'surface', eyebrow: 'Opening hours', heading: 'Join us at the *table*', buttons: [b('Reserve a table', '/contact')] }),
      use('cta-banner', { heading: 'Hungry *yet*?', subheading: 'Reservations recommended for dinner.', buttons: [b('Book a table', '/contact')] }),
    ],
  }),
  tpl('careers', 'Careers', 'Culture, benefits, open roles and an application form placeholder.', ['careers', 'jobs', 'hiring'], {
    title: 'Careers', slug: 'careers',
    seo: { title: 'Careers', description: 'Join our team. Learn about our culture and benefits, browse current openings and send us your application — we read every single one personally.' },
    sections: [
      pageHero('editorial', { eyebrow: 'Careers', heading: 'Do the best work of your *career*', subheading: 'We are a small, generous team that cares about craft, kindness and growth.', buttons: [b('See open roles', '#roles'), b('Apply', '#apply', 'link')], image: 'teamLaptops' }),
      use('intro-two-column', { eyebrow: 'Culture', heading: 'What it is *like* here' }),
      { type: 'benefits', variant: 'grid', props: { tone: 'surface', eyebrow: 'Benefits', heading: 'Looking after *you*', items: [{ title: 'Flexible hours', icon: 'clock' }, { title: 'Learning budget', icon: 'graduation-cap' }, { title: 'Health cover', icon: 'heart' }, { title: '30 days holiday', icon: 'sun' }, { title: 'Team retreats', icon: 'mountain' }, { title: 'Wellbeing days', icon: 'leaf' }], columns: 3, image: undefined }, animation: { preset: 'stagger' } },
      {
        type: 'features',
        variant: 'list',
        anchor: 'roles',
        props: {
          eyebrow: 'Open roles', heading: 'Current *openings*',
          items: [
            { eyebrow: 'Full-time · On site', title: 'Guest Experience Manager', text: 'Lead a small front-of-house team and shape every guest’s stay.', link: '#apply', linkLabel: 'Apply' },
            { eyebrow: 'Full-time · Hybrid', title: 'Marketing Coordinator', text: 'Tell our story across social, email and partnerships.', link: '#apply', linkLabel: 'Apply' },
            { eyebrow: 'Part-time · On site', title: 'Pastry Chef', text: 'Early mornings, good butter and a kitchen that values craft.', link: '#apply', linkLabel: 'Apply' },
          ],
          columns: 1,
        },
      },
      use('contact-form-split', { eyebrow: 'Apply', heading: 'Send us your *application*', subheading: 'Tell us about yourself and the role you are interested in. Connect an application form after inserting this page.', image: img('officeTeam', { width: 1600 }) }, { anchor: 'apply' }),
    ],
  }),
  tpl('offers', 'Offers & packages', 'Featured offers, book-direct benefits and terms.', ['offers', 'packages', 'hotel', 'deals'], {
    title: 'Offers', slug: 'offers',
    seo: { title: 'Offers & packages', description: 'Special offers and packages for longer stays, spa escapes and romantic weekends — plus the extra benefits you receive when you book directly with us.' },
    sections: [
      pageHero('minimal', { eyebrow: 'Offers', heading: 'Reasons to stay *longer*', subheading: 'Seasonal packages and our best rates, only when you book direct.', buttons: [b('Enquire', '/contact', 'outline')] }),
      use('offers-cards', { eyebrow: undefined, heading: undefined, spacingTop: 'none' }, { variant: 'featured' }),
      { type: 'benefits', variant: 'grid', props: { tone: 'surface', eyebrow: 'Book direct', heading: 'Only when you book *with us*', items: [{ title: 'Best rate guaranteed', icon: 'badge-check' }, { title: 'Flexible cancellation', icon: 'calendar-check' }, { title: 'Welcome drink', icon: 'wine' }, { title: 'Late check-out on request', icon: 'clock' }], columns: 4, image: undefined } },
      use('faq-two-column', { eyebrow: 'Terms', heading: 'Offer *details*', items: [{ question: 'Can offers be combined?', answer: 'Offers cannot be combined with each other, but all include our book-direct benefits.' }, { question: 'Are offers refundable?', answer: 'Most offers have free cancellation up to 14 days before arrival; terms are shown when you book.' }, { question: 'Do offers apply on holidays?', answer: 'Some dates are excluded — ask us and we will find the best alternative.' }] }),
      use('cta-image-background', { heading: 'Your next *escape* starts here' }),
    ],
  }),
  tpl('venue', 'Venue & spaces', 'Spaces with capacities, amenities, gallery and an enquiry form placeholder.', ['venue', 'events', 'weddings', 'meetings'], {
    title: 'Venue', slug: 'venue',
    seo: { title: 'Venue & event spaces', description: 'Explore our event spaces with capacities for ceremonies, dinners, meetings and receptions — see what is included and enquire about availability for your date.' },
    sections: [
      use('hero-carousel-wedding', { eyebrow: 'Venue hire', heading: 'Spaces for every *occasion*', subheading: 'Weddings, celebrations, meetings and private dinners.', buttons: [b('Explore the spaces', '#spaces'), b('Enquire', '#enquire', 'outline')] }),
      use('venues-detailed'),
      { type: 'amenities', variant: 'list', props: { tone: 'surface', eyebrow: 'Included', heading: 'Thoughtfully *equipped*', items: [{ icon: 'utensils', title: 'In-house catering' }, { icon: 'wine', title: 'Bar & sommelier' }, { icon: 'music', title: 'Sound & lighting' }, { icon: 'presentation', title: 'Screens & VC' }, { icon: 'circle-parking', title: 'Free parking' }, { icon: 'accessibility', title: 'Step-free access' }], columns: 3 } },
      use('gallery-masonry', { eyebrow: 'Gallery', heading: 'Recent *events*' }),
      use('contact-form-split', { eyebrow: 'Enquire', heading: 'Check *availability*', subheading: 'Share your date, guest numbers and ideas. Connect an events form after inserting this page.', image: img('weddingTable', { width: 1600 }) }),
    ],
  }),
  tpl('events', 'Events', 'Upcoming events list, a featured event and newsletter sign-up.', ['events', 'calendar', 'whats on'], {
    title: 'Events', slug: 'events',
    seo: { title: 'Upcoming events', description: 'See what is on: supper clubs, celebrations, wellness weeks and community gatherings. Browse upcoming dates and join our list to hear about new events first.' },
    sections: [
      pageHero('split', { eyebrow: 'What’s on', heading: 'Gatherings worth *marking* in the diary', subheading: 'Supper clubs, celebrations, workshops and seasonal festivals.', buttons: [b('See upcoming dates', '#upcoming'), b('Host your own event', '/contact', 'link')], image: 'toastLights' }),
      use('events-list', { eyebrow: undefined, heading: 'Upcoming *dates*' }, { anchor: 'upcoming' }),
      use('media-parallax-band', { image: img('mingling'), eyebrow: 'Private events', heading: 'Planning a *celebration* of your own?', text: 'Our team hosts private parties, dinners and meetings all year round.', buttons: [b('Enquire', '/contact', 'secondary')] }),
      use('newsletter-inline', { heading: 'Hear about new events first' }),
    ],
  }),
  tpl('privacy', 'Privacy policy', 'Plain-language privacy policy placeholder.', ['legal', 'privacy', 'policy'], {
    title: 'Privacy policy', slug: 'privacy',
    seo: { title: 'Privacy policy', description: 'How we collect, use and protect the personal information you share through this website, our forms and our newsletter — and the choices you have.' },
    sections: [
      { type: 'text-section', variant: 'intro', props: { eyebrow: 'Legal', heading: 'Privacy *policy*', headingLevel: 'h1', body: 'This policy explains what information {{business.name}} collects, why we collect it and the choices you have. Replace this placeholder with your own policy before publishing.', align: 'left', containerWidth: 'narrow', spacingTop: 'xl', spacingBottom: 'md' } },
      {
        type: 'section',
        props: { containerWidth: 'narrow', spacingTop: 'none', spacingBottom: 'xl' },
        children: [{
          type: 'rich-text',
          props: {
            html: '<h2>Information we collect</h2><p>When you contact us, book or subscribe we collect the details you provide, such as your name, email address and message. We also collect anonymous usage statistics.</p><h2>How we use it</h2><p>Only to respond to you, provide the services you request and — with your consent — send occasional news. We never sell your data.</p><h2>Cookies</h2><p>Essential cookies keep the site working. Analytics and marketing cookies are set only with your consent.</p><h2>Your rights</h2><p>You can ask to see, correct or delete your information at any time by contacting {{business.email | us}}.</p>',
          },
        }],
      },
    ],
  }),
];

export function getPageTemplate(key: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((p) => p.key === key);
}
