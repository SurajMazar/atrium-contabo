import { photoUrl } from '../images';
import type { Blueprint, BlueprintInput } from '../types';
import {
  anim, assemble, btn, buildForm, contactPage, contextOf, ctaSection, faqSection, field, footer, header, heroCopy, homeTitle, img, item,
  metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type Collection, type Section,
} from './shared';

function postsCollection(): Collection {
  const body = (lead: string) => `<p>${lead}</p><h2>Why it matters</h2><p>Teams that automate the busywork spend more time on the problems only people can solve. Small improvements, repeated every week, add up to a real advantage.</p><h2>Getting started</h2><p>Pick one workflow, measure how long it takes today and set a goal for next month. Then iterate.</p>`;
  return {
    slug: 'posts',
    name: 'Blog posts',
    singularName: 'Post',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'summary', label: 'Summary', type: 'textarea' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'date', label: 'Published', type: 'date' },
      { key: 'author', label: 'Author', type: 'text' },
      { key: 'image', label: 'Cover image', type: 'image' },
      { key: 'body', label: 'Body', type: 'richtext' },
    ],
    titleField: 'title',
    routePrefix: 'blog',
    items: [
      item('posts', 'introducing-workflows', 0, { title: 'Introducing Workflows: automation without the spreadsheets', summary: 'Build multi-step automations in minutes with our new visual editor.', category: 'Product', date: '2026-09-22', author: 'Product team', image: img('dashboard', { width: 1600 }), body: body('Today we are launching Workflows, the fastest way to connect your tools and remove repetitive work.') }),
      item('posts', 'metrics-that-matter', 1, { title: 'The five metrics every operations team should track', summary: 'A simple framework for measuring what really drives performance.', category: 'Guides', date: '2026-09-02', author: 'Customer success', image: img('laptopAnalytics', { width: 1600 }), body: body('Dashboards are only useful if they help you decide what to do next.') }),
      item('posts', 'security-at-scale', 2, { title: 'How we keep your data secure at scale', summary: 'A look at our encryption, access controls and compliance programme.', category: 'Security', date: '2026-08-14', author: 'Engineering', image: img('codeScreen', { width: 1600 }), body: body('Security is not a feature we add at the end — it is how we build from the first line of code.') }),
    ],
  };
}

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'The calm way to run *busy* teams', 'Plan work, automate the busywork and see everything in one place — so your team can focus on what matters.');

  const plans = [
    { name: 'Starter', price: '$0', period: 'forever', description: 'For individuals and small projects.', features: ['Up to 3 users', '5 workflows', 'Core integrations', 'Community support'], cta: btn('Start free', '/contact#enquire', 'outline'), highlighted: false },
    { name: 'Team', price: '$12', period: 'per user / month', description: 'For growing teams that need more power.', features: ['Unlimited users', 'Unlimited workflows', 'Advanced reporting', 'Priority support'], cta: btn('Start 14-day trial', '/contact#enquire'), highlighted: true, badge: 'Most popular' },
    { name: 'Enterprise', price: 'Custom', period: 'annual billing', description: 'For organisations with advanced needs.', features: ['SSO & SCIM', 'Audit logs', 'Dedicated success manager', '99.9% uptime SLA'], cta: btn('Talk to sales', '/contact#enquire', 'outline'), highlighted: false },
  ];

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'split',
      props: {
        eyebrow: 'New · Workflows are here', heading: hero.heading, subheading: hero.subheading,
        buttons: [btn('Start free', '/pricing'), btn('Book a demo', '/contact#enquire', 'outline')],
        image: img('dashboard'), imageSide: 'right', height: 'tall',
        meta: [{ label: 'Teams', value: '8,000+' }, { label: 'Rating', value: '4.8 / 5' }, { label: 'Setup', value: 'Under 10 min' }],
        spacingTop: 'xl', spacingBottom: 'lg',
      },
      animation: anim.hero,
    },
    { type: 'logo-cloud', variant: 'marquee', props: { eyebrow: 'Trusted by fast-moving teams', align: 'center', logos: [{ name: 'Northwind' }, { name: 'Lumen' }, { name: 'Brightline' }, { name: 'Copperleaf' }, { name: 'Orbital' }, { name: 'Fieldnote' }, { name: 'Parallel' }], speed: 40, grayscale: true, spacingTop: 'md', spacingBottom: 'md' } },
    {
      type: 'features',
      variant: 'grid',
      props: {
        eyebrow: 'Why {{business.name}}', heading: 'Everything in *one* place',
        items: [
          { icon: 'layout-grid', title: 'Plan', text: 'Boards, timelines and docs that stay in sync.' },
          { icon: 'zap', title: 'Automate', text: 'Visual workflows that remove repetitive tasks.' },
          { icon: 'chart-line', title: 'Measure', text: 'Live dashboards with the metrics that matter.' },
          { icon: 'layers', title: 'Integrate', text: '150+ integrations with the tools you already use.' },
          { icon: 'shield-check', title: 'Secure', text: 'SOC 2 Type II, SSO and granular permissions.' },
          { icon: 'smartphone', title: 'Anywhere', text: 'Fast native apps for desktop and mobile.' },
        ],
        columns: 3, iconStyle: 'square', buttons: [btn('Explore features', '/features', 'outline')],
      },
      animation: anim.stagger,
    },
    {
      type: 'content-split',
      variant: 'full-bleed',
      props: { tone: 'inverse', eyebrow: 'Workflows', heading: 'Automate the work *between* the work', body: 'Drag, drop and connect triggers, conditions and actions. Route requests, update records and notify the right people — without writing a line of code.', buttons: [btn('See how it works', '/features', 'secondary')], image: img('laptopCode'), imageSide: 'right', imageAspect: '4:3' },
      animation: anim.mask,
    },
    { type: 'stats', variant: 'inline', props: { items: [{ value: '6', suffix: 'h', label: 'Saved per person, per week' }, { value: '40', suffix: '%', label: 'Faster project delivery' }, { value: '99.99', suffix: '%', label: 'Uptime last 12 months' }, { value: '150', suffix: '+', label: 'Integrations' }], columns: 4 }, animation: anim.stagger },
    testimonialsSection([
      { quote: 'We replaced four tools with one and our weekly status meeting disappeared. Genuinely life-changing for our ops team.', author: 'Maya Chen', role: 'Head of Operations, Lumen', avatar: 'portraitW3' },
      { quote: 'Setup took an afternoon. Within a month every team in the company was using it.', author: 'Daniel Brooks', role: 'COO, Brightline', avatar: 'portraitM1' },
      { quote: 'The automation builder is the most intuitive I have used. Our support queue is half what it was.', author: 'Sara Ali', role: 'Support Lead, Orbital', avatar: 'portraitW7' },
    ], { variant: 'grid', tone: 'surface', eyebrow: 'Customers', heading: 'Loved by *teams* everywhere' }),
    { type: 'pricing', variant: 'cards', props: { eyebrow: 'Pricing', heading: 'Simple, transparent *plans*', subheading: 'Start free. Upgrade when you are ready.', align: 'center', plans } },
    ctaSection({ heading: 'Ready to get *started*?', subheading: 'Free for small teams. No credit card required.', buttons: [btn('Start free', '/pricing'), btn('Book a demo', '/contact#enquire', 'outline')], variant: 'centered', tone: 'primary' }),
  ];

  const features: Section[] = [
    {
      type: 'hero',
      variant: 'centered',
      props: { eyebrow: 'Features', heading: 'Built for how teams *actually* work', subheading: 'Planning, automation, reporting and integrations — designed to work together from day one.', buttons: [btn('Start free', '/pricing'), btn('Book a demo', '/contact#enquire', 'outline')], image: img('laptopAnalytics'), height: 'auto', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    {
      type: 'features',
      variant: 'alternating',
      props: {
        items: [
          { image: img('workspace', { width: 1600 }), eyebrow: 'Plan', title: 'Projects that plan themselves', text: 'Templates, dependencies and smart scheduling keep every project on track — and everyone on the same page.' },
          { image: img('codeScreen', { width: 1600 }), eyebrow: 'Automate', title: 'Workflows without code', text: 'Visual automations with conditions, approvals and 150+ integrations. Build once, run forever.' },
          { image: img('dashboard', { width: 1600 }), eyebrow: 'Measure', title: 'Dashboards in real time', text: 'Drag-and-drop reporting with live data, scheduled digests and shareable views.' },
        ],
        imageAspect: '4:3',
      },
      animation: anim.fadeUp,
    },
    {
      type: 'benefits',
      variant: 'grid',
      props: { tone: 'surface', eyebrow: 'Security', heading: 'Enterprise-grade by *default*', items: [{ title: 'SOC 2 Type II', icon: 'shield-check' }, { title: 'SSO & SCIM', icon: 'key-round' }, { title: 'Data encryption', icon: 'lock' }, { title: 'Audit logs', icon: 'list-checks' }, { title: 'EU & US hosting', icon: 'globe' }, { title: 'Role-based access', icon: 'users' }], columns: 3 },
      animation: anim.stagger,
    },
    faqSection([
      { question: 'Does it integrate with our tools?', answer: 'Yes — 150+ native integrations plus an open API and webhooks.' },
      { question: 'Can we import existing projects?', answer: 'Import from CSV or connect your current tool and migrate in a few clicks.' },
      { question: 'Is there a mobile app?', answer: 'Native apps for iOS and Android are included on every plan.' },
    ]),
    ctaSection({ heading: 'See it in *action*', buttons: [btn('Book a demo', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const pricing: Section[] = [
    { type: 'pricing', variant: 'cards', props: { eyebrow: 'Pricing', heading: 'Plans for every *stage*', headingLevel: 'h1', subheading: 'All plans include unlimited projects, mobile apps and a 14-day free trial of Team features.', align: 'center', plans, footnote: 'Prices in USD, billed annually. Monthly billing available.', spacingTop: 'xl' }, animation: anim.stagger },
    {
      type: 'comparison-table',
      props: {
        tone: 'surface', eyebrow: 'Compare', heading: 'Compare *plans*',
        columns: [{ label: 'Starter', highlighted: false }, { label: 'Team', highlighted: true }, { label: 'Enterprise', highlighted: false }],
        rows: [
          { label: 'Users', values: ['Up to 3', 'Unlimited', 'Unlimited'] },
          { label: 'Workflows', values: ['5', 'Unlimited', 'Unlimited'] },
          { label: 'Integrations', values: ['Core', 'All 150+', 'All + custom'] },
          { label: 'Advanced reporting', values: ['no', 'yes', 'yes'] },
          { label: 'SSO & SCIM', values: ['no', 'no', 'yes'] },
          { label: 'Audit logs', values: ['no', 'no', 'yes'] },
          { label: 'Support', values: ['Community', 'Priority', 'Dedicated manager'] },
        ],
        caption: 'Need something different? Talk to our sales team.',
      },
    },
    faqSection([
      { question: 'Can I change plans later?', answer: 'Yes — upgrade or downgrade at any time. Changes are pro-rated automatically.' },
      { question: 'Do you offer discounts?', answer: 'Non-profits and education get 50% off Team. Annual billing saves two months.' },
      { question: 'What happens after the trial?', answer: 'You can choose a plan or continue on Starter for free. We never charge without asking.' },
      { question: 'Which payment methods do you accept?', answer: 'All major cards, plus invoicing for annual Enterprise plans.' },
    ], { heading: 'Pricing *questions*' }),
    ctaSection({ heading: 'Still deciding?', subheading: 'Our team can help you choose the right plan.', buttons: [btn('Talk to sales', '/contact#enquire')], variant: 'banner', tone: 'surface' }),
  ];

  const customers: Section[] = [
    {
      type: 'hero',
      variant: 'editorial',
      props: { eyebrow: 'Customers', heading: 'Teams doing their *best* work', subheading: 'From ten-person start-ups to global enterprises, see how teams use {{business.name}} to move faster.', buttons: [btn('Book a demo', '/contact#enquire')], image: img('officeTeam'), imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    { type: 'stats', variant: 'large', props: { tone: 'inverse', items: [{ value: '8,000', suffix: '+', label: 'Teams' }, { value: '62', label: 'Countries' }, { value: '4.8', label: 'Average rating' }], columns: 3 }, animation: anim.stagger },
    {
      type: 'features',
      variant: 'cards',
      props: {
        eyebrow: 'Case studies', heading: 'Customer *stories*',
        items: [
          { image: img('teamLaptops', { width: 1400 }), eyebrow: 'Lumen · Operations', title: 'Cutting weekly reporting from 6 hours to 20 minutes', text: 'How Lumen automated status updates across 14 teams.' },
          { image: img('developers', { width: 1400 }), eyebrow: 'Orbital · Support', title: 'Halving response times with smart routing', text: 'Automated triage sends every ticket to the right person.' },
          { image: img('highFive', { width: 1400 }), eyebrow: 'Brightline · Company-wide', title: 'One tool for 600 people', text: 'Replacing four tools and saving $180k a year.' },
        ],
        columns: 3, imageAspect: '3:2',
      },
      animation: anim.stagger,
    },
    testimonialsSection([
      { quote: 'The best software rollout I have been part of. People actually wanted to use it.', author: 'Priya Natarajan', role: 'VP People, Copperleaf', avatar: 'portraitW4' },
      { quote: 'Our clients see progress in real time now. It has changed the way we run engagements.', author: 'Tom Hughes', role: 'Managing Director, Fieldnote', avatar: 'portraitM6' },
    ], { variant: 'carousel', tone: 'surface' }),
    ctaSection({ heading: 'Join *thousands* of teams', buttons: [btn('Start free', '/pricing'), btn('Book a demo', '/contact#enquire', 'outline')], variant: 'centered', tone: 'primary' }),
  ];

  const blog: Section[] = [
    { type: 'text-section', variant: 'intro', props: { eyebrow: 'Blog', heading: 'News, guides and *ideas*', headingLevel: 'h1', body: 'Product updates and practical advice for teams who want to work better.', align: 'center', spacingTop: 'xl', spacingBottom: 'md' }, animation: anim.fadeUp },
    { type: 'collection-list', variant: 'featured', props: { collection: 'posts', columns: 3, imageAspect: '3:2', linkLabel: 'Read post', emptyText: 'New posts are on their way.', spacingTop: 'md' }, animation: anim.stagger },
    { type: 'newsletter', variant: 'inline', props: { formId: 'form-newsletter', heading: 'Get the newsletter', text: 'Product news and guides, twice a month.', buttonLabel: 'Subscribe', image: undefined } },
  ];

  const postDetail: Section[] = [
    { type: 'hero', variant: 'minimal', props: { eyebrow: '{{item.category}}', heading: '{{item.title}}', subheading: '{{item.summary}}', buttons: [], meta: [{ label: 'Published', value: '{{item.date}}' }, { label: 'By', value: '{{item.author}}' }], height: 'auto', spacingTop: 'xl', spacingBottom: 'md' }, animation: anim.hero },
    { type: 'section', props: { containerWidth: 'narrow', spacingTop: 'none', spacingBottom: 'lg' }, children: [{ type: 'image', props: { image: { src: '{{item.image}}', alt: '{{item.title}}' }, aspect: '16:9', rounded: 'md', priority: true } }, { type: 'rich-text', props: { html: '{{item.body}}', measure: 'default' } }] },
    { type: 'collection-list', variant: 'grid', props: { tone: 'surface', eyebrow: 'Keep reading', heading: 'More from the *blog*', collection: 'posts', limit: 3, columns: 3, excludeCurrent: true, linkLabel: 'Read post' } },
    ctaSection({ heading: 'Try {{business.name}} *free*', buttons: [btn('Start free', '/pricing')], variant: 'banner', tone: 'inverse' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Work management software'), seoDescription: metaDescription(`${name} helps teams plan work, automate repetitive tasks and track progress in one place.`, 'Free for small teams.'), sections: home }),
    page({ title: 'Features', slug: 'features', seoTitle: metaTitle('Features', name), seoDescription: metaDescription(`Explore ${name} features: project planning, no-code workflow automation, real-time dashboards, integrations and enterprise security.`), sections: features }),
    page({ title: 'Pricing', slug: 'pricing', seoTitle: metaTitle('Pricing', name), seoDescription: metaDescription(`Simple, transparent pricing for ${name}. Start free, upgrade to Team for unlimited workflows, or talk to us about Enterprise.`), sections: pricing, structuredData: [{ type: 'FAQPage', auto: true }] }),
    page({ title: 'Customers', slug: 'customers', seoTitle: metaTitle('Customers', name), seoDescription: metaDescription(`Customer stories from teams using ${name} to automate reporting, speed up support and replace scattered tools.`), sections: customers }),
    page({ title: 'Blog', slug: 'blog', seoTitle: metaTitle('Blog', name), seoDescription: metaDescription(`Product updates, guides and ideas from the ${name} team for people who want to work better together.`), sections: blog }),
    page({ title: 'Blog post', slug: 'post-detail', kind: 'collection-template', collection: 'posts', seoTitle: '{{item.title}}', seoDescription: '{{item.summary}}', sections: postDetail, structuredData: [{ type: 'Article', auto: true }] }),
    contactPage({
      name, formId: 'form-enquiry', heroImage: 'teamLaptops', heading: 'Talk to *our team*', intro: 'Book a demo, ask about Enterprise or get help choosing a plan. We reply within one business day.',
      formEyebrow: 'Sales & demos', formHeading: 'Book a *demo*', formSubheading: 'Tell us about your team and we will tailor a 30-minute walkthrough to your workflows.', detailsHeading: 'Other ways to *reach us*',
      seoDescription: metaDescription(`Contact ${name} to book a demo, ask about Enterprise plans or get help choosing the right plan for your team.`),
    }),
    privacyPage(name),
  ];

  const enquiry = buildForm({
    id: 'form-enquiry', name: 'Demo request', slug: 'demo-request', notify, subject: 'Demo request from {{name}} at {{company}}',
    fields: [field.name(), field.email(), field.company(), field.select('teamSize', 'Team size', ['1–10', '11–50', '51–200', '201–1,000', '1,000+'], { required: true }), field.select('interest', 'Interested in', ['Team plan', 'Enterprise', 'Partnership', 'Something else']), field.message('What would you like to see?', 'Your current tools, workflows and goals'), field.consent()],
    submitLabel: 'Request demo',
    successMessage: 'Thanks! We will be in touch within one business day to schedule your demo.',
    rules: [{ id: 'form-enquiry-enterprise', name: 'Tag enterprise leads', enabled: true, when: { match: 'any', conditions: [{ field: 'teamSize', op: 'in', value: ['201-1-000', '1-000'] }, { field: 'interest', op: 'eq', value: 'enterprise' }] }, then: [{ type: 'tag', tags: ['enterprise'] }], otherwise: [], stopProcessing: false }],
  });

  return assemble(ctx, {
    type: 'SoftwareApplication',
    description: `${name} helps teams plan work, automate repetitive tasks and track progress — all in one place.`,
    structuredData: ['Organization', 'WebSite'],
    theme: 'corporate-modern',
    ogImage: 'dashboard',
    defaultLocation: 'remote-first',
    menus: {
      primary: [
        navItem('nav-features', 'Features', '/features'),
        navItem('nav-pricing', 'Pricing', '/pricing'),
        navItem('nav-customers', 'Customers', '/customers'),
        navItem('nav-blog', 'Blog', '/blog'),
        navItem('nav-contact', 'Contact', '/contact'),
      ],
      'footer-product': [navItem('nav-f-features', 'Features', '/features'), navItem('nav-f-pricing', 'Pricing', '/pricing'), navItem('nav-f-customers', 'Customers', '/customers')],
      'footer-company': [navItem('nav-f-blog', 'Blog', '/blog'), navItem('nav-f-contact', 'Contact sales', '/contact'), navItem('nav-f-demo', 'Book a demo', '/contact#enquire')],
    },
    header: header({ variant: 'classic', cta: btn('Start free', '/pricing'), transparentOnHero: false }),
    footer: footer({ variant: 'columns', columns: [{ title: 'Product', menu: 'footer-product' }, { title: 'Company', menu: 'footer-company' }], newsletterHeading: 'Product updates', tone: 'inverse' }),
    pages,
    forms: [enquiry],
    collections: [postsCollection()],
  });
}

export const saas: Blueprint = {
  key: 'saas',
  name: 'SaaS product',
  description: 'Product marketing site with features, pricing cards and comparison table, customer stories, a blog collection and a demo request form.',
  category: 'technology',
  tags: ['saas', 'software', 'startup', 'pricing', 'blog'],
  thumbnail: photoUrl('dashboard', 1200),
  build,
};
