import { photoUrl } from '../images';
import type { Blueprint, BlueprintInput } from '../types';
import {
  anim, assemble, btn, buildForm, contactPage, contextOf, ctaSection, faqSection, field, footer, header, heroCopy, homeTitle, img, item,
  metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type Collection, type Section,
} from './shared';

function insightsCollection(): Collection {
  const body = (lead: string) => `<p>${lead}</p><h2>What we are seeing</h2><p>Across our client work, the organisations that move fastest share three habits: they make decisions with good data, they keep teams small and accountable, and they review progress every few weeks rather than every year.</p><h2>What to do next</h2><p>Start with one measurable outcome, assign a single owner and agree how you will know it is working. Momentum compounds from there.</p>`;
  return {
    slug: 'insights',
    name: 'Insights',
    singularName: 'Insight',
    description: 'Articles and perspectives shown on the Insights page.',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'summary', label: 'Summary', type: 'textarea' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'date', label: 'Published', type: 'date' },
      { key: 'author', label: 'Author', type: 'text' },
      { key: 'readTime', label: 'Read time', type: 'text' },
      { key: 'image', label: 'Cover image', type: 'image' },
      { key: 'body', label: 'Body', type: 'richtext' },
    ],
    titleField: 'title',
    routePrefix: 'insights',
    items: [
      item('insights', 'operating-model-reset', 0, { title: 'The operating-model reset: five questions for leadership teams', summary: 'Why the next year of growth depends on how decisions are made, not just which ones.', category: 'Strategy', date: '2026-09-18', author: 'Partner, Strategy', readTime: '6 min read', image: img('boardroom', { width: 1600 }), body: body('Most operating models were designed for a slower world. Here is how leadership teams are rebuilding theirs.') }),
      item('insights', 'data-you-can-trust', 1, { title: 'Data you can trust: building a single source of truth', summary: 'A practical roadmap for turning scattered reports into decisions everyone believes.', category: 'Data', date: '2026-08-27', author: 'Director, Analytics', readTime: '8 min read', image: img('laptopAnalytics', { width: 1600 }), body: body('Every organisation has data. Few have data that the whole leadership team trusts.') }),
      item('insights', 'change-that-sticks', 2, { title: 'Change that sticks: lessons from 40 transformation programmes', summary: 'What separates the programmes that deliver from the ones that quietly fade.', category: 'Transformation', date: '2026-07-30', author: 'Partner, People', readTime: '5 min read', image: img('workshop', { width: 1600 }), body: body('Transformation rarely fails for lack of ambition. It fails in the handover from plan to practice.') }),
      item('insights', 'resilient-supply-chains', 3, { title: 'Resilient supply chains without the cost blow-out', summary: 'How mid-sized businesses are reducing risk while protecting margin.', category: 'Operations', date: '2026-06-12', author: 'Director, Operations', readTime: '7 min read', image: img('documents', { width: 1600 }), body: body('Resilience used to mean holding more stock. Today it means seeing further and reacting faster.') }),
    ],
  };
}

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'Clear thinking for *ambitious* organisations', 'We help leadership teams set direction, make better decisions and deliver change that lasts — from strategy to execution.');

  const services = [
    { icon: 'target', title: 'Strategy & growth', text: 'Market analysis, portfolio choices and growth plans your board will back.' },
    { icon: 'layers', title: 'Operating model', text: 'Structures, processes and governance that let teams move faster.' },
    { icon: 'chart-line', title: 'Data & analytics', text: 'Dashboards and decision tools built on data everyone trusts.' },
    { icon: 'users', title: 'People & change', text: 'Leadership development and change programmes that stick.' },
    { icon: 'settings', title: 'Operations', text: 'Leaner processes, resilient supply chains and measurable savings.' },
    { icon: 'shield-check', title: 'Risk & compliance', text: 'Practical frameworks that protect value without slowing you down.' },
  ];

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'split',
      props: {
        eyebrow: '{{business.name}}', heading: hero.heading, subheading: hero.subheading,
        buttons: [btn('Talk to us', '/contact#enquire'), btn('Our services', '/services', 'outline')],
        image: img('officeOpen'), imageSide: 'right', height: 'tall',
        meta: [{ label: 'Clients served', value: '250+' }, { label: 'Sectors', value: '12' }, { label: 'Founded', value: '2008' }],
        spacingTop: 'xl', spacingBottom: 'lg',
      },
      animation: anim.hero,
    },
    {
      type: 'logo-cloud',
      variant: 'marquee',
      props: { eyebrow: 'Trusted by teams at', align: 'center', logos: [{ name: 'Northfield' }, { name: 'Halcyon Group' }, { name: 'Meridian' }, { name: 'Atlas Partners' }, { name: 'Bluestone' }, { name: 'Verity Health' }, { name: 'Kestrel Energy' }], grayscale: true, speed: 40, spacingTop: 'md', spacingBottom: 'md' },
    },
    {
      type: 'features',
      variant: 'grid',
      props: { eyebrow: 'What we do', heading: 'Advice that turns into *results*', subheading: 'Six practices, one integrated team — so strategy, operations and people move together.', items: services, columns: 3, iconStyle: 'circle', buttons: [btn('Explore services', '/services', 'outline')] },
      animation: anim.stagger,
    },
    {
      type: 'stats',
      variant: 'large',
      props: { tone: 'inverse', eyebrow: 'Impact', heading: 'Measured in *outcomes*', items: [{ value: '18', suffix: '%', label: 'Average cost reduction', description: 'Across operations programmes since 2020' }, { value: '3.2', suffix: 'x', label: 'Return on engagement', description: 'Median client ROI in year one' }, { value: '94', suffix: '%', label: 'Clients who return', description: 'For a second engagement' }], columns: 3 },
      animation: anim.stagger,
    },
    {
      type: 'content-split',
      variant: 'standard',
      props: {
        eyebrow: 'How we work', heading: 'Senior people, *small* teams', body: 'Every engagement is led by a partner who stays involved from the first workshop to the final review. We keep teams small, work alongside yours and leave behind the capability to keep going.\n\nNo thick reports that gather dust — just clear recommendations, owned by the people who will deliver them.',
        buttons: [btn('About us', '/about', 'link')], image: img('meetingRoom'), imageSide: 'left', imageAspect: '4:3',
        facts: [{ label: 'Partner-led', value: 'Every engagement' }, { label: 'Typical team', value: '3 – 6 people' }],
      },
      animation: anim.mask,
    },
    testimonialsSection([
      { quote: 'They challenged our assumptions, then rolled up their sleeves and helped us deliver. The best advisory relationship we have had.', author: 'Chief Executive', role: 'National logistics group' },
      { quote: 'Clear, pragmatic and genuinely collaborative. Our leadership team is aligned for the first time in years.', author: 'Chief Operating Officer', role: 'Healthcare provider' },
    ], { variant: 'single', tone: 'surface', eyebrow: 'Client perspective' }),
    {
      type: 'collection-list',
      variant: 'featured',
      props: { eyebrow: 'Insights', heading: 'Latest *thinking*', collection: 'insights', limit: 3, columns: 3, imageAspect: '3:2', linkLabel: 'Read article', buttons: [btn('All insights', '/insights', 'outline')] },
      animation: anim.stagger,
    },
    ctaSection({ eyebrow: 'Start a conversation', heading: 'What would *progress* look like for you?', subheading: 'Tell us about the challenge. A partner will reply within one working day.', buttons: [btn('Book an introduction', '/contact#enquire')], variant: 'split', image: 'towersUp', tone: 'surface' }),
  ];

  const servicesPage: Section[] = [
    {
      type: 'hero',
      variant: 'minimal',
      props: { eyebrow: 'Services', heading: 'Integrated advice, from *strategy* to delivery', subheading: 'Choose a single practice or bring us in across the whole journey.', buttons: [btn('Discuss your challenge', '/contact#enquire')], height: 'auto', spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.hero,
    },
    {
      type: 'features',
      variant: 'alternating',
      props: {
        items: [
          { image: img('workshop', { width: 1600 }), eyebrow: '01', title: 'Strategy & growth', text: 'We help you decide where to play and how to win — market and customer analysis, portfolio reviews, M&A screening and growth plans with clear milestones.' },
          { image: img('teamTable', { width: 1600 }), eyebrow: '02', title: 'Operating model & organisation', text: 'Structures, roles, decision rights and governance designed around how value is created, not how the org chart has always looked.' },
          { image: img('dashboard', { width: 1600 }), eyebrow: '03', title: 'Data & analytics', text: 'From KPI design to self-serve dashboards, we build the reporting your leadership team will actually use to make decisions.' },
          { image: img('teamPresentation', { width: 1600 }), eyebrow: '04', title: 'People & change', text: 'Leadership coaching, communication and change management that brings your people with you.' },
        ],
        imageAspect: '4:3',
      },
      animation: anim.fadeUp,
    },
    {
      type: 'timeline',
      variant: 'steps',
      props: {
        tone: 'surface', eyebrow: 'Our approach', heading: 'Four steps to *momentum*',
        items: [
          { date: 'Weeks 1–2', title: 'Diagnose', text: 'Interviews, data review and a clear view of the problem.' },
          { date: 'Weeks 3–6', title: 'Design', text: 'Options, trade-offs and a recommendation you can act on.' },
          { date: 'Months 2–6', title: 'Deliver', text: 'Hands-on support to implement, with your teams in the lead.' },
          { date: 'Ongoing', title: 'Sustain', text: 'Reviews and coaching so results keep compounding.' },
        ],
      },
      animation: anim.stagger,
    },
    faqSection([
      { question: 'What size of organisation do you work with?', answer: 'Mostly mid-sized and growing businesses, public bodies and not-for-profits with 100 to 5,000 people.' },
      { question: 'How are engagements priced?', answer: 'Fixed fees for defined phases, agreed up front. We also offer retained advisory for ongoing support.' },
      { question: 'Do you work remotely?', answer: 'We combine on-site workshops with remote collaboration, depending on what works best for your team.' },
    ]),
    ctaSection({ heading: 'Let us find the right *starting point*', buttons: [btn('Book an introduction', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const about: Section[] = [
    {
      type: 'hero',
      variant: 'editorial',
      props: { eyebrow: 'About us', heading: 'Independent, partner-led, *practical*', subheading: 'We started {{business.name}} to offer the advice we wished we had received: honest, senior and focused on getting things done.', buttons: [btn('Meet the team', '#team', 'link')], image: img('officeTeam'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'text-section',
      variant: 'two-column',
      props: { eyebrow: 'Our purpose', heading: 'Better decisions, *made* together', body: 'We believe the best answers come from the people closest to the work. Our role is to bring structure, evidence and an outside perspective — then help your team carry it forward.\n\nWe are independent, so our only incentive is your success. We keep our client list small so every engagement gets our full attention.', align: 'left' },
      animation: anim.fadeUp,
    },
    {
      type: 'benefits',
      variant: 'list',
      props: { tone: 'surface', eyebrow: 'Our values', heading: 'What we *stand* for', items: [{ title: 'Candour', text: 'We say what we think, kindly and early.', icon: 'message-circle' }, { title: 'Ownership', text: 'We act as if the results were our own.', icon: 'badge-check' }, { title: 'Curiosity', text: 'We ask better questions before giving answers.', icon: 'lightbulb' }, { title: 'Craft', text: 'We sweat the details that others skip.', icon: 'pen-tool' }], columns: 2 },
    },
    {
      type: 'team',
      variant: 'grid',
      anchor: 'team',
      props: {
        eyebrow: 'Leadership', heading: 'The *team*',
        members: [
          { name: 'Elena Marsh', role: 'Managing Partner', bio: 'Twenty years advising boards on strategy and growth.', photo: img('portraitW1', { width: 800 }), links: [] },
          { name: 'David Okoro', role: 'Partner, Operations', bio: 'Former COO who has led turnarounds in three sectors.', photo: img('portraitM3', { width: 800 }), links: [] },
          { name: 'Hannah Lee', role: 'Partner, People & Change', bio: 'Organisational psychologist and leadership coach.', photo: img('portraitW3', { width: 800 }), links: [] },
          { name: 'Marcus Webb', role: 'Director, Data', bio: 'Builds analytics teams and the tools they rely on.', photo: img('portraitM5', { width: 800 }), links: [] },
        ],
        columns: 4, portraitAspect: '4:5',
      },
      animation: anim.stagger,
    },
    {
      type: 'timeline',
      variant: 'vertical',
      props: { tone: 'surface', eyebrow: 'Our story', heading: 'Milestones', items: [{ date: '2008', title: 'Founded', text: 'Three partners and one client, working from a shared office.' }, { date: '2015', title: 'Data practice launched', text: 'Analytics becomes core to every engagement.' }, { date: '2021', title: '200th client', text: 'Teams across four offices and twelve sectors.' }, { date: 'Today', title: 'Still independent', text: 'Partner-led, and proud of it.' }] },
    },
    ctaSection({ heading: 'Work *with* us', subheading: 'We are always glad to meet thoughtful people — clients and colleagues alike.', buttons: [btn('Get in touch', '/contact#enquire')], image: 'skyline' }),
  ];

  const insights: Section[] = [
    {
      type: 'text-section',
      variant: 'intro',
      props: { eyebrow: 'Insights', heading: 'Perspectives on *strategy*, operations and change', headingLevel: 'h1', body: 'Practical thinking from our partners, drawn from the work we do with clients every week.', align: 'center', spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.fadeUp,
    },
    {
      type: 'collection-list',
      variant: 'grid',
      props: { collection: 'insights', columns: 3, imageAspect: '3:2', linkLabel: 'Read article', emptyText: 'New articles are on their way.', spacingTop: 'md' },
      animation: anim.stagger,
    },
    {
      type: 'newsletter',
      variant: 'card',
      props: { formId: 'form-newsletter', eyebrow: 'Newsletter', heading: 'Insights in your inbox', text: 'One considered email a month. No noise, unsubscribe at any time.', buttonLabel: 'Subscribe', image: undefined },
    },
  ];

  const insightDetail: Section[] = [
    {
      type: 'hero',
      variant: 'centered',
      props: { eyebrow: '{{item.category}}', heading: '{{item.title}}', subheading: '{{item.summary}}', buttons: [], image: { src: '{{item.image}}', alt: '{{item.title}}' }, height: 'auto', meta: [{ label: 'Published', value: '{{item.date}}' }, { label: 'By', value: '{{item.author}}' }, { label: 'Reading time', value: '{{item.readTime}}' }], spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.hero,
    },
    { type: 'section', props: { containerWidth: 'narrow', spacingTop: 'md', spacingBottom: 'lg' }, children: [{ type: 'rich-text', props: { html: '{{item.body}}', measure: 'default', dropCap: true } }] },
    { type: 'collection-list', variant: 'grid', props: { tone: 'surface', eyebrow: 'Keep reading', heading: 'More *insights*', collection: 'insights', limit: 3, columns: 3, excludeCurrent: true, linkLabel: 'Read article' } },
    ctaSection({ heading: 'Facing a similar *challenge*?', buttons: [btn('Talk to a partner', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Strategy & advisory'), seoDescription: metaDescription(`${name} is an independent advisory firm helping leadership teams with strategy, operations, data and change.`), sections: home }),
    page({ title: 'Services', slug: 'services', seoTitle: metaTitle('Services', name), seoDescription: metaDescription(`Strategy, operating model, data and analytics, people and change services from ${name} — partner-led from diagnosis to delivery.`), sections: servicesPage, structuredData: [{ type: 'Service', auto: true }] }),
    page({ title: 'About', slug: 'about', seoTitle: metaTitle('About us', name), seoDescription: metaDescription(`Meet the partners behind ${name}, an independent advisory firm built on candour, ownership and practical results.`), sections: about }),
    page({ title: 'Insights', slug: 'insights', seoTitle: metaTitle('Insights', name), seoDescription: metaDescription(`Articles and perspectives from ${name} on strategy, operations, data and organisational change.`), sections: insights }),
    page({ title: 'Insight', slug: 'insight-detail', kind: 'collection-template', collection: 'insights', seoTitle: '{{item.title}}', seoDescription: '{{item.summary}}', sections: insightDetail, structuredData: [{ type: 'Article', auto: true }] }),
    contactPage({
      name, formId: 'form-enquiry', heroImage: 'boardroom', heading: 'Let us *talk*', intro: 'Tell us about the challenge you are facing. A partner will reply within one working day.',
      formHeading: 'Start a *conversation*', formSubheading: 'Share a little context and we will suggest a time for an introductory call — no obligation.', detailsHeading: 'Our *office*',
      seoDescription: metaDescription(`Contact ${name} to discuss strategy, operations or change. A partner replies to every enquiry within one working day.`),
    }),
    privacyPage(name),
  ];

  const enquiry = buildForm({
    id: 'form-enquiry', name: 'Business enquiry', slug: 'business-enquiry', notify, subject: 'New enquiry from {{name}} ({{company}})',
    fields: [field.name(), field.email(), field.company(), field.phone(), field.select('service', 'Area of interest', ['Strategy & growth', 'Operating model', 'Data & analytics', 'People & change', 'Operations', 'Not sure yet']), field.select('budget', 'Indicative budget', ['Under $50k', '$50k – $150k', '$150k+', 'Not yet defined']), field.message('How can we help?'), field.consent()],
    submitLabel: 'Send enquiry',
    autoreply: { subject: 'Thank you for contacting us', html: '<p>Dear {{name}},</p><p>Thank you for getting in touch with {{business.name}}. A partner will reply within one working day.</p>' },
  });

  return assemble(ctx, {
    type: 'ProfessionalService',
    description: `${name} is an independent, partner-led advisory firm helping organisations with strategy, operations, data and change.`,
    structuredData: ['Organization', 'WebSite'],
    theme: 'corporate-modern',
    ogImage: 'officeOpen',
    defaultLocation: 'the city',
    menus: {
      primary: [
        navItem('nav-services', 'Services', '/services'),
        navItem('nav-about', 'About', '/about'),
        navItem('nav-insights', 'Insights', '/insights'),
        navItem('nav-contact', 'Contact', '/contact'),
      ],
      'footer-company': [navItem('nav-f-about', 'About us', '/about'), navItem('nav-f-team', 'Leadership', '/about#team'), navItem('nav-f-contact', 'Contact', '/contact')],
      'footer-services': [navItem('nav-f-services', 'All services', '/services'), navItem('nav-f-insights', 'Insights', '/insights'), navItem('nav-f-enquire', 'Book an introduction', '/contact#enquire')],
    },
    header: header({ variant: 'classic', cta: btn('Talk to us', '/contact#enquire'), transparentOnHero: false }),
    footer: footer({ variant: 'columns', columns: [{ title: 'Company', menu: 'footer-company' }, { title: 'Services', menu: 'footer-services' }], newsletterHeading: 'Monthly insights' }),
    pages,
    forms: [enquiry],
    collections: [insightsCollection()],
  });
}

export const corporate: Blueprint = {
  key: 'corporate',
  name: 'Corporate & advisory',
  description: 'Professional services site with services, about and team, an insights collection with article pages and a qualified enquiry form.',
  category: 'business',
  tags: ['corporate', 'consulting', 'professional services', 'insights', 'b2b'],
  thumbnail: photoUrl('officeOpen', 1200),
  build,
};
