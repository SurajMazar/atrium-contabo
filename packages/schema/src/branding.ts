import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour');
const url = z.string().max(2000).refine((v) => /^(https?:\/\/|\/|data:image\/)/.test(v), 'Use an http(s) URL or a /path');

/**
 * White-label branding for the admin and builder. Platform defaults are set by
 * super admins; organizations may override any field (agencies, resellers).
 */
export const AdminBrandingSchema = z
  .object({
    productName: z.string().trim().min(1).max(40),
    logoUrl: url,
    logoDarkUrl: url,
    iconUrl: url,
    accent: hex,
    accentDark: hex,
    radius: z.enum(['sharp', 'default', 'round']),
    density: z.enum(['compact', 'comfortable']),
    defaultTheme: z.enum(['system', 'light', 'dark']),
    loginHeadline: z.string().max(120),
    loginSubheadline: z.string().max(240),
    loginImageUrl: url,
    supportUrl: url,
    hidePoweredBy: z.boolean(),
  })
  .partial();
export type AdminBranding = z.infer<typeof AdminBrandingSchema>;

export const DEFAULT_ADMIN_BRANDING: Required<Pick<AdminBranding, 'productName' | 'accent' | 'accentDark' | 'radius' | 'density' | 'defaultTheme'>> = {
  productName: 'Atrium',
  accent: '#2b4fd8',
  accentDark: '#6f8cff',
  radius: 'default',
  density: 'compact',
  defaultTheme: 'system',
};

/** Platform defaults ← organization overrides (undefined/empty values don't override). */
export function mergeBranding(...layers: Array<AdminBranding | null | undefined>): AdminBranding {
  const out: AdminBranding = { ...DEFAULT_ADMIN_BRANDING };
  for (const l of layers) for (const [k, v] of Object.entries(l ?? {})) if (v !== undefined && v !== null && v !== '') (out as Record<string, unknown>)[k] = v;
  return out;
}
