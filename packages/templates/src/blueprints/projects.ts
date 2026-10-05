/** Shared "projects" collection + detail template used by the creative-agency and portfolio blueprints. */
import type { ImageKey } from '../images';
import { anim, btn, ctaSection, img, item, page, type Collection, type Section } from './shared';

export interface ProjectSeed {
  slug: string;
  name: string;
  client: string;
  category: string;
  year: string;
  summary: string;
  description: string;
  image: ImageKey;
  gallery: ImageKey[];
}

export function projectsCollection(seeds: ProjectSeed[], routePrefix = 'work'): Collection {
  return {
    slug: 'projects',
    name: 'Projects',
    singularName: 'Project',
    description: 'Case studies shown on the work listing and the homepage.',
    fields: [
      { key: 'name', label: 'Project name', type: 'text', required: true },
      { key: 'client', label: 'Client', type: 'text' },
      { key: 'category', label: 'Discipline', type: 'text' },
      { key: 'year', label: 'Year', type: 'text' },
      { key: 'summary', label: 'Summary', type: 'textarea' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'image', label: 'Cover image', type: 'image' },
      { key: 'gallery', label: 'Gallery', type: 'gallery' },
    ],
    titleField: 'name',
    routePrefix,
    items: seeds.map((s, i) =>
      item('projects', s.slug, i, {
        name: s.name, client: s.client, category: s.category, year: s.year, summary: s.summary, description: s.description,
        image: img(s.image, { width: 1800 }), gallery: s.gallery.map((g) => img(g, { width: 1800 })),
      }),
    ),
  };
}

/** Collection-template page rendered at /work/{slug}. */
export function projectDetailPage(o: { listPath: string; contactLink: string; ctaHeading: string }) {
  const sections: Section[] = [
    {
      type: 'hero',
      variant: 'editorial',
      props: { eyebrow: '{{item.category}}', heading: '{{item.name}}', subheading: '{{item.summary}}', buttons: [btn('All work', o.listPath, 'link')], image: { src: '{{item.image}}', alt: '{{item.name}}' }, imageSide: 'right', height: 'tall', spacingTop: 'xl', spacingBottom: 'lg' },
      animation: anim.hero,
    },
    { type: 'stats', variant: 'inline', props: { items: [{ value: '{{item.client}}', label: 'Client' }, { value: '{{item.year}}', label: 'Year' }, { value: '{{item.category}}', label: 'Discipline' }], columns: 3, dividers: true, spacingTop: 'md', spacingBottom: 'md' } },
    { type: 'text-section', variant: 'two-column', props: { eyebrow: 'The project', heading: 'Brief, idea and *outcome*', body: '{{item.description}}', align: 'left' }, animation: anim.fadeUp },
    { type: 'gallery', variant: 'stacked', props: { images: [], fromItemField: 'gallery', lightbox: true, showCaptions: false, spacingTop: 'md' }, animation: anim.clip },
    { type: 'collection-list', variant: 'grid', props: { tone: 'surface', eyebrow: 'More work', heading: 'Next *projects*', collection: 'projects', limit: 2, columns: 2, imageAspect: '4:3', linkLabel: 'View project', excludeCurrent: true } },
    ctaSection({ heading: o.ctaHeading, buttons: [btn('Start a project', o.contactLink)], variant: 'banner', tone: 'inverse' }),
  ];
  return page({ title: 'Project', slug: 'project-detail', kind: 'collection-template', collection: 'projects', seoTitle: '{{item.name}}', seoDescription: '{{item.summary}}', sections });
}
