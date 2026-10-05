import type { ReactNode } from 'react';
import { PlatformLayout } from '@/lib/platform';

type Params = Promise<{ slug: string; path?: string[] }>;

export default async function DevLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { slug, path } = await params;
  return <PlatformLayout target={{ kind: 'dev', slug }} segments={path}>{children}</PlatformLayout>;
}
