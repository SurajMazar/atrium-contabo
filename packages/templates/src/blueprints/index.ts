import type { Blueprint } from '../types';
import { corporate } from './corporate';
import { creativeAgency } from './creative-agency';
import { hospitalityResort } from './hospitality-resort';
import { minimalHotel } from './minimal-hotel';
import { portfolio } from './portfolio';
import { realEstate } from './real-estate';
import { restaurant } from './restaurant';
import { saas } from './saas';
import { weddingVenue } from './wedding-venue';

export const BLUEPRINTS: Blueprint[] = [hospitalityResort, weddingVenue, restaurant, corporate, creativeAgency, saas, portfolio, realEstate, minimalHotel];

export function getBlueprint(key: string): Blueprint | undefined {
  return BLUEPRINTS.find((b) => b.key === key);
}
