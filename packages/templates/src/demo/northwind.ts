import { THEME_PRESETS } from '@atrium/design-tokens';
import type { CollectionDefinitionInput, FormDefinitionInput, NodeInput, PageInput, WebsiteInput } from '@atrium/schema';
import { socialFrom, themeFrom } from '../helpers';
import { img, photoUrl } from '../images';
import type { DemoSite } from '../types';

/**
 * Northwind Partners — a fictional strategy, finance-transformation, payments & risk and data/AI
 * advisory firm for banks, fintechs, insurers and the public sector. London HQ, Singapore, New York.
 */

const KEY = 'northwind-partners';
const NAME = 'Northwind Partners';
const TAGLINE = 'Advisory for the institutions that move money.';
const DESCRIPTION =
  'Northwind Partners is an independent advisory firm helping banks, fintechs, insurers and public bodies modernise finance, payments, risk and data — with measurable outcomes.';

const seo = (title: string, description: string): PageInput['seo'] => ({ title, description });

// ---------------------------------------------------------------------------
// Shared copy
// ---------------------------------------------------------------------------

const SERVICES = [
  {
    anchor: 'strategy',
    icon: 'compass',
    title: 'Strategy & operating model',
    short: 'Where to play, how to win, and the operating model that makes the plan survive contact with reality.',
  },
  {
    anchor: 'finance',
    icon: 'landmark',
    title: 'Finance transformation',
    short: 'Faster closes, cleaner ledgers and a finance function that partners the business instead of chasing it.',
  },
  {
    anchor: 'payments',
    icon: 'shield-check',
    title: 'Payments & risk',
    short: 'Real-time rails, ISO 20022 migration, fraud and financial-crime controls that regulators and customers trust.',
  },
  {
    anchor: 'data',
    icon: 'brain-circuit',
    title: 'Data & AI advisory',
    short: 'Data foundations, model governance and AI use cases that earn their place on the P&L — not just in a demo.',
  },
] as const;

const CTA_TALK = { label: 'Talk to us', link: '/contact#contact-form', style: 'primary' as const };

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

