'use client';

import type { Website } from '@atrium/sdk';
import { createContext, useContext, type ReactNode } from 'react';

export interface WebsiteContextValue {
  websiteId: string;
  website: Website | undefined;
  organizationId: string | undefined;
  isLoading: boolean;
}

const Ctx = createContext<WebsiteContextValue | null>(null);

export function WebsiteContextProvider({ value, children }: { value: WebsiteContextValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Current website inside `/w/[websiteId]/*` admin routes. */
export function useWebsite(): WebsiteContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWebsite must be used within a website route');
  return v;
}

export function useOptionalWebsite(): WebsiteContextValue | null {
  return useContext(Ctx);
}
