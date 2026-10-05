import { photoUrl } from '../images';
import type { Blueprint, BlueprintInput } from '../types';
import { projectDetailPage, projectsCollection, type ProjectSeed } from './projects';
import {
  anim, assemble, btn, buildForm, contactPage, contextOf, ctaSection, field, footer, header, heroCopy, homeTitle, img,
  metaDescription, metaTitle, navItem, page, privacyPage, testimonialsSection, type Section,
} from './shared';

const PROJECTS: ProjectSeed[] = [
  { slug: 'quiet-house', name: 'Quiet House', client: 'Private client', category: 'Interiors', year: '2026', summary: 'A calm, light-filled family home shaped around timber, linen and stone.', description: 'A full interior for a family of five: a palette of oak, lime plaster and natural stone, with furniture designed for the space.\n\nThe brief was simple — a house that feels calm at the end of a long day.', image: 'livingLight', gallery: ['livingOpen', 'kitchen', 'bathStone'] },
  { slug: 'atlas-journal', name: 'Atlas Journal', client: 'Atlas Publishing', category: 'Editorial design', year: '2025', summary: 'Art direction and a type system for an independent travel quarterly.', description: 'A new format, grid and typographic system for a quarterly magazine, plus photography direction for its first four issues.\n\nThe redesign won a national editorial design award.', image: 'designSwatches', gallery: ['tabletDesign', 'architectPlans', 'workspace'] },
  { slug: 'lumen-app', name: 'Lumen', client: 'Lumen Health', category: 'Product design', year: '2025', summary: 'A gentle, accessible mobile app for tracking sleep and recovery.', description: 'End-to-end product design for a wellbeing start-up — research, interaction design and a component library handed over to engineering.\n\nThe app launched with a 4.8 rating in its first month.', image: 'abstractGradient', gallery: ['laptopCode', 'dashboard', 'abstractWaves'] },
  { slug: 'field-studio', name: 'Field Studio', client: 'Field Studio', category: 'Brand identity', year: '2024', summary: 'An identity for an architecture practice working with natural materials.', description: 'A wordmark, stationery and website for a small practice, inspired by survey drawings and handmade paper.\n\nSimple, quiet and built to last.', image: 'architectPlans', gallery: ['houseModern', 'glassArchitecture', 'studioLoft'] },
];