const caseStudies: CollectionDefinitionInput = {
  id: 'col-case-studies',
  slug: 'case-studies',
  name: 'Case studies',
  singularName: 'Case study',
  description: 'Client engagements with measured outcomes.',
  titleField: 'title',
  routePrefix: 'case-studies',
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'client', label: 'Client', type: 'text', required: true },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'duration', label: 'Duration', type: 'text' },
    { key: 'summary', label: 'Summary', type: 'textarea' },
    { key: 'challenge', label: 'Challenge', type: 'textarea' },
    { key: 'solution', label: 'Solution', type: 'textarea' },
    { key: 'image', label: 'Cover image', type: 'image' },
    { key: 'result1', label: 'Result 1 value', type: 'text' },
    { key: 'result1Label', label: 'Result 1 label', type: 'text' },
    { key: 'result2', label: 'Result 2 value', type: 'text' },
    { key: 'result2Label', label: 'Result 2 label', type: 'text' },
    { key: 'result3', label: 'Result 3 value', type: 'text' },
    { key: 'result3Label', label: 'Result 3 label', type: 'text' },
    { key: 'quote', label: 'Client quote', type: 'textarea' },
    { key: 'quoteAuthor', label: 'Quote author', type: 'text' },
    { key: 'date', label: 'Published', type: 'date' },
  ],
  items: [
    {
      id: 'cs-harbour-settlement',
      slug: 'harbour-bank-real-time-settlement',
      status: 'published',
      position: 0,
      data: {
        title: 'Cutting settlement times 38% for a UK clearing bank',
        client: 'Harbour & Strand Bank',
        industry: 'Banking',
        duration: '14 months',
        summary: 'A phased move to real-time gross settlement and ISO 20022 messaging — delivered without a single missed cut-off.',
        challenge:
          'Harbour & Strand processed £4.2bn a day through a batch settlement engine built in 2003. Overnight windows were shrinking, the ISO 20022 deadline was fixed, and every change request queued behind a single vendor team.\n\nThe board wanted speed, but the treasury desk could not afford a weekend of failed payments.',
        solution:
          'We split the migration into eleven reversible releases, each with a parallel-run period and a pre-agreed rollback trigger. A joint war room of treasury, operations and engineering owned the cut-over calendar.\n\nIn parallel we rebuilt liquidity forecasting on intraday data, so the desk could release buffers the old batch cycle had forced it to hold.',
        image: img('dashboard', { alt: 'Settlement analytics dashboard reviewed during the migration' }),
        result1: '38%',
        result1Label: 'faster end-to-end settlement',
        result2: '£180m',
        result2Label: 'intraday liquidity released',
        result3: '0',
        result3Label: 'missed payment cut-offs',
        quote: 'Northwind made a terrifying migration feel boring — which is the highest compliment a treasurer can give.',
        quoteAuthor: 'Group Treasurer, Harbour & Strand Bank',
        date: '2026-08-21',
      },
    },
    {
      id: 'cs-lumen-close',
      slug: 'lumen-insurance-five-day-close',
      status: 'published',
      position: 1,
      data: {
        title: 'From a 12-day to a 5-day close at a specialty insurer',
        client: 'Lumen Specialty Insurance',
        industry: 'Insurance',
        duration: '9 months',
        summary: 'Rebuilding the record-to-report process for IFRS 17 — fewer manual journals, earlier insight, calmer quarter-ends.',
        challenge:
          'Lumen closed its books in twelve working days, with 1,900 manual journals a month and three competing versions of earned premium. IFRS 17 had added actuarial hand-offs nobody fully owned.',
        solution:
          'We mapped every journal to its source, automated the top 60% by value, and introduced a single sub-ledger for insurance contract balances. A close calendar with named owners replaced the shared spreadsheet.\n\nFinance business partners now receive a flash P&L on day two.',
        image: img('documents', { alt: 'Finance team reviewing close reports beside laptops' }),
        result1: '5 days',
        result1Label: 'month-end close, down from 12',
        result2: '64%',
        result2Label: 'fewer manual journals',
        result3: 'Day 2',
        result3Label: 'flash P&L to the executive team',
        quote: 'Quarter-end used to be a siege. Now it is a schedule.',
        quoteAuthor: 'Chief Financial Officer, Lumen Specialty Insurance',
        date: '2026-06-30',
      },
    },
    {
      id: 'cs-kestrel-fraud',
      slug: 'kestrel-pay-fraud-controls',
      status: 'published',
      position: 2,
      data: {
        title: 'Halving card fraud losses for a scaling fintech',
        client: 'Kestrel Pay',
        industry: 'Payments',
        duration: '6 months',
        summary: 'A layered fraud and financial-crime framework that let Kestrel Pay grow volume 3× while losses fell.',
        challenge:
          'Kestrel Pay had grown from 40,000 to 1.1m cardholders in two years. Fraud rules were written ad hoc, alerts overwhelmed a team of nine, and the regulator had asked for a credible financial-crime roadmap.',
        solution:
          'We designed a risk-tiered control framework, retrained the scoring model on labelled chargeback data and introduced a case-management workflow with clear service levels.\n\nGovernance came with it: model documentation, challenger testing and a monthly risk committee the regulator could see working.',
        image: img('laptopAnalytics', { alt: 'Fraud analytics charts on a laptop screen' }),
        result1: '52%',
        result1Label: 'reduction in card fraud losses',
        result2: '3×',
        result2Label: 'transaction volume over the same period',
        result3: '71%',
        result3Label: 'fewer false-positive alerts',
        quote: 'They gave us controls a regulator respects and a customer never notices.',
        quoteAuthor: 'Chief Risk Officer, Kestrel Pay',
        date: '2026-04-14',
      },
    },
    {
      id: 'cs-civic-data',
      slug: 'civic-revenue-agency-data-platform',
      status: 'published',
      position: 3,
      data: {
        title: 'A trusted data platform for a national revenue agency',
        client: 'Civic Revenue Agency',
        industry: 'Public sector',
        duration: '18 months',
        summary: 'Unifying 23 legacy data sources into one governed platform — and putting the first AI-assisted casework into production.',
        challenge:
          'Caseworkers searched up to seven systems to answer a single taxpayer query. Data quality issues were known but unowned, and every analytics request took weeks.',
        solution:
          'We set up a data office with named owners, defined 140 critical data elements and migrated the highest-value sources onto a governed cloud platform. An AI triage assistant, reviewed by caseworkers at every step, now routes incoming correspondence.',
        image: img('meetingRoom', { alt: 'Programme leads meeting around a boardroom table' }),
        result1: '23 → 1',
        result1Label: 'legacy sources consolidated',
        result2: '41%',
        result2Label: 'faster average case resolution',
        result3: '£26m',
        result3Label: 'annual operating savings identified',
        quote: 'For the first time, our caseworkers and our analysts are looking at the same truth.',
        quoteAuthor: 'Chief Data Officer, Civic Revenue Agency',
        date: '2026-02-03',
      },
    },
    {
      id: 'cs-meridian-wealth',
      slug: 'meridian-wealth-operating-model',
      status: 'published',
      position: 4,
      data: {
        title: 'A digital operating model for a private wealth manager',
        client: 'Meridian Private Wealth',
        industry: 'Wealth',
        duration: '7 months',
        summary: 'Redesigning onboarding and advice journeys so relationship managers spend their time with clients, not forms.',
        challenge:
          'Onboarding a new client at Meridian took 26 days and 14 hand-offs. Relationship managers spent a third of their week on administration, and younger clients were walking away mid-process.',
        solution:
          'We redesigned the end-to-end journey with advisers and compliance in the room, introduced digital identity and suitability checks, and set a target operating model for a central client-service hub.',
        image: img('codeScreen', { alt: 'Code for the new onboarding platform on a dark screen' }),
        result1: '6 days',
        result1Label: 'to onboard a new client, from 26',
        result2: '+11 hrs',
        result2Label: 'client time per adviser each week',
        result3: '+19 pts',
        result3Label: 'net promoter score',
        quote: 'Our advisers got their week back. Our clients noticed before we told them.',
        quoteAuthor: 'Managing Director, Meridian Private Wealth',
        date: '2025-11-18',
      },
    },
    {
      id: 'cs-aster-energy',
      slug: 'aster-energy-treasury-risk',
      status: 'published',
      position: 5,
      data: {
        title: 'Treasury and hedging discipline for an energy retailer',
        client: 'Aster Energy',
        industry: 'Energy',
        duration: '5 months',
        summary: 'A treasury and commodity-risk framework that steadied cash through the most volatile wholesale market in a generation.',
        challenge:
          'Wholesale price swings had turned Aster Energy’s collateral calls into a weekly crisis. Hedging decisions sat with two individuals and cash forecasts were rebuilt by hand every Monday.',
        solution:
          'We introduced a hedging policy with board-approved limits, a 13-week rolling cash forecast fed by trading and billing data, and a treasury committee with a clear escalation path.',
        image: img('glassArchitecture', { alt: 'Angular glass headquarters building against a pale sky' }),
        result1: '13 weeks',
        result1Label: 'rolling cash visibility, automated',
        result2: '£95m',
        result2Label: 'collateral headroom secured',
        result3: '−34%',
        result3Label: 'earnings volatility year on year',
        quote: 'We stopped reacting to the market and started managing our exposure to it.',
        quoteAuthor: 'Finance Director, Aster Energy',
        date: '2025-09-09',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const captcha = { provider: 'none' as const, minScore: 0.5, action: 'submit' };

const contactForm: FormDefinitionInput = {
  id: 'form-contact',
  name: 'Contact',
  slug: 'contact',
  fields: [
    { id: 'f-name', type: 'text', name: 'name', label: 'Full name', required: true, width: 'half' },
    { id: 'f-company', type: 'text', name: 'company', label: 'Organisation', required: true, width: 'half' },
    { id: 'f-email', type: 'email', name: 'email', label: 'Work email', required: true, width: 'half' },
    { id: 'f-phone', type: 'phone', name: 'phone', label: 'Phone', required: false, width: 'half' },
    {
      id: 'f-topic', type: 'select', name: 'topic', label: 'What would you like to discuss?', required: true, width: 'half',
      options: [
        { label: 'Strategy & operating model', value: 'strategy' },
        { label: 'Finance transformation', value: 'finance' },
        { label: 'Payments & risk', value: 'payments' },
        { label: 'Data & AI advisory', value: 'data' },
        { label: 'Careers at Northwind', value: 'careers' },
        { label: 'Something else', value: 'other' },
      ],
    },
    {
      id: 'f-budget', type: 'select', name: 'budget', label: 'Indicative budget', required: false, width: 'half',
      options: [
        { label: 'Under £100k', value: 'under-100k' },
        { label: '£100k – £500k', value: '100k-500k' },
        { label: '£500k – £2m', value: '500k-2m' },
        { label: 'Over £2m', value: 'over-2m' },
        { label: 'Not yet defined', value: 'undefined' },
      ],
      showIf: { match: 'all', conditions: [{ field: 'topic', op: 'neq', value: 'careers' }] },
    },
    { id: 'f-message', type: 'textarea', name: 'message', label: 'Tell us about the challenge', placeholder: 'Context, timelines, and what success would look like.', required: true, width: 'full', validation: { minLength: 20, maxLength: 4000 } },
    { id: 'f-consent', type: 'consent', name: 'consent', label: 'I agree to Northwind Partners storing my details to respond to this enquiry.', required: true, width: 'full' },
  ],
  settings: {
    submitLabel: 'Send enquiry',
    successMessage: 'Thank you. A partner will reply within one working day.',
    honeypot: true,
    captcha,
    storeSubmissions: true,
    rateLimitPerMinute: 5,
    layout: 'grid',
    consentText: 'We only use your details to reply. See our privacy notice.',
  },
  rules: [
    {
      id: 'rule-contact-notify',
      name: 'Notify the partnership desk',
      enabled: true,
      then: [{ type: 'email', to: ['hello@northwind.example'], replyTo: '{{email}}', subject: 'New enquiry: {{company}} — {{topic}}', body: '{{name}} ({{email}}, {{phone}}) from {{company}} wrote:\n\n{{message}}\n\nBudget: {{budget}}' }],
      otherwise: [],
      stopProcessing: false,
    },
    {
      id: 'rule-contact-careers',
      name: 'Route careers questions to talent',
      enabled: true,
      when: { match: 'all', conditions: [{ field: 'topic', op: 'eq', value: 'careers' }] },
      then: [
        { type: 'email', to: ['talent@northwind.example'], replyTo: '{{email}}', subject: 'Careers question from {{name}}', body: '{{message}}' },
        { type: 'tag', tags: ['careers'] },
      ],
      otherwise: [],
      stopProcessing: false,
    },
  ],
};

const applicationForm: FormDefinitionInput = {
  id: 'form-application',
  name: 'Career application',
  slug: 'application',
  fields: [
    { id: 'f-app-name', type: 'text', name: 'name', label: 'Full name', required: true, width: 'half' },
    { id: 'f-app-email', type: 'email', name: 'email', label: 'Email', required: true, width: 'half' },
    {
      id: 'f-app-role', type: 'select', name: 'role', label: 'Role', required: true, width: 'half',
      options: [
        { label: 'Senior Payments Consultant', value: 'senior-payments-consultant' },
        { label: 'Finance Transformation Manager', value: 'finance-transformation-manager' },
        { label: 'Data & AI Principal', value: 'data-ai-principal' },
        { label: 'Risk & Regulation Associate', value: 'risk-regulation-associate' },
        { label: 'Graduate Analyst', value: 'graduate-analyst' },
        { label: 'Speculative application', value: 'speculative' },
      ],
    },
    {
      id: 'f-app-office', type: 'select', name: 'office', label: 'Preferred office', required: true, width: 'half',
      options: [
        { label: 'London', value: 'london' },
        { label: 'Singapore', value: 'singapore' },
        { label: 'New York', value: 'new-york' },
      ],
    },
    { id: 'f-app-profile', type: 'url', name: 'profile', label: 'LinkedIn or CV link', required: true, width: 'full', placeholder: 'https://' },
    { id: 'f-app-message', type: 'textarea', name: 'message', label: 'Why Northwind, and why now?', required: false, width: 'full', validation: { maxLength: 3000 } },
    { id: 'f-app-consent', type: 'consent', name: 'consent', label: 'I agree to Northwind Partners keeping my application on file for 12 months.', required: true, width: 'full' },
  ],
  settings: {
    submitLabel: 'Submit application',
    successMessage: 'Thank you — our talent team reviews every application and will reply within ten working days.',
    honeypot: true,
    captcha,
    storeSubmissions: true,
    rateLimitPerMinute: 3,
    layout: 'grid',
  },
  rules: [
    {
      id: 'rule-application-talent',
      name: 'Send to talent team',
      enabled: true,
      then: [
        { type: 'email', to: ['talent@northwind.example'], replyTo: '{{email}}', subject: 'Application: {{role}} ({{office}}) — {{name}}', body: '{{name}} applied for {{role}} in {{office}}.\n\nProfile: {{profile}}\n\n{{message}}' },
        { type: 'autoresponder', subject: 'We have your application', html: '<p>Hi {{name}},</p><p>Thank you for applying to Northwind Partners. A member of our talent team will be in touch within ten working days.</p>', emailField: 'email' },
        { type: 'tag', tags: ['application'] },
      ],
      otherwise: [],
      stopProcessing: false,
    },
  ],
};

const insightsForm: FormDefinitionInput = {
  id: 'form-insights',
  name: 'Insights newsletter',
  slug: 'insights',
  fields: [{ id: 'f-ins-email', type: 'email', name: 'email', label: 'Work email', required: true, width: 'full' }],
  settings: {
    submitLabel: 'Subscribe',
    successMessage: 'Subscribed. The next briefing lands on the first Tuesday of the month.',
    honeypot: true,
    captcha,
    storeSubmissions: true,
    rateLimitPerMinute: 5,
    layout: 'stacked',
  },
  rules: [
    {
      id: 'rule-insights-notify',
      name: 'Notify insights editor',
      enabled: true,
      then: [
        { type: 'email', to: ['insights@northwind.example'], subject: 'New insights subscriber: {{email}}' },
        { type: 'tag', tags: ['newsletter'] },
      ],
      otherwise: [],
      stopProcessing: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const ctaSection = (
  eyebrow: string,
  heading: string,
  subheading: string,
  image: ReturnType<typeof img>,
  variant: 'banner' | 'centered' | 'split' = 'banner',
  tone: 'primary' | 'inverse' | 'surface' = 'primary',
): NodeInput => ({
  type: 'cta',
  variant,
  props: {
    eyebrow,
    heading,
    image,
    subheading,
    tone,
    buttons: [CTA_TALK, { label: 'See our work', link: '/case-studies', style: 'ghost' }],
  },
  animation: { preset: 'fade-up' },
});

const home: PageInput = {
  id: 'pg-home',
  title: 'Home',
  slug: '',
  isHomepage: true,
  status: 'published',
  seo: {
    ...seo(
      'Northwind Partners — Finance, payments & data advisory',
      'Independent advisors to banks, fintechs, insurers and the public sector on strategy, finance transformation, payments, risk and data — with measurable outcomes.',
    ),
    ogImage: photoUrl('towersUp', 1200),
  },
  sections: [
    {
      type: 'hero',
      variant: 'split',
      props: {
        eyebrow: 'Advisory · London · Singapore · New York',
        heading: 'Change that *clears*, settles and scales.',
        subheading:
          'We help the institutions that move money modernise finance, payments, risk and data — and we measure ourselves by the numbers that move after we leave.',
        buttons: [CTA_TALK, { label: 'Explore our services', link: '/services', style: 'outline' }],
        image: img('towersUp', { alt: 'Glass financial-district towers seen from street level' }),
        imageSide: 'right',
        height: 'tall',
        meta: [
          { label: 'Founded', value: '2011, London' },
          { label: 'Engagements', value: '420+ delivered' },
          { label: 'Client retention', value: '91%' },
        ],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'logo-cloud',
      variant: 'marquee',
      props: {
        eyebrow: 'Trusted by finance leaders at',
        align: 'center',
        tone: 'surface',
        spacingTop: 'md',
        spacingBottom: 'md',
        logos: [
          { name: 'Harbour & Strand' },
          { name: 'Kestrel Pay' },
          { name: 'Lumen Specialty' },
          { name: 'Meridian Private' },
          { name: 'Aster Energy' },
          { name: 'Civic Revenue' },
          { name: 'Northgate Mutual' },
          { name: 'Fieldstone Capital' },
        ],
        speed: 48,
      },
    },
    {
      type: 'text-section',
      variant: 'statement',
      props: {
        eyebrow: 'Why Northwind',
        heading: 'Most transformation programmes fail quietly — in the gap between the board paper and the Monday-morning process. We work in that gap.',
        body: 'Our consultants have run treasury desks, built payment schemes and closed the books at quarter-end. We bring that operator’s judgement to every engagement, and we stay until the change is owned by your people.',
        align: 'left',
        containerWidth: 'narrow',
        spacingTop: 'xl',
      },
      animation: { preset: 'text-reveal' },
    },
    {
      type: 'features',
      variant: 'cards',
      anchor: 'services',
      props: {
        eyebrow: 'What we do',
        heading: 'Four practices, *one* standard of evidence',
        subheading: 'Every engagement starts with a baseline and ends with a measured result.',
        columns: 4,
        imageAspect: '4:5',
        items: [
          { image: img('workshop', { alt: 'Strategy workshop with sticky notes on a glass wall' }), eyebrow: '01', title: SERVICES[0].title, text: SERVICES[0].short, link: '/services#strategy', linkLabel: 'Strategy' },
          { image: img('teamTable', { alt: 'Finance leaders meeting around a long table' }), eyebrow: '02', title: SERVICES[1].title, text: SERVICES[1].short, link: '/services#finance', linkLabel: 'Finance' },
          { image: img('workspace', { alt: 'Laptop showing payments code on a minimal desk' }), eyebrow: '03', title: SERVICES[2].title, text: SERVICES[2].short, link: '/services#payments', linkLabel: 'Payments & risk' },
          { image: img('developers', { alt: 'Data engineers working at their desks' }), eyebrow: '04', title: SERVICES[3].title, text: SERVICES[3].short, link: '/services#data', linkLabel: 'Data & AI' },
        ],
      },
      animation: { preset: 'stagger', target: 'children', stagger: 0.12 },
    },
    {
      type: 'stats',
      variant: 'large',
      props: {
        tone: 'inverse',
        eyebrow: 'Outcomes, not hours',
        heading: 'What the last three years added up to',
        columns: 4,
        items: [
          { value: '£1.4', suffix: 'bn', label: 'cost and capital released for clients', description: 'Audited against agreed baselines.' },
          { value: '38', suffix: '%', label: 'average reduction in settlement time', description: 'Across eleven payments programmes.' },
          { value: '5', suffix: ' days', label: 'median month-end close after transformation', description: 'Down from a median of eleven.' },
          { value: '91', suffix: '%', label: 'of clients return for a second engagement' },
        ],
      },
      animation: { preset: 'fade-up' },
    },
    {
      type: 'content-split',
      variant: 'overlap',
      props: {
        eyebrow: 'Our approach',
        heading: 'Senior people, small teams, *reversible* steps',
        body: 'We staff every engagement with a partner who stays on it — not one who appears for steering committees. Teams are deliberately small: four to eight people who know your systems by name.\n\nWe design change as a sequence of reversible releases, each with a measured outcome and a rollback plan. It is slower on a slide and much faster in production.',
        image: img('officeTeam', { alt: 'Northwind consultants working with a client team in a bright office' }),
        secondaryImage: img('teamPresentation', { alt: 'Partner presenting findings to a client steering group' }),
        imageSide: 'left',
        facts: [
          { label: 'Typical team', value: '4–8 people' },
          { label: 'Partner time', value: '≥ 40% on every engagement' },
          { label: 'First result', value: 'Within 90 days' },
        ],
        buttons: [{ label: 'How we work', link: '/services#approach', style: 'link' }],
      },
      animation: { preset: 'image-mask' },
    },
    {
      type: 'collection-list',
      variant: 'featured',
      props: {
        eyebrow: 'Selected work',
        heading: 'Recent case studies',
        subheading: 'Measured outcomes from engagements we are allowed to talk about.',
        collection: 'case-studies',
        limit: 3,
        imageAspect: '4:3',
        linkLabel: 'Read the case study',
        tone: 'surface',
        buttons: [{ label: 'All case studies', link: '/case-studies', style: 'outline' }],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'testimonials',
      variant: 'grid',
      props: {
        eyebrow: 'In their words',
        heading: 'What clients say after the *slides* are gone',
        columns: 3,
        showRating: false,
        items: [
          { quote: 'Northwind made a terrifying migration feel boring — which is the highest compliment a treasurer can give.', author: 'Eleanor Vance', role: 'Group Treasurer, Harbour & Strand Bank', avatar: img('portraitW5', { alt: 'Portrait of Eleanor Vance' }) },
          { quote: 'They challenged our numbers before they challenged our people. That earned them the right to do both.', author: 'Daniel Okafor', role: 'CFO, Lumen Specialty Insurance', avatar: img('portraitM5', { alt: 'Portrait of Daniel Okafor' }) },
          { quote: 'The best advisors leave you more capable than they found you. Our risk team is genuinely better for the work.', author: 'Priya Raman', role: 'Chief Risk Officer, Kestrel Pay', avatar: img('portraitW6', { alt: 'Portrait of Priya Raman' }) },
        ],
      },
    },
    {
      type: 'newsletter',
      variant: 'banner',
      props: {
        formId: 'form-insights',
        eyebrow: 'The Northwind Briefing',
        heading: 'One sharp read on finance, payments and risk — monthly.',
        text: 'Regulatory shifts, delivery lessons and the numbers behind them. No sales follow-up, unsubscribe in one click.',
        buttonLabel: 'Subscribe',
        placeholder: 'Your work email',
        image: img('conferenceHall', { alt: 'Finance leaders at a Northwind Briefing event' }),
        tone: 'surface-alt',
        spacingTop: 'md',
        spacingBottom: 'md',
      },
    },
    {
      type: 'cta',
      variant: 'image-background',
      props: {
        eyebrow: 'Start with a conversation',
        heading: 'Bring us the problem your board keeps *returning* to.',
        subheading: 'A forty-minute call with a partner. No pitch deck, no obligation — just a clear view of where we could help, and where we couldn’t.',
        image: img('skylineSunset', { alt: 'London skyline at sunset across the river' }),
        overlayOpacity: 0.55,
        buttons: [CTA_TALK, { label: '{{business.phone}}', link: 'tel:+442079460321', style: 'ghost' }],
      },
      animation: { preset: 'cinematic-reveal' },
    },
  ],
};

const services: PageInput = {
  id: 'pg-services',
  title: 'Services',
  slug: 'services',
  status: 'published',
  seo: seo(
    'Services — Strategy, finance, payments & data',
    'Strategy and operating model, finance transformation, payments and risk, and data and AI advisory — delivered by senior teams with measured, audited outcomes.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'minimal',
      props: {
        eyebrow: 'Services',
        heading: 'Four practices built around the *money* flow',
        subheading: 'From the strategy that sets direction to the ledger entry that proves it worked — we cover the whole path, so nothing falls between advisors.',
        height: 'auto',
        image: img('teamPresentation', { alt: 'Northwind team presenting a transformation roadmap' }),
        buttons: [CTA_TALK, { label: 'How we work', link: '/services#approach', style: 'outline' }],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'features',
      variant: 'icon-row',
      anchor: 'overview',
      props: {
        eyebrow: 'At a glance',
        heading: 'Choose a practice — or let the problem choose for you',
        subheading: 'Most of our engagements draw on two or more practices. One partner stays accountable throughout.',
        columns: 4,
        iconStyle: 'circle',
        tone: 'surface',
        spacingTop: 'md',
        spacingBottom: 'md',
        items: SERVICES.map((s) => ({ icon: s.icon, title: s.title, text: s.short, link: `/services#${s.anchor}`, linkLabel: 'Read more' })),
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'content-split',
      variant: 'standard',
      anchor: 'strategy',
      props: {
        eyebrow: '01 — Strategy & operating model',
        heading: 'A strategy your operations can *actually* run',
        body: 'We help executive teams choose where to compete — which products, segments and partnerships — and then design the operating model, governance and investment case that make the choice stick.\n\nEngagements typically include market and economics diagnostics, target operating model design, M&A and partnership screening, and a sequenced roadmap with owners and measures.',
        image: img('workshop', { alt: 'Executive strategy workshop mapping options on a wall' }),
        secondaryImage: img('architectPlans', { alt: 'Operating-model sketches on paper' }),
        buttons: [{ label: 'Discuss a strategy question', link: '/contact#contact-form', style: 'link' }],
        imageSide: 'left',
        imageAspect: '4:5',
        facts: [
          { label: 'Typical length', value: '8–14 weeks' },
          { label: 'Deliverables', value: 'Strategy, TOM, investment case, roadmap' },
          { label: 'Who we work with', value: 'CEO, COO, strategy and board' },
        ],
      },
      animation: { preset: 'image-mask' },
    },
    {
      type: 'content-split',
      variant: 'standard',
      anchor: 'finance',
      props: {
        tone: 'surface',
        eyebrow: '02 — Finance transformation',
        heading: 'Close faster, forecast better, report with confidence',
        body: 'We rebuild record-to-report, planning and performance management so finance spends its time explaining the numbers rather than assembling them.\n\nOur team has delivered IFRS 17 and IFRS 9 programmes, ERP and sub-ledger implementations, and close-acceleration work for banks and insurers on three continents.',
        image: img('documents', { alt: 'Finance team reviewing reporting packs beside laptops' }),
        secondaryImage: img('teamTable', { alt: 'Finance leadership team at a close review' }),
        buttons: [{ label: 'Read the Lumen case study', link: '/case-studies/lumen-insurance-five-day-close', style: 'link' }],
        imageSide: 'right',
        imageAspect: '4:5',
        facts: [
          { label: 'Median close', value: '11 → 5 working days' },
          { label: 'Specialisms', value: 'IFRS 17, IFRS 9, ERP, EPM' },
          { label: 'Who we work with', value: 'CFO, financial controller, FP&A' },
        ],
      },
    },
    {
      type: 'testimonials',
      variant: 'single',
      props: {
        eyebrow: 'Client perspective',
        align: 'center',
        showRating: false,
        spacingTop: 'md',
        spacingBottom: 'md',
        items: [{ quote: 'Quarter-end used to be a siege. Now it is a schedule — and my team goes home on time.', author: 'Daniel Okafor', role: 'CFO, Lumen Specialty Insurance' }],
      },
      animation: { preset: 'fade' },
    },
    {
      type: 'content-split',
      variant: 'standard',
      anchor: 'payments',
      props: {
        eyebrow: '03 — Payments & risk',
        heading: 'Real-time rails with controls regulators *trust*',
        body: 'We guide banks and payment firms through scheme access, ISO 20022 migration, real-time settlement and open banking — while building the fraud, AML and operational-resilience controls that let you move fast without surprises.\n\nWe sit comfortably between engineering, treasury and compliance, and we write documentation a supervisor can follow.',
        image: img('developers', { alt: 'Payments engineers working through a migration plan' }),
        secondaryImage: img('workspace', { alt: 'Payments code reviewed on a laptop' }),
        buttons: [{ label: 'Read the Kestrel Pay case study', link: '/case-studies/kestrel-pay-fraud-controls', style: 'link' }],
        imageSide: 'left',
        imageAspect: '4:5',
        facts: [
          { label: 'Settlement time', value: '−38% on average' },
          { label: 'Specialisms', value: 'ISO 20022, RTGS, fraud, AML, DORA' },
          { label: 'Who we work with', value: 'COO, CRO, head of payments' },
        ],
      },
      animation: { preset: 'clip-reveal' },
    },
    {
      type: 'content-split',
      variant: 'standard',
      anchor: 'data',
      props: {
        tone: 'surface',
        eyebrow: '04 — Data & AI advisory',
        heading: 'AI that earns its place on the P&L',
        body: 'We start with the decision you want to improve, not the model. Then we build what it needs: data ownership, quality, lineage and a governance framework your model-risk team will sign.\n\nOur AI work is deliberately unglamorous — triage, reconciliation, forecasting, document review — and it is in production at regulated institutions today.',
        image: img('dashboard', { alt: 'Model monitoring dashboard on a tablet' }),
        secondaryImage: img('codeScreen', { alt: 'Model pipeline code on a dark screen' }),
        buttons: [{ label: 'Read the Civic Revenue case study', link: '/case-studies/civic-revenue-agency-data-platform', style: 'link' }],
        imageSide: 'right',
        imageAspect: '4:5',
        facts: [
          { label: 'Use cases in production', value: '37 across 14 clients' },
          { label: 'Specialisms', value: 'Data governance, MLOps, model risk, GenAI' },
          { label: 'Who we work with', value: 'CDO, CIO, model risk' },
        ],
      },
    },
    {
      type: 'timeline',
      variant: 'steps',
      anchor: 'approach',
      props: {
        eyebrow: 'How we work',
        heading: 'Diagnose. Design. Deliver. *Sustain.*',
        subheading: 'Four stages, each with a decision point — so you can stop, adjust or accelerate on evidence.',
        align: 'center',
        items: [
          { date: 'Weeks 1–4', title: 'Diagnose', text: 'Baseline the numbers, interview the people who run the process, and agree what “better” means in measurable terms.' },
          { date: 'Weeks 4–10', title: 'Design', text: 'Shape the target state with your teams, test it against real transactions and build the business case line by line.' },
          { date: 'Months 3–12', title: 'Deliver', text: 'Ship in reversible releases with parallel runs and rollback triggers. Report outcomes monthly against the baseline.' },
          { date: 'Ongoing', title: 'Sustain', text: 'Hand over playbooks, train owners and return at 6 and 12 months to check the gains have held.' },
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'benefits',
      variant: 'grid',
      props: {
        tone: 'inverse',
        eyebrow: 'What you can expect',
        heading: 'The commitments behind every engagement',
        subheading: 'Written into our engagement letters, not just our marketing.',
        image: img('officeCorridor', { alt: 'Glass-walled meeting rooms in the Northwind office' }),
        columns: 3,
        items: [
          { icon: 'target', title: 'A measured baseline', text: 'Before we recommend anything, we agree the numbers we will be judged against.' },
          { icon: 'user-check', title: 'Partner-led, every week', text: 'The partner who wins the work spends at least 40% of their time on it.' },
          { icon: 'rotate-ccw', title: 'Reversible change', text: 'Every release has a rollback plan. Nothing irreversible happens on a Friday.' },
          { icon: 'file-check', title: 'Regulator-ready', text: 'Documentation written for supervisors, auditors and the people who inherit it.' },
          { icon: 'graduation-cap', title: 'Capability transfer', text: 'Your team runs the new process before we leave. We measure that too.' },
          { icon: 'scale', title: 'Fee at risk', text: 'On most delivery work, up to 20% of our fee is linked to the agreed outcomes.' },
        ],
      },
      animation: { preset: 'fade-up' },
    },
    {
      type: 'faq',
      variant: 'two-column',
      props: {
        eyebrow: 'Questions',
        heading: 'Working with Northwind',
        subheading: 'Straight answers to what procurement teams and sponsors usually ask first.',
        cta: { label: 'Ask us something else', link: '/contact#contact-form', style: 'link' },
        items: [
          { question: 'How large are your teams?', answer: 'Usually four to eight people, led by a partner. We would rather add a specialist for two weeks than carry a large team for six months.' },
          { question: 'Do you implement technology?', answer: 'We are vendor-independent. We select, design and assure implementations, and work alongside your engineering teams or integrators — we never resell software.' },
          { question: 'How do outcome-linked fees work?', answer: 'We agree a baseline and two or three measurable outcomes at the start. Up to 20% of the fee is paid when those outcomes are independently confirmed.' },
          { question: 'Which regulators have you worked with?', answer: 'Our teams have supported engagements with the PRA, FCA, MAS, the Federal Reserve and the OCC, as well as several EU national competent authorities.' },
          { question: 'Can you start quickly?', answer: 'A diagnostic can usually begin within three weeks of our first conversation. Larger delivery programmes are typically mobilised within six.' },
        ],
      },
    },
    ctaSection('Next step', 'Not sure which practice fits? Start with the problem.', 'Tell us what is slowing you down. We will tell you honestly whether we are the right firm to fix it.', img('keynote', { alt: 'Northwind partner speaking at a finance leadership briefing' }), 'split', 'primary'),
  ],
};

const industries: PageInput = {
  id: 'pg-industries',
  title: 'Industries',
  slug: 'industries',
  status: 'published',
  seo: seo(
    'Industries — Banking, payments, insurance & more',
    'Deep sector expertise across banking, payments, insurance, wealth, the public sector and energy — advisors who have run the operations they now help redesign.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'split',
      props: {
        eyebrow: 'Industries',
        heading: 'Sector depth, not *generic* frameworks',
        subheading: 'We focus on six industries where money movement, regulation and data collide. Our consultants have worked inside them — on desks, in control functions and in boardrooms.',
        image: img('boardroom', { alt: 'Boardroom with white chairs and city views' }),
        imageSide: 'left',
        height: 'tall',
        buttons: [CTA_TALK],
        meta: [
          { label: 'Sectors', value: '6' },
          { label: 'Regulators engaged', value: '14' },
          { label: 'Countries', value: '22' },
        ],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'features',
      variant: 'grid',
      props: {
        eyebrow: 'Where we work',
        heading: 'Six sectors, one shared language: risk, cash and trust',
        columns: 3,
        iconStyle: 'square',
        items: [
          { icon: 'landmark', title: 'Banking', text: 'Retail, commercial and transaction banks modernising core, treasury and settlement — under prudential scrutiny.' },
          { icon: 'credit-card', title: 'Payments', text: 'Fintechs, schemes and processors scaling volume while keeping fraud, safeguarding and resilience in hand.' },
          { icon: 'umbrella', title: 'Insurance', text: 'Specialty, life and general insurers tackling IFRS 17, claims economics and pricing data.' },
          { icon: 'gem', title: 'Wealth', text: 'Private banks and wealth managers redesigning onboarding, advice and the cost to serve.' },
          { icon: 'building-2', title: 'Public sector', text: 'Revenue agencies, central banks and departments building trusted data and fair, explainable AI.' },
          { icon: 'zap', title: 'Energy', text: 'Retailers and generators managing commodity risk, collateral and the treasury of the transition.' },
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'stats',
      variant: 'cards',
      props: {
        tone: 'surface',
        heading: 'Sector work in numbers',
        align: 'center',
        columns: 4,
        items: [
          { value: '62', label: 'banks and building societies advised' },
          { value: '£4.2', suffix: 'bn', label: 'daily payment value migrated without incident' },
          { value: '19', label: 'insurers taken through IFRS 17' },
          { value: '11', label: 'public bodies supported on data and AI' },
        ],
      },
    },
    {
      type: 'section',
      anchor: 'deep-dives',
      props: { spacingTop: 'xl', spacingBottom: 'xl' },
      children: [
        { type: 'text', props: { text: 'Industry deep dives', eyebrow: true } },
        { type: 'heading', props: { text: 'What we are working on in each *sector* right now', level: 'h2', size: 'lg' } },
        { type: 'text', props: { text: 'A snapshot of the problems our clients are bringing us this year — and how we are approaching them.', muted: true, size: 'lg' } },
        {
          type: 'tabs',
          props: {
            style: 'pills',
            items: [
              { label: 'Banking', heading: 'Real-time settlement and the end of the batch window', text: 'With ISO 20022 complete, the focus has shifted to what the richer data enables: intraday liquidity, automated reconciliation and better sanctions screening. We are helping banks retire batch-era controls that no longer fit a 24/7 world.', image: img('towersMono', { alt: 'Looking up between bank towers in the financial district' }), buttons: [{ label: 'Read the Harbour & Strand case', link: '/case-studies/harbour-bank-real-time-settlement', style: 'link' }] },
              { label: 'Payments', heading: 'Growing volume without growing fraud', text: 'Authorised push-payment fraud reimbursement has changed the economics of instant payments. We help firms combine behavioural analytics, confirmation of payee and case management so that losses fall as volume rises.', image: img('laptopAnalytics', { alt: 'Fraud trend analytics on a laptop' }), buttons: [{ label: 'Read the Kestrel Pay case', link: '/case-studies/kestrel-pay-fraud-controls', style: 'link' }] },
              { label: 'Insurance', heading: 'Life after IFRS 17 go-live', text: 'Most insurers met the deadline; few are happy with the close. We are simplifying data flows between actuarial and finance, automating sub-ledgers and turning compliance investment into faster insight.', image: img('meetingRoom', { alt: 'Insurance finance leaders reviewing a close plan' }) },
              { label: 'Wealth', heading: 'Lowering the cost to serve without losing the relationship', text: 'Digital onboarding, suitability automation and a shared client-service hub free advisers to spend time where clients value it most.' },
              { label: 'Public sector', heading: 'Explainable AI for public services', text: 'Agencies want productivity without eroding trust. We design human-in-the-loop AI with clear accountability, audit trails and fairness testing built in from the start.', image: img('conferenceHall', { alt: 'Public-sector data summit in a hall with arched windows' }) },
              { label: 'Energy', heading: 'Treasury for a volatile transition', text: 'Collateral calls, hedging policy and long-dated investment decisions now sit at the heart of energy finance. We bring bank-grade treasury discipline to retailers and generators.' },
            ],
          },
        },
      ],
      animation: { preset: 'fade-up' },
    },
    {
      type: 'comparison-table',
      props: {
        tone: 'surface',
        eyebrow: 'Practice coverage',
        heading: 'Which practices we bring to each sector',
        columns: [{ label: 'Strategy' }, { label: 'Finance' }, { label: 'Payments & risk', highlighted: true }, { label: 'Data & AI' }],
        rows: [
          { label: 'Banking', values: ['●', '●', '●', '●'] },
          { label: 'Payments', values: ['●', '○', '●', '●'] },
          { label: 'Insurance', values: ['●', '●', '○', '●'] },
          { label: 'Wealth', values: ['●', '○', '○', '●'] },
          { label: 'Public sector', values: ['○', '●', '○', '●'] },
          { label: 'Energy', values: ['●', '●', '●', '○'] },
        ],
        caption: '● Core practice for the sector   ○ Delivered with specialist partners',
      },
    },
    ctaSection('Sector briefings', 'Your sector, your regulator, your numbers.', 'We will bring people who have done the job you are asking us to improve. Tell us where it hurts.', img('towersMono', { alt: 'Monochrome view up between financial-district towers' }), 'banner', 'inverse'),
  ],
};

const caseStudiesPage: PageInput = {
  id: 'pg-case-studies',
  title: 'Case studies',
  slug: 'case-studies',
  status: 'published',
  seo: seo(
    'Case studies — Measured client outcomes',
    'Selected Northwind Partners engagements in banking, payments, insurance, wealth, energy and the public sector, each with audited before-and-after results.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'minimal',
      props: {
        eyebrow: 'Case studies',
        heading: 'The work, and the *numbers* it moved',
        subheading: 'Every case below was measured against a baseline agreed with the client at the start. Where we can’t share names, we have changed them — never the results.',
        height: 'auto',
        image: img('boardroom', { alt: 'Boardroom where Northwind presents programme results' }),
        buttons: [CTA_TALK],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'collection-list',
      variant: 'grid',
      props: {
        eyebrow: 'All engagements',
        heading: 'Banking, payments, insurance, wealth, energy and the public sector',
        subheading: 'Newest first. Each case links to the full story, the numbers and the client’s own verdict.',
        collection: 'case-studies',
        columns: 3,
        imageAspect: '4:3',
        linkLabel: 'Read the case study',
        spacingTop: 'sm',
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    ctaSection('Your outcome next', 'Want results like these?', 'Every engagement starts with an honest diagnostic. If we cannot see a measurable outcome, we will say so.', img('conference', { alt: 'Audience at a Northwind client briefing' }), 'centered', 'surface'),
  ],
};

const caseStudyDetail: PageInput = {
  id: 'pg-case-study-detail',
  title: 'Case study',
  slug: 'case-study-detail',
  kind: 'collection-template',
  collection: 'case-studies',
  status: 'published',
  seo: { title: '{{item.title}}', description: '{{item.summary}}' },
  sections: [
    {
      type: 'hero',
      variant: 'editorial',
      props: {
        eyebrow: '{{item.industry}} · Case study',
        heading: '{{item.title}}',
        subheading: '{{item.summary}}',
        image: { src: '{{item.image}}', alt: '{{item.title}}' },
        height: 'tall',
        buttons: [{ label: 'Discuss a similar challenge', link: '/contact#contact-form', style: 'primary' }],
        meta: [
          { label: 'Client', value: '{{item.client}}' },
          { label: 'Industry', value: '{{item.industry}}' },
          { label: 'Duration', value: '{{item.duration}}' },
        ],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'stats',
      variant: 'large',
      props: {
        tone: 'inverse',
        eyebrow: 'Results',
        columns: 3,
        items: [
          { value: '{{item.result1}}', label: '{{item.result1Label}}' },
          { value: '{{item.result2}}', label: '{{item.result2Label}}' },
          { value: '{{item.result3}}', label: '{{item.result3Label}}' },
        ],
      },
      animation: { preset: 'fade-up' },
    },
    {
      type: 'text-section',
      variant: 'two-column',
      props: { eyebrow: '01', heading: 'The challenge', body: '{{item.challenge}}', align: 'left' },
    },
    {
      type: 'text-section',
      variant: 'two-column',
      props: { eyebrow: '02', heading: 'What we did', body: '{{item.solution}}', align: 'left', tone: 'surface' },
      animation: { preset: 'fade-up' },
    },
    {
      type: 'testimonials',
      variant: 'single',
      props: {
        eyebrow: 'The client’s verdict',
        align: 'center',
        showRating: false,
        items: [{ quote: '{{item.quote}}', author: '{{item.quoteAuthor}}', role: '{{item.client}}' }],
      },
    },
    {
      type: 'collection-list',
      variant: 'grid',
      props: {
        eyebrow: 'Keep reading',
        heading: 'More case studies',
        collection: 'case-studies',
        limit: 3,
        excludeCurrent: true,
        columns: 3,
        tone: 'surface',
        linkLabel: 'Read the case study',
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    ctaSection('Talk it through', 'Facing something similar?', 'We would be glad to walk you through this engagement in more detail — including what we would do differently.', img('keynote', { alt: 'Northwind partner presenting engagement results' }), 'banner', 'primary'),
  ],
};

const about: PageInput = {
  id: 'pg-about',
  title: 'About',
  slug: 'about',
  status: 'published',
  seo: seo(
    'About Northwind Partners — Our story and leadership',
    'Founded in London in 2011 by former treasury and payments operators, Northwind Partners now advises institutions from offices in London, Singapore and New York.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'editorial',
      props: {
        eyebrow: 'About us',
        heading: 'Built by operators who got *tired* of slideware',
        subheading: 'Northwind was founded by people who had been on the receiving end of consulting — and wanted to build the firm they wished had walked through the door.',
        image: img('officeOpen', { alt: 'Northwind’s bright open-plan London office' }),
        height: 'tall',
        buttons: [{ label: 'Meet the partners', link: '/about#leadership', style: 'primary' }, { label: 'Careers', link: '/careers', style: 'ghost' }],
      },
      animation: { preset: 'editorial-reveal' },
    },
    {
      type: 'content-split',
      variant: 'collage',
      props: {
        eyebrow: 'Our story',
        heading: 'From a two-person treasury practice to three continents',
        body: 'In 2011, Amara Lindqvist and Tomás Reyes left a clearing bank’s treasury desk with one client and a simple rule: never recommend anything you would not be willing to run yourself.\n\nFifteen years later we are 140 people across London, Singapore and New York. The rule hasn’t changed. Neither has our independence — Northwind is owned by its partners and takes no vendor commissions.',
        image: img('officeCorridor', { alt: 'Glass-walled corridor in the Northwind office' }),
        secondaryImage: img('highFive', { alt: 'Northwind colleagues celebrating a successful go-live' }),
        imageSide: 'right',
        facts: [
          { label: 'People', value: '140' },
          { label: 'Partners', value: '22, all practising' },
          { label: 'Ownership', value: '100% partner-owned' },
        ],
        signature: 'Amara Lindqvist & Tomás Reyes, founders',
        buttons: [{ label: 'Join us', link: '/careers', style: 'link' }],
      },
      animation: { preset: 'image-mask' },
    },
    {
      type: 'team',
      variant: 'list',
      anchor: 'leadership',
      props: {
        tone: 'surface',
        eyebrow: 'Leadership',
        heading: 'The partners who lead our *practices*',
        subheading: 'Twenty-two partners, all of them practising. These six lead our practices and offices.',
        portraitAspect: '4:5',
        members: [
          { name: 'Amara Lindqvist', role: 'Co-founder & Managing Partner, London', bio: 'Former head of liquidity at a UK clearing bank. Leads our banking practice and chairs the partnership.', photo: img('portraitW1', { alt: 'Portrait of Amara Lindqvist' }), links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/' }] },
          { name: 'Tomás Reyes', role: 'Co-founder & Partner, Payments & Risk', bio: 'Built two real-time payment schemes and spent six years in financial-crime leadership. Advises CROs on fraud and resilience.', photo: img('portraitM3', { alt: 'Portrait of Tomás Reyes' }), links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/' }] },
          { name: 'Hana Whitfield', role: 'Partner, Finance Transformation', bio: 'Chartered accountant and former group financial controller at a FTSE 100 insurer. Has led eleven IFRS 17 programmes.', photo: img('portraitW3', { alt: 'Portrait of Hana Whitfield' }) },
          { name: 'Wei Jie Tan', role: 'Partner & Head of Singapore', bio: 'Leads our Asia-Pacific practice, with a focus on central banks, cross-border payments and regulatory technology.', photo: img('portraitM1', { alt: 'Portrait of Wei Jie Tan' }) },
          { name: 'Grace Adeyemi', role: 'Partner, Data & AI', bio: 'Former chief data officer at a public revenue agency. Specialises in data governance and explainable AI in regulated settings.', photo: img('portraitW7', { alt: 'Portrait of Grace Adeyemi' }) },
          { name: 'Marcus Hale', role: 'Partner & Head of New York', bio: 'Two decades in wealth and asset management operations. Leads our North American practice and our wealth sector work.', photo: img('portraitM7', { alt: 'Portrait of Marcus Hale' }) },
        ],
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'timeline',
      variant: 'alternating',
      props: {
        eyebrow: 'Milestones',
        heading: 'Fifteen years, briefly',
        items: [
          { date: '2011', title: 'Founded in London', text: 'Two partners, one client, a rented desk in Moorgate.' },
          { date: '2014', title: 'Finance practice opens', text: 'Hana Whitfield joins to lead close and reporting work for insurers.' },
          { date: '2017', title: 'Singapore office', text: 'Our first office outside the UK, serving central banks and regional lenders.' },
          { date: '2020', title: 'Outcome-linked fees', text: 'We begin putting up to 20% of delivery fees at risk against agreed results.' },
          { date: '2023', title: 'New York office', text: 'Marcus Hale opens our North American practice with a focus on wealth.' },
          { date: '2026', title: '420 engagements', text: 'And a 91% rate of clients returning for a second piece of work.' },
        ],
      },
    },
    {
      type: 'logo-cloud',
      variant: 'grid',
      props: {
        tone: 'surface-alt',
        eyebrow: 'Certifications & memberships',
        align: 'center',
        columns: 5,
        logos: [
          { name: 'ISO 27001 Certified' },
          { name: 'B Corp Pending' },
          { name: 'Cyber Essentials Plus' },
          { name: 'Payments Association' },
          { name: 'UK Finance Associate' },
        ],
      },
      animation: { preset: 'fade' },
    },
    {
      type: 'cta',
      variant: 'image-background',
      props: {
        eyebrow: 'Get in touch',
        heading: 'Work with us — or *for* us',
        subheading: 'Whether you have a problem to solve or a career to build, the conversation starts the same way.',
        image: img('skyline', { alt: 'City skyline beside the water at dusk' }),
        overlayOpacity: 0.55,
        buttons: [CTA_TALK, { label: 'View careers', link: '/careers', style: 'ghost' }],
      },
      animation: { preset: 'cinematic-reveal' },
    },
  ],
};

const ROLES = [
  { title: 'Senior Payments Consultant', eyebrow: 'London · Payments & Risk', text: 'Lead workstreams on real-time settlement and scheme migration for UK and European banks. Six or more years in payments operations, product or engineering.' },
  { title: 'Finance Transformation Manager', eyebrow: 'London · Finance', text: 'Run close-acceleration and sub-ledger programmes for insurers. Qualified accountant with IFRS 17 or IFRS 9 delivery experience.' },
  { title: 'Data & AI Principal', eyebrow: 'New York · Data & AI', text: 'Shape model governance and AI use cases for wealth and banking clients. Strong in data architecture and comfortable in front of a risk committee.' },
  { title: 'Risk & Regulation Associate', eyebrow: 'Singapore · Payments & Risk', text: 'Support MAS-regulated clients on operational resilience and financial-crime controls. Two to four years in risk, audit or compliance.' },
  { title: 'Graduate Analyst, 2027 intake', eyebrow: 'All offices', text: 'A two-year programme rotating through our four practices, with a dedicated partner mentor and a professional qualification funded in full.' },
];

const careers: PageInput = {
  id: 'pg-careers',
  title: 'Careers',
  slug: 'careers',
  status: 'published',
  seo: seo(
    'Careers at Northwind Partners',
    'Join a partner-owned advisory firm where small senior teams do meaningful work for banks, fintechs and insurers. Open roles in London, Singapore and New York.',
  ),
  sections: [
    {
      type: 'hero',
      variant: 'fullscreen-image',
      props: {
        eyebrow: 'Careers',
        heading: 'Do the work you’d *want* to be judged on',
        subheading: 'Small teams, senior colleagues and clients who measure results. We hire people who would rather be right than busy.',
        image: img('teamLaptops', { alt: 'Northwind consultants collaborating around laptops' }),
        overlayOpacity: 0.5,
        contentPosition: 'bottom-left',
        buttons: [{ label: 'See open roles', link: '/careers#roles', style: 'primary' }, { label: 'Apply now', link: '/careers#apply', style: 'ghost' }],
        showScrollCue: true,
      },
      animation: { preset: 'cinematic-reveal' },
    },
    {
      type: 'text-section',
      variant: 'intro',
      props: {
        eyebrow: 'Life at Northwind',
        heading: 'Fewer clients, deeper work, real ownership',
        body: 'Our consultants typically work on one engagement at a time, with a partner beside them. You will present to executives in your first year and own a workstream in your second.\n\nWe care about how you think more than where you studied. About a third of our people joined from industry — treasury desks, risk functions, engineering teams — and they are some of our best advisors.',
        align: 'center',
        containerWidth: 'narrow',
      },
      animation: { preset: 'text-reveal' },
    },
    {
      type: 'benefits',
      variant: 'with-image',
      props: {
        tone: 'surface',
        eyebrow: 'Benefits',
        heading: 'What we offer in return',
        image: img('officeTeam', { alt: 'Colleagues working together in the London office' }),
        imageSide: 'left',
        columns: 2,
        items: [
          { icon: 'calendar-heart', title: '30 days’ holiday', text: 'Plus bank holidays and a week between Christmas and New Year.' },
          { icon: 'house', title: 'Hybrid by design', text: 'Two anchor days with your team; the rest is yours.' },
          { icon: 'book-open', title: '£5,000 learning budget', text: 'Every year, for qualifications, courses or conferences.' },
          { icon: 'heart-pulse', title: 'Private healthcare', text: 'Comprehensive cover for you and your family from day one.' },
          { icon: 'baby', title: '26 weeks’ parental leave', text: 'Fully paid, for every parent, however your family grows.' },
          { icon: 'piggy-bank', title: 'Profit share', text: 'Everyone shares in the firm’s results, not only partners.' },
        ],
      },
      animation: { preset: 'fade-up' },
    },
    {
      type: 'features',
      variant: 'list',
      anchor: 'roles',
      props: {
        eyebrow: 'Open roles',
        heading: 'Current *opportunities*',
        subheading: 'Don’t see your role? We welcome speculative applications from experienced operators.',
        columns: 1,
        items: ROLES.map((r) => ({ ...r, link: '/careers#apply', linkLabel: 'Apply for this role' })),
      },
      animation: { preset: 'stagger', target: 'children' },
    },
    {
      type: 'faq',
      variant: 'accordion',
      props: {
        tone: 'surface',
        eyebrow: 'Hiring process',
        heading: 'What to expect',
        subheading: 'Questions we hear most from candidates. Anything else, write to talent@northwind.example.',
        cta: { label: 'Email the talent team', link: 'mailto:talent@northwind.example', style: 'link' },
        containerWidth: 'narrow',
        items: [
          { question: 'What does the process look like?', answer: 'A call with our talent team, a case conversation with two consultants, and a final meeting with a partner. Most candidates hear back within three weeks.' },
          { question: 'Do you sponsor visas?', answer: 'Yes, in all three offices for experienced hires. Our talent team will talk you through timelines early.' },
          { question: 'How much travel is involved?', answer: 'Most work is with clients in your home city. Cross-border travel averages four to six trips a year.' },
          { question: 'Can I work part-time?', answer: 'Yes. Around 12% of our people work reduced hours, including three partners.' },
        ],
      },
    },
    {
      type: 'form',
      variant: 'split-with-text',
      anchor: 'apply',
      props: {
        formId: 'form-application',
        eyebrow: 'Apply',
        heading: 'Start your application',
        subheading: 'Five minutes, no cover letter required. Tell us which role interests you and share a link to your CV or profile.',
        image: img('highFive', { alt: 'Colleagues celebrating together in the office' }),
        showContactDetails: false,
      },
    },
  ],
};

const contact: PageInput = {
  id: 'pg-contact',
  title: 'Contact',
  slug: 'contact',
  status: 'published',
  seo: seo(
    'Contact Northwind Partners — London, Singapore, NY',
    'Speak with a Northwind partner about strategy, finance transformation, payments, risk or data. Offices in London, Singapore and New York; replies within a day.',
  ),
  sections: [
    {
      type: 'text-section',
      variant: 'intro',
      props: {
        eyebrow: 'Contact',
        heading: 'Let’s talk about what *needs* to change',
        headingLevel: 'h1',
        body: 'Every enquiry is read by a partner, and you will hear back within one working day. If it is easier to talk, call our London office on {{business.phone}}.',
        align: 'left',
        spacingBottom: 'md',
      },
      animation: { preset: 'text-reveal' },
    },
    {
      type: 'contact-info',
      variant: 'cards',
      props: {
        eyebrow: 'Offices',
        heading: 'London, Singapore and New York',
        subheading: 'Our London headquarters handles enquiries from Europe, the Middle East and Africa.',
        showWhatsapp: false,
        showHours: true,
        showSocial: true,
        extra: [
          { label: 'Singapore', value: '12 Marina View, #21-04, Singapore 018961', link: 'tel:+6568800214' },
          { label: 'New York', value: '275 Park Avenue South, 9th Floor, New York, NY 10010', link: 'tel:+12125550188' },
          { label: 'Careers', value: 'talent@northwind.example', link: 'mailto:talent@northwind.example' },
          { label: 'Press', value: 'press@northwind.example', link: 'mailto:press@northwind.example' },
        ],
      },
    },
    {
      type: 'section',
      props: { tone: 'surface', spacingTop: 'lg', spacingBottom: 'lg' },
      children: [
        {
          type: 'columns',
          props: { ratio: '5:7', gap: 'xl', alignItems: 'center' },
          children: [
            {
              type: 'stack',
              props: { gap: 'md' },
              children: [
                { type: 'text', props: { text: 'Headquarters', eyebrow: true } },
                { type: 'heading', props: { text: 'Our London office', level: 'h2' } },
                { type: 'text', props: { text: '{{business.address}}. Five minutes from Moorgate and Liverpool Street; step-free access via the Finsbury Circus entrance.', muted: true } },
                { type: 'button', props: { label: 'Get directions', link: 'https://www.google.com/maps/search/?api=1&query=Finsbury+Circus+London', style: 'outline' } },
              ],
            },
            { type: 'map', props: { query: '{{business.address}}', height: 'lg', zoom: 15, title: 'Map showing the Northwind Partners London office' } },
          ],
        },
      ],
    },
    {
      type: 'form',
      variant: 'card',
      anchor: 'contact-form',
      props: {
        formId: 'form-contact',
        eyebrow: 'Enquiry',
        heading: 'Tell us about your challenge',
        subheading: 'The more context you share, the more useful our first conversation will be.',
        showContactDetails: false,
      },
      animation: { preset: 'fade-up' },
    },
    {
      type: 'faq',
      variant: 'two-column',
      props: {
        eyebrow: 'Good to know',
        heading: 'Before you get in touch',
        subheading: 'A few practical answers for procurement and legal teams.',
        cta: { label: 'Email the partnership desk', link: 'mailto:hello@northwind.example', style: 'link' },
        tone: 'surface',
        items: [
          { question: 'Do you sign NDAs before a first call?', answer: 'Happily. Send yours with your enquiry, or ask for our mutual NDA, which most clients accept unchanged.' },
          { question: 'Do you respond to RFPs?', answer: 'Yes, selectively. We are more useful when we can speak with the sponsor first, so please include a contact.' },
          { question: 'Can we meet in person?', answer: 'Of course — in any of our offices, or at yours. Our partners spend most of their time on client sites.' },
        ],
      },
    },
  ],
};

const privacy: PageInput = {
  id: 'pg-privacy',
  title: 'Privacy',
  slug: 'privacy',
  status: 'published',
  seo: seo(
    'Privacy notice — Northwind Partners',
    'How Northwind Partners collects, uses and protects personal data from enquiries, job applications and newsletter subscribers, and how to exercise your rights.',
  ),
  sections: [
    {
      type: 'text-section',
      variant: 'intro',
      props: {
        eyebrow: 'Legal',
        heading: 'Privacy notice',
        headingLevel: 'h1',
        body: 'Northwind Partners LLP is the controller of personal data you share through this website. We collect only what we need to respond to enquiries, consider job applications and send the newsletters you ask for.',
        align: 'left',
        containerWidth: 'narrow',
      },
    },
    {
      type: 'text-section',
      variant: 'two-column',
      props: {
        eyebrow: 'Your data',
        heading: 'How we use your data',
        body: 'Enquiry details are kept for up to two years and used only to respond and, if we work together, to manage the relationship. Job applications are kept for twelve months unless you ask us to delete them sooner.\n\nWe use privacy-friendly analytics without advertising cookies. We never sell personal data, and we share it only with processors bound by contract — such as our email and hosting providers.\n\nYou can ask to access, correct or delete your data at any time by writing to {{business.email}}. You also have the right to complain to the Information Commissioner’s Office.',
        align: 'left',
        tone: 'surface',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Website
// ---------------------------------------------------------------------------

const website: WebsiteInput = {
  settings: {
    name: NAME,
    business: {
      name: NAME,
      legalName: 'Northwind Partners LLP',
      type: 'ProfessionalService',
      tagline: TAGLINE,
      description: DESCRIPTION,
      phone: '+44 20 7946 0321',
      email: 'hello@northwind.example',
      address: {
        street: '18 Finsbury Circus',
        locality: 'London',
        postalCode: 'EC2M 7EB',
        country: 'United Kingdom',
        formatted: '18 Finsbury Circus, London EC2M 7EB, United Kingdom',
      },
      geo: { lat: 51.5176, lng: -0.0868 },
      openingHours: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], opens: '08:30', closes: '18:30', label: 'London office' }],
      foundedYear: 2011,
    },
    social: socialFrom({
      linkedin: 'https://www.linkedin.com/company/northwind-partners-example',
      x: 'https://x.com/northwind_example',
      youtube: 'https://www.youtube.com/@northwind-example',
    }),
    branding: { wordmark: NAME },
    seo: {
      siteTitle: NAME,
      titleTemplate: `%s | ${NAME}`,
      description: DESCRIPTION,
      ogImage: photoUrl('towersUp', 1200),
      robots: { index: true, follow: true },
      canonicalBase: 'https://northwind.example',
      twitterHandle: '@northwind_example',
      structuredData: [
        { type: 'Organization', auto: true },
        { type: 'WebSite', auto: true },
      ],
      verification: {},
    },
    localization: { defaultLocale: 'en', locales: ['en'], strategy: 'prefix-except-default' },
    scripts: [],
    cookieConsent: {
      enabled: true,
      title: 'Cookies',
      message: 'We use essential cookies to run this site and, with your permission, privacy-friendly analytics.',
      policyUrl: '/privacy',
      categories: ['necessary', 'analytics'],
      position: 'bottom-left',
    },
    analytics: { builtIn: true },
    variables: { responseTime: 'one working day' },
  },
  theme: themeFrom('corporate-modern', 'corporate-modern', {
    name: 'Northwind Navy',
    colors: { ...THEME_PRESETS['corporate-modern']!.colors, primary: '#0B2A4F', secondary: '#0E1A33', accent: '#0F8B8D', inverse: '#08172C' },
    motion: { intensity: 'subtle', ease: 'power2.out', duration: 0.7 },
  }),
  navigation: {
    menus: {
      primary: [
        {
          id: 'nav-services',
          label: 'Services',
          link: '/services',
          children: SERVICES.map((s) => ({ id: `nav-services-${s.anchor}`, label: s.title, link: `/services#${s.anchor}`, description: s.short.slice(0, 120) })),
        },
        { id: 'nav-industries', label: 'Industries', link: '/industries' },
        { id: 'nav-case-studies', label: 'Case studies', link: '/case-studies' },
        { id: 'nav-about', label: 'About', link: '/about' },
        { id: 'nav-careers', label: 'Careers', link: '/careers' },
      ],
      'footer-services': SERVICES.map((s) => ({ id: `ft-services-${s.anchor}`, label: s.title, link: `/services#${s.anchor}` })),
      'footer-firm': [
        { id: 'ft-industries', label: 'Industries', link: '/industries' },
        { id: 'ft-case-studies', label: 'Case studies', link: '/case-studies' },
        { id: 'ft-about', label: 'About', link: '/about' },
        { id: 'ft-careers', label: 'Careers', link: '/careers' },
        { id: 'ft-contact', label: 'Contact', link: '/contact' },
      ],
      legal: [
        { id: 'legal-privacy', label: 'Privacy notice', link: '/privacy' },
        { id: 'legal-contact', label: 'Accessibility', link: '/contact' },
      ],
    },
  },
  header: {
    type: 'site-header',
    variant: 'classic',
    props: { menu: 'primary', cta: CTA_TALK, sticky: true, transparentOnHero: false, showContact: false, width: 'wide' },
  },
  footer: {
    type: 'site-footer',
    variant: 'columns',
    props: {
      description: 'Independent advisory for banks, fintechs, insurers and the public sector. London · Singapore · New York.',
      columns: [
        { title: 'Services', menu: 'footer-services', links: [] },
        { title: 'Firm', menu: 'footer-firm', links: [] },
        {
          title: 'Offices',
          links: [
            { label: 'London (HQ)', link: '/contact' },
            { label: 'Singapore', link: '/contact' },
            { label: 'New York', link: '/contact' },
          ],
        },
      ],
      showContact: true,
      showSocial: true,
      showNewsletter: true,
      newsletterFormId: 'form-insights',
      newsletterHeading: 'The Northwind Briefing',
      legalMenu: 'legal',
      copyright: '© {{year}} Northwind Partners LLP. Registered in England and Wales.',
      tone: 'inverse',
    },
  },
  pages: [home, services, industries, caseStudiesPage, caseStudyDetail, about, careers, contact, privacy],
  forms: [contactForm, applicationForm, insightsForm],
  collections: [caseStudies],
};

export const northwindPartners: DemoSite = {
  key: KEY,
  slug: 'northwind',
  name: NAME,
  description: 'A modern advisory firm for banks, fintechs and insurers — services with deep links, industry tabs, a case-study CMS with detail pages, careers and routed enquiry forms.',
  category: 'business',
  tags: ['consulting', 'fintech', 'advisory', 'corporate', 'case studies', 'careers', 'b2b'],
  thumbnail: photoUrl('towersUp', 1200),
  website,
};
