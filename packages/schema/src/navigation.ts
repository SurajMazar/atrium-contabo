import { z } from 'zod';
import { OptionalSafeMediaUrlSchema } from './safe-url';
import { LinkSchema, type LinkValue } from './link';

export interface NavItem {
  id: string;
  label: string;
  link?: LinkValue;
  description?: string;
  icon?: string;
  image?: string;
  /** Renders children as a mega menu with columns when set. */
  mega?: boolean;
  highlight?: boolean;
  children?: NavItem[];
}

export const NavItemSchema: z.ZodType<NavItem> = z.object({
  id: z.string(),
  label: z.string().min(1).max(80),
  link: LinkSchema.optional(),
  description: z.string().max(200).optional(),
  icon: z.string().optional(),
  image: OptionalSafeMediaUrlSchema,
  mega: z.boolean().optional(),
  highlight: z.boolean().optional(),
  get children() {
    return z.array(NavItemSchema).optional();
  },
});

export const NavigationSchema = z.object({
  /** Named menus: `primary`, `footer`, `legal`, `mobile`… */
  menus: z.record(z.string(), z.array(NavItemSchema)),
});
export type Navigation = z.infer<typeof NavigationSchema>;
