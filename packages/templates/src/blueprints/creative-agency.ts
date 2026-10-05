import { photoUrl } from '../images';
import type { Blueprint, BlueprintInput } from '../types';
import { projectDetailPage, projectsCollection, type ProjectSeed } from './projects';
import {
  anim, assemble, btn, buildForm, contactPage, contextOf, ctaSection, faqSection, field, footer, header, heroCopy, homeTitle, img,
  metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type Section,
} from './shared';

const PROJECTS: ProjectSeed[] = [
  { slug: 'northfield-rebrand', name: 'Northfield', client: 'Northfield Co.', category: 'Brand identity', year: '2026', summary: 'A confident new identity for a 60-year-old outdoor brand finding a younger audience.', description: 'Northfield had heritage but felt dated. We rebuilt the brand from its archive — a refined wordmark, an earthy palette and a photographic style rooted in real expeditions.\n\nThe relaunch lifted direct sales by 38% in its first season.', image: 'abstractWaves', gallery: ['designSwatches', 'tabletDesign', 'studioLoft'] },
  { slug: 'halcyon-digital', name: 'Halcyon', client: 'Halcyon Hotels', category: 'Digital product', year: '2026', summary: 'A booking experience that feels as calm as the hotels themselves.', description: 'We designed and built a new website and booking flow for a group of boutique hotels, cutting booking steps from seven to three.\n\nDirect bookings rose 52% year on year.', image: 'hotelDusk', gallery: ['roomWhite', 'poolInfinity', 'workspace'] },
  { slug: 'meridian-campaign', name: 'Meridian', client: 'Meridian Bank', category: 'Campaign', year: '2025', summary: 'An integrated campaign making everyday banking feel human again.', description: 'A film, outdoor and social campaign built around real customer stories, with a sonic identity to match.\n\nAwareness among under-35s doubled in six months.', image: 'abstractGradient', gallery: ['teamPresentation', 'skylineSunset', 'officeTeam'] },
  { slug: 'verde-packaging', name: 'Maison Verde', client: 'Maison Verde', category: 'Packaging', year: '2025', summary: 'Plastic-free packaging and a playful identity for a plant-based skincare line.', description: 'From naming to shelf, we created a packaging system that is fully recyclable and impossible to miss.\n\nThe range sold out in its first month of retail.', image: 'abstractFluid', gallery: ['designSwatches', 'spaOil', 'florals'] },
];

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'We make brands people *remember*', 'An independent studio for identity, digital products and campaigns — for companies who would rather be loved than merely noticed.');

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'minimal',
      props: { eyebrow: '{{business.name}} — creative studio', heading: hero.heading, subheading: hero.subheading, buttons: [btn('See our work', '/work'), btn('Start a project', '/contact#enquire', 'outline')], height: 'tall', contentPosition: 'left', showScrollCue: true, spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.words,
    },
    {
      type: 'collection-list',
      variant: 'featured',
      props: { eyebrow: 'Selected work', heading: 'Recent *projects*', collection: 'projects', limit: 4, columns: 2, imageAspect: '4:3', linkLabel: 'View project', buttons: [btn('All work', '/work', 'outline')] },
      animation: anim.stagger,
    },
    {
      type: 'marquee',
      props: { items: [{ text: 'Brand identity' }, { text: 'Digital products' }, { text: 'Campaigns' }, { text: 'Packaging' }, { text: 'Motion' }], separator: '✦', speed: 36, size: 'xl', italic: true, tone: 'inverse', spacingTop: 'md', spacingBottom: 'md' },
    },
    {
      type: 'features',
      variant: 'list',
      props: {
        eyebrow: 'What we do', heading: 'Four disciplines, *one* team', numbered: true,
        items: [
          { title: 'Brand identity', text: 'Strategy, naming, visual identity and guidelines that scale.' },
          { title: 'Digital products', text: 'Websites, apps and design systems — designed and built in-house.' },
          { title: 'Campaigns', text: 'Integrated ideas across film, social, outdoor and experiential.' },
          { title: 'Packaging', text: 'Sustainable packaging that earns its place on the shelf.' },
        ],
        columns: 2, buttons: [btn('Our services', '/services', 'link')],
      },
      animation: anim.stagger,
    },
    {
      type: 'logo-cloud',
      variant: 'grid',
      props: { tone: 'surface', eyebrow: 'Clients & collaborators', align: 'center', logos: [{ name: 'Northfield' }, { name: 'Halcyon' }, { name: 'Meridian' }, { name: 'Maison Verde' }, { name: 'Atlas Journal' }, { name: 'Kestrel' }], columns: 6, grayscale: true },
    },
    testimonialsSection([
      { quote: 'They understood our business better than some of our own team. The new brand has changed how customers see us.', author: 'Founder', role: 'Outdoor apparel brand' },
      { quote: 'Fast, thoughtful and genuinely fun to work with. The product they shipped is the best thing we have launched.', author: 'Head of Digital', role: 'Hospitality group' },
    ], { variant: 'single', tone: 'default', eyebrow: 'Client words' }),
    ctaSection({ eyebrow: 'New business', heading: 'Got a brief? *Let us talk.*', subheading: 'We take on a handful of new projects each quarter.', buttons: [btn('Start a project', '/contact#enquire')], variant: 'centered', tone: 'primary' }),
  ];

  const work: Section[] = [
    {
      type: 'text-section',
      variant: 'intro',
      props: { eyebrow: 'Work', heading: 'Selected *projects*', headingLevel: 'h1', body: 'Identity, digital and campaign work for brands we believe in.', align: 'left', spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.text,
    },
    { type: 'collection-list', variant: 'grid', props: { collection: 'projects', columns: 2, imageAspect: '4:3', linkLabel: 'View project', spacingTop: 'md' }, animation: anim.stagger },
    ctaSection({ heading: 'Your project could be *next*', buttons: [btn('Start a project', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const services: Section[] = [
    {
      type: 'hero',
      variant: 'split',
      props: { eyebrow: 'Services', heading: 'Strategy, design and *craft*', subheading: 'We work in small, senior teams — strategists, designers and developers side by side from day one.', buttons: [btn('Start a project', '/contact#enquire')], image: img('designSwatches'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'features',
      variant: 'alternating',
      props: {
        items: [
          { image: img('designSwatches', { width: 1600 }), eyebrow: 'Brand', title: 'Brand identity', text: 'Positioning, naming, logo and visual systems, tone of voice and guidelines your team will actually use.' },
          { image: img('tabletDesign', { width: 1600 }), eyebrow: 'Digital', title: 'Websites & products', text: 'UX, interface design and front-end development, from marketing sites to complex product design systems.' },
          { image: img('teamPresentation', { width: 1600 }), eyebrow: 'Campaigns', title: 'Integrated campaigns', text: 'Creative platforms that work across film, social, outdoor and retail — and the production to bring them to life.' },
        ],
        imageAspect: '4:3',
      },
      animation: anim.fadeUp,
    },
    {
      type: 'timeline',
      variant: 'steps',
      props: { tone: 'surface', eyebrow: 'Process', heading: 'How we *work*', items: [{ date: '01', title: 'Discover', text: 'Workshops, research and a sharp brief.' }, { date: '02', title: 'Define', text: 'Strategy and a creative direction to rally around.' }, { date: '03', title: 'Design', text: 'Ideas, iterations and a system that scales.' }, { date: '04', title: 'Deliver', text: 'Launch, guidelines and ongoing support.' }] },
      animation: anim.stagger,
    },
    faqSection([
      { question: 'What does a typical project cost?', answer: 'Identity projects usually start from $25,000 and digital products from $40,000. We always share a fixed proposal before starting.' },
      { question: 'How long does a project take?', answer: 'Most brand projects take 8–12 weeks; websites 10–16 weeks depending on scope.' },
      { question: 'Do you work with start-ups?', answer: 'Yes — we reserve time each year for early-stage companies with a clear mission.' },
    ]),
    ctaSection({ heading: 'Tell us what you are *making*', buttons: [btn('Start a project', '/contact#enquire')], image: 'abstractWaves' }),
  ];

  const studio: Section[] = [
    {
      type: 'hero',
      variant: 'text-overlay',
      props: { eyebrow: 'Studio', heading: 'A small team with *big* opinions', subheading: 'Designers, writers, strategists and developers working from one light-filled studio.', buttons: [btn('Join us', '/contact#enquire', 'outline')], image: img('studioLoft'), height: 'tall', spacingTop: 'none', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'text-section',
      variant: 'two-column',
      props: { eyebrow: 'Our belief', heading: 'Good design is *generous*', body: 'It respects the people who use it, the planet it is made on and the businesses that pay for it. We would rather do fewer things beautifully than many things adequately.\n\nThat is why we stay small, partner closely with our clients and never hand projects to juniors once the pitch is won.', align: 'left' },
      animation: anim.fadeUp,
    },
    {
      type: 'team',
      variant: 'grid',
      props: {
        tone: 'surface', eyebrow: 'People', heading: 'The *studio*',
        members: [
          { name: 'Ava Lindqvist', role: 'Creative Director', photo: img('portraitW2', { width: 800 }), links: [] },
          { name: 'Tomás Reyes', role: 'Design Director', photo: img('portraitM2', { width: 800 }), links: [] },
          { name: 'Noor Haddad', role: 'Strategy Lead', photo: img('portraitW6', { width: 800 }), links: [] },
          { name: 'Kai Nakamura', role: 'Technical Director', photo: img('portraitM4', { width: 800 }), links: [] },
        ],
        columns: 4, portraitAspect: '4:5',
      },
      animation: anim.stagger,
    },
    {
      type: 'stats',
      variant: 'cards',
      props: { items: [{ value: '12', label: 'Years independent' }, { value: '14', label: 'People in the studio' }, { value: '30', suffix: '+', label: 'Industry awards' }, { value: '90', suffix: '%', label: 'Repeat clients' }], columns: 4 },
      animation: anim.stagger,
    },
    ctaSection({ heading: 'Come and say *hello*', subheading: 'We are always happy to meet for coffee in the studio.', buttons: [btn('Get in touch', '/contact#enquire')], variant: 'banner', tone: 'surface' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Creative studio'), seoDescription: metaDescription(`${name} is an independent creative studio for brand identity, digital products, campaigns and packaging.`), sections: home }),
    page({ title: 'Work', slug: 'work', seoTitle: metaTitle('Work', name), seoDescription: metaDescription(`Selected brand identity, digital product, campaign and packaging projects by ${name}.`), sections: work }),
    projectDetailPage({ listPath: '/work', contactLink: '/contact#enquire', ctaHeading: 'Have a project like *this*?' }),
    page({ title: 'Services', slug: 'services', seoTitle: metaTitle('Services', name), seoDescription: metaDescription(`Brand identity, websites and digital products, and integrated campaigns from ${name}, delivered by small senior teams.`), sections: services }),
    page({ title: 'Studio', slug: 'studio', seoTitle: metaTitle('Studio', name), seoDescription: metaDescription(`Meet the designers, strategists and developers at ${name}, and learn how we think about generous, lasting design.`), sections: studio }),
    contactPage({
      name, formId: 'form-enquiry', heroImage: 'studioLoft', heroVariant: 'minimal', heading: 'Start a *project*', intro: 'Tell us about your brand, your goals and your timeline. We reply to every brief within two working days.',
      formHeading: 'Tell us about your *brief*', formSubheading: 'A few details help us bring the right people to our first conversation.',
      seoDescription: metaDescription(`Start a project with ${name}. Share your brief for brand, digital or campaign work and we will reply within two working days.`),
    }),
    privacyPage(name),
  ];

  const enquiry = buildForm({
    id: 'form-enquiry', name: 'New project', slug: 'new-project', notify, subject: 'New project brief from {{name}}',
    fields: [field.name(), field.email(), field.company(), { id: 'f-website', type: 'url', name: 'website', label: 'Website', width: 'half', required: false }, field.select('service', 'What do you need?', ['Brand identity', 'Website or product', 'Campaign', 'Packaging', 'Something else'], { required: true }), field.select('budget', 'Budget', ['Under $25k', '$25k – $75k', '$75k – $150k', '$150k+']), field.date('launch', 'Ideal launch date'), field.message('Tell us about the project'), field.consent()],
    submitLabel: 'Send brief',
    successMessage: 'Thank you — we will read your brief and reply within two working days.',
  });

  return assemble(ctx, {
    type: 'ProfessionalService',
    description: `${name} is an independent creative studio for brand identity, digital products, campaigns and packaging.`,
    structuredData: ['Organization', 'WebSite'],
    theme: 'minimal-mono',
    ogImage: 'studioLoft',
    defaultLocation: 'the studio',
    menus: {
      primary: [navItem('nav-work', 'Work', '/work'), navItem('nav-services', 'Services', '/services'), navItem('nav-studio', 'Studio', '/studio'), navItem('nav-contact', 'Contact', '/contact')],
      'footer-explore': [navItem('nav-f-work', 'Work', '/work'), navItem('nav-f-services', 'Services', '/services'), navItem('nav-f-studio', 'Studio', '/studio'), navItem('nav-f-brief', 'Start a project', '/contact#enquire')],
    },
    header: header({ variant: 'minimal', cta: btn('Start a project', '/contact#enquire'), transparentOnHero: false }),
    footer: footer({ variant: 'statement', statement: 'Let us make something *worth* remembering.', cta: btn('Start a project', '/contact#enquire'), columns: [{ title: 'Studio', menu: 'footer-explore' }], newsletterHeading: 'Studio notes' }),
    pages,
    forms: [enquiry],
    collections: [projectsCollection(PROJECTS)],
  });
}

export const creativeAgency: Blueprint = {
  key: 'creative-agency',
  name: 'Creative agency',
  description: 'Bold studio site with a projects collection and case-study pages, services, studio and team, and a project brief form.',
  category: 'creative',
  tags: ['agency', 'studio', 'design', 'portfolio', 'case studies'],
  thumbnail: photoUrl('studioLoft', 1200),
  build,
};
