import { ADVANCED_CSS, AccordionRenderer, AnimatedTextRenderer, BeforeAfterRenderer, DrawerRenderer, EmbedRenderer, HorizontalScrollRenderer, MarqueeRenderer, ModalRenderer, ParallaxBandRenderer, StickyStoryRenderer, TabsRenderer } from './components/advanced';
import {
  BASICS_CSS, BadgeRenderer, ButtonGroupRenderer, ButtonRenderer, ColumnsRenderer, ContainerRenderer, DividerRenderer, GridRenderer, HeadingRenderer,
  IconRenderer, ListRenderer, QuoteRenderer, RichTextRenderer, SectionRenderer, SpacerRenderer, StackRenderer, TextRenderer,
} from './components/basics';
import { COLLECTION_CSS, CollectionListRenderer } from './components/collection';
import { CONTACT_CSS, ContactInfoRenderer, MapRenderer, SocialLinksRenderer } from './components/contact';
import { FORMS_CSS, FormRenderer, NewsletterRenderer } from './components/forms';
import { HERO_CSS, HeroRenderer } from './components/hero';
import {
  AmenitiesRenderer, AttractionsRenderer, BookingCtaRenderer, DiningRenderer, EventsRenderer, ExperiencesRenderer, HOSPITALITY_CSS, MenuRenderer,
  OffersRenderer, RoomsRenderer, VenuesRenderer,
} from './components/hospitality';
import {
  BenefitsRenderer, ComparisonTableRenderer, ContentSplitRenderer, CtaRenderer, FaqRenderer, FeaturesRenderer, MARKETING_CSS, PricingRenderer,
  StatsRenderer, TeamRenderer, TestimonialsRenderer, TextSectionRenderer, TimelineRenderer,
} from './components/marketing';
import { BackgroundVideoRenderer, CarouselRenderer, GalleryRenderer, ImageRenderer, LogoCloudRenderer, MEDIA_CSS, VideoRenderer } from './components/media';
import { SITE_CSS, SiteFooterRenderer, SiteHeaderRenderer } from './components/site';
import { BASE_CSS } from './css/base';
import { RUNTIME_CSS } from './css/runtime';
import { registerRenderer } from './registry';
import type { Renderer } from './types';

/** CSS chunks keyed by id; components declare which chunks they need (so pages ship only used CSS). */
export const CSS_CHUNKS: Record<string, string> = {
  base: BASE_CSS + RUNTIME_CSS,
  basics: BASICS_CSS,
  hero: HERO_CSS,
  site: SITE_CSS,
  media: MEDIA_CSS,
  marketing: MARKETING_CSS,
  hospitality: HOSPITALITY_CSS,
  contact: CONTACT_CSS,
  forms: FORMS_CSS,
  advanced: ADVANCED_CSS,
  collection: COLLECTION_CSS,
};

type Entry = [Renderer, string[]];

/** Built-in renderer table: component type → [renderer, css chunks]. */
export const BUILTIN_RENDERERS: Record<string, Entry> = {
  'site-header': [SiteHeaderRenderer, ['site']],
  'site-footer': [SiteFooterRenderer, ['site', 'forms', 'contact']],
  section: [SectionRenderer, ['basics']],
  container: [ContainerRenderer, ['basics']],
  grid: [GridRenderer, ['basics']],
  columns: [ColumnsRenderer, ['basics']],
  stack: [StackRenderer, ['basics']],
  spacer: [SpacerRenderer, ['basics']],
  divider: [DividerRenderer, ['basics']],
  heading: [HeadingRenderer, ['basics']],
  text: [TextRenderer, ['basics']],
  'rich-text': [RichTextRenderer, ['basics']],
  button: [ButtonRenderer, ['basics']],
  'button-group': [ButtonGroupRenderer, ['basics']],
  icon: [IconRenderer, ['basics']],
  badge: [BadgeRenderer, ['basics']],
  quote: [QuoteRenderer, ['basics']],
  list: [ListRenderer, ['basics']],
  hero: [HeroRenderer, ['hero']],
  image: [ImageRenderer, ['media']],
  video: [VideoRenderer, ['media']],
  'background-video': [BackgroundVideoRenderer, ['media']],
  gallery: [GalleryRenderer, ['media']],
  carousel: [CarouselRenderer, ['media']],
  'logo-cloud': [LogoCloudRenderer, ['media']],
  cta: [CtaRenderer, ['marketing']],
  features: [FeaturesRenderer, ['marketing']],
  stats: [StatsRenderer, ['marketing']],
  testimonials: [TestimonialsRenderer, ['marketing', 'media']],
  faq: [FaqRenderer, ['marketing']],
  pricing: [PricingRenderer, ['marketing']],
  team: [TeamRenderer, ['marketing']],
  timeline: [TimelineRenderer, ['marketing']],
  'comparison-table': [ComparisonTableRenderer, ['marketing']],
  'content-split': [ContentSplitRenderer, ['marketing']],
  'text-section': [TextSectionRenderer, ['marketing']],
  benefits: [BenefitsRenderer, ['marketing']],
  rooms: [RoomsRenderer, ['hospitality', 'media']],
  amenities: [AmenitiesRenderer, ['hospitality']],
  offers: [OffersRenderer, ['hospitality']],
  dining: [DiningRenderer, ['hospitality']],
  menu: [MenuRenderer, ['hospitality', 'advanced']],
  experiences: [ExperiencesRenderer, ['hospitality']],
  venues: [VenuesRenderer, ['hospitality', 'marketing']],
  events: [EventsRenderer, ['hospitality']],
  attractions: [AttractionsRenderer, ['hospitality']],
  'booking-cta': [BookingCtaRenderer, ['hospitality']],
  'contact-info': [ContactInfoRenderer, ['contact', 'site']],
  map: [MapRenderer, ['contact']],
  form: [FormRenderer, ['forms', 'site']],
  newsletter: [NewsletterRenderer, ['forms']],
  'social-links': [SocialLinksRenderer, ['contact', 'site']],
  tabs: [TabsRenderer, ['advanced']],
  accordion: [AccordionRenderer, ['advanced', 'marketing']],
  modal: [ModalRenderer, ['advanced']],
  drawer: [DrawerRenderer, ['advanced']],
  marquee: [MarqueeRenderer, ['advanced', 'media']],
  'before-after': [BeforeAfterRenderer, ['advanced']],
  'horizontal-scroll': [HorizontalScrollRenderer, ['advanced', 'hospitality']],
  'sticky-story': [StickyStoryRenderer, ['advanced']],
  'parallax-band': [ParallaxBandRenderer, ['advanced']],
  'animated-text': [AnimatedTextRenderer, ['advanced']],
  embed: [EmbedRenderer, ['advanced']],
  'global-section': [() => null, ['advanced']],
  'collection-list': [CollectionListRenderer, ['collection']],
};

/** CSS chunk ids per type; plugin components can add theirs via `registerComponentCss`. */
export const TYPE_CSS = new Map<string, string[]>(Object.entries(BUILTIN_RENDERERS).map(([t, [, css]]) => [t, css]));

let registered = false;
export function registerBuiltinRenderers(): void {
  if (registered) return;
  registered = true;
  for (const [type, [renderer]] of Object.entries(BUILTIN_RENDERERS)) registerRenderer(type, renderer);
}

/** Plugins: ship CSS for a custom component (scoped under `.atrium-site`). */
export function registerComponentCss(type: string, css: string): void {
  const id = `plugin:${type}`;
  CSS_CHUNKS[id] = css;
  TYPE_CSS.set(type, [...(TYPE_CSS.get(type) ?? []), id]);
}
