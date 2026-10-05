import type { NodeInput, PageInput, WebsiteInput } from '@atrium/schema';

/** Business details collected by onboarding / the AI wizard. */
export interface BlueprintInput {
  businessName: string;
  tagline?: string;
  description?: string;
  location?: string;
  phone?: string;
  email?: string;
  address?: string;
  social?: Record<string, string>;
  /** Key of a design-tokens THEME_PRESETS entry. */
  themePreset?: string;
}

export type TemplateCategory = 'hospitality' | 'events' | 'food' | 'business' | 'creative' | 'technology' | 'real-estate' | 'portfolio';

export interface Blueprint {
  key: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  /** Representative image URL for the template picker. */
  thumbnail: string;
  build(input: BlueprintInput): WebsiteInput;
}

export interface DemoSite {
  key: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  thumbnail: string;
  /** Suggested slug for the demo website. */
  slug: string;
  website: WebsiteInput;
}

export type SectionTemplateCategory =
  | 'hero' | 'intro' | 'features' | 'rooms' | 'dining' | 'gallery' | 'testimonials' | 'cta' | 'faq' | 'contact'
  | 'pricing' | 'team' | 'stats' | 'events' | 'collection' | 'media' | 'story';

export interface SectionTemplate {
  key: string;
  name: string;
  description: string;
  category: SectionTemplateCategory;
  tags: string[];
  node: NodeInput;
}

export interface PageTemplate {
  key: string;
  name: string;
  description: string;
  tags: string[];
  page: PageInput;
}