function build(input: BlueprintInput) {
  const ctx = contextOf(input);
  const { name, notify } = ctx;
  const hero = heroCopy(input, 'Design with *quiet* confidence', 'Independent designer and art director working across identity, editorial, interiors and digital products — for people who care about the details.');

  const home: Section[] = [
    {
      type: 'hero',
      variant: 'minimal',
      props: { eyebrow: '{{business.name}}', heading: hero.heading, subheading: hero.subheading, buttons: [btn('View projects', '/projects'), btn('Get in touch', '/contact#enquire', 'link')], height: 'tall', contentPosition: 'left', spacingTop: 'xl', spacingBottom: 'md' },
      animation: anim.words,
    },
    { type: 'collection-list', variant: 'grid', props: { eyebrow: 'Selected projects', collection: 'projects', limit: 4, columns: 2, imageAspect: '4:3', linkLabel: 'View project', buttons: [btn('All projects', '/projects', 'outline')], spacingTop: 'md' }, animation: anim.stagger },
    {
      type: 'text-section',
      variant: 'statement',
      props: { tone: 'surface', heading: 'I believe good design should feel *inevitable* — as if it could not have been any other way.', body: 'Ten years of working with founders, publishers and architects have taught me to listen first, edit ruthlessly and sweat the last ten percent.', buttons: [btn('About me', '/about', 'link')], align: 'center', containerWidth: 'narrow', spacingTop: 'xl', spacingBottom: 'xl' },
      animation: anim.text,
    },
    {
      type: 'features',
      variant: 'icon-row',
      props: { eyebrow: 'Services', heading: 'How I can *help*', items: [{ icon: 'pen-tool', title: 'Identity', text: 'Logos, type and visual systems.' }, { icon: 'book-open', title: 'Editorial', text: 'Magazines, books and reports.' }, { icon: 'sofa', title: 'Interiors', text: 'Calm, considered living spaces.' }, { icon: 'monitor', title: 'Digital', text: 'Websites and product design.' }], columns: 4 },
      animation: anim.stagger,
    },
    testimonialsSection([
      { quote: 'Thoughtful, precise and a joy to collaborate with. The work speaks for itself.', author: 'Editor-in-chief', role: 'Independent quarterly' },
    ], { variant: 'single', tone: 'default', eyebrow: 'Kind words' }),
    ctaSection({ heading: 'Have a project in *mind*?', subheading: 'I take on a small number of projects each season.', buttons: [btn('Start a conversation', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const projects: Section[] = [
    { type: 'text-section', variant: 'intro', props: { eyebrow: 'Projects', heading: 'Selected *work*', headingLevel: 'h1', body: 'Identity, editorial, interiors and digital projects from the last few years.', align: 'left', spacingTop: 'xl', spacingBottom: 'md' }, animation: anim.text },
    { type: 'collection-list', variant: 'list', props: { collection: 'projects', imageAspect: '4:3', linkLabel: 'View project', spacingTop: 'md' }, animation: anim.stagger },
    ctaSection({ heading: 'Let us make something *together*', buttons: [btn('Get in touch', '/contact#enquire')], variant: 'banner', tone: 'surface' }),
  ];

  const about: Section[] = [
    {
      type: 'content-split',
      variant: 'standard',
      props: { eyebrow: 'About', heading: 'Hello, I am *{{business.name}}*', headingLevel: 'h1', body: 'I am an independent designer and art director. I work closely with a small number of clients each year — from first sketch to final detail — and collaborate with a trusted network of photographers, developers and makers when a project needs more hands.\n\nBefore going independent I spent eight years at studios in London and Copenhagen, leading identity and editorial work for cultural and hospitality brands.', buttons: [btn('Get in touch', '/contact#enquire')], image: img('portraitW5'), imageSide: 'right', imageAspect: '4:5', facts: [{ label: 'Based in', value: '{{vars.location}}' }, { label: 'Working', value: 'Worldwide' }], spacingTop: 'xl' },
      animation: anim.mask,
    },
    { type: 'timeline', variant: 'vertical', props: { tone: 'surface', eyebrow: 'Experience', heading: 'Along the *way*', items: [{ date: '2021 – now', title: 'Independent practice', text: 'Identity, editorial, interiors and digital for clients worldwide.' }, { date: '2017 – 2021', title: 'Design Director, Studio North', text: 'Led identity and editorial for cultural and hospitality brands.' }, { date: '2013 – 2017', title: 'Designer, Field & Co.', text: 'Books, exhibitions and wayfinding.' }] } },
    { type: 'logo-cloud', variant: 'grid', props: { eyebrow: 'Selected clients', align: 'center', logos: [{ name: 'Atlas Journal' }, { name: 'Lumen Health' }, { name: 'Field Studio' }, { name: 'Halcyon' }, { name: 'Northfield' }, { name: 'Maison Verde' }], columns: 6, grayscale: true } },
    { type: 'benefits', variant: 'list', props: { tone: 'surface', eyebrow: 'Recognition', heading: 'Awards & *press*', items: [{ title: 'Editorial Design Award, 2025', icon: 'award' }, { title: 'Featured in Atlas Journal, 2024', icon: 'newspaper' }, { title: 'Type Directors Club, 2023', icon: 'trophy' }], columns: 1 } },
    ctaSection({ heading: 'Say *hello*', buttons: [btn('Get in touch', '/contact#enquire')], variant: 'banner', tone: 'inverse' }),
  ];

  const pages = [
    page({ title: 'Home', slug: '', home: true, seoTitle: homeTitle(name, 'Design & art direction'), seoDescription: metaDescription(`${name} is an independent designer and art director working across identity, editorial, interiors and digital products.`), sections: home }),
    page({ title: 'Projects', slug: 'projects', seoTitle: metaTitle('Projects', name), seoDescription: metaDescription(`Selected identity, editorial, interiors and digital design projects by ${name}.`), sections: projects }),
    projectDetailPage({ listPath: '/projects', contactLink: '/contact#enquire', ctaHeading: 'Like what you *see*?' }),
    page({ title: 'About', slug: 'about', seoTitle: metaTitle('About', name), seoDescription: metaDescription(`About ${name}: background, experience, selected clients and recognition from an independent design practice.`), sections: about }),
    contactPage({
      name, formId: 'form-enquiry', heroImage: 'workspace', heroVariant: 'minimal', heading: 'Let us *talk*', intro: 'Tell me a little about your project and timing. I reply to every message within two working days.',
      formHeading: 'Project *enquiry*', formSubheading: 'Share as much or as little as you like — we can fill in the details together.',
      seoDescription: metaDescription(`Get in touch with ${name} about identity, editorial, interiors or digital design projects.`),
    }),
    privacyPage(name),
  ];

  const enquiry = buildForm({
    id: 'form-enquiry', name: 'Project enquiry', slug: 'project-enquiry', notify, subject: 'New project enquiry from {{name}}',
    fields: [field.name(), field.email(), field.select('projectType', 'Project type', ['Identity', 'Editorial', 'Interiors', 'Digital', 'Other']), field.select('budget', 'Budget', ['Under $10k', '$10k – $30k', '$30k+', 'Not sure yet']), field.message('About the project'), field.consent()],
    submitLabel: 'Send message',
  });

  return assemble(ctx, {
    type: 'ProfessionalService',
    description: `${name} is an independent designer and art director working across identity, editorial, interiors and digital products.`,
    structuredData: ['Organization', 'WebSite'],
    theme: 'minimal-mono',
    ogImage: 'designSwatches',
    defaultLocation: 'London',
    menus: {
      primary: [navItem('nav-projects', 'Projects', '/projects'), navItem('nav-about', 'About', '/about'), navItem('nav-contact', 'Contact', '/contact')],
      'footer-explore': [navItem('nav-f-projects', 'Projects', '/projects'), navItem('nav-f-about', 'About', '/about'), navItem('nav-f-contact', 'Contact', '/contact')],
    },
    header: header({ variant: 'minimal', cta: btn('Get in touch', '/contact#enquire', 'outline'), transparentOnHero: false }),
    footer: footer({ variant: 'centered', columns: [{ title: 'Navigate', menu: 'footer-explore' }], newsletterHeading: 'Occasional notes', tone: 'default' }),
    pages,
    forms: [enquiry],
    collections: [projectsCollection(PROJECTS, 'projects')],
  });
}

export const portfolio: Blueprint = {
  key: 'portfolio',
  name: 'Portfolio',
  description: 'Minimal personal portfolio with a projects collection and case-study pages, an about page and a simple enquiry form.',
  category: 'portfolio',
  tags: ['portfolio', 'designer', 'freelance', 'personal', 'projects'],
  thumbnail: photoUrl('designSwatches', 1200),
  build,
};
