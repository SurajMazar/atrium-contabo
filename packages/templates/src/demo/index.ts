import type { DemoSite } from '../types';
import { aranyaLakeRetreat } from './aranya';
import { northwindPartners } from './northwind';
import { rosewoodCourtyard } from './rosewood';

/** Complete, original demo websites (fictional businesses) used for showcases, seeds and QA. */
export const DEMO_SITES: DemoSite[] = [aranyaLakeRetreat, northwindPartners, rosewoodCourtyard];

export function getDemoSite(key: string): DemoSite | undefined {
  return DEMO_SITES.find((d) => d.key === key);
}

export { aranyaLakeRetreat, northwindPartners, rosewoodCourtyard };
