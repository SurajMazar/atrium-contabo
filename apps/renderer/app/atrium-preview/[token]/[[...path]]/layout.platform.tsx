import type { ReactNode } from 'react';
import { PlatformLayout } from '@/lib/platform';

type Params = Promise<{ token: string; path?: string[] }>;

export default async function PreviewLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { token, path } = await params;
  return <PlatformLayout target={{ kind: 'preview', token }} segments={path}>{children}</PlatformLayout>;
}
