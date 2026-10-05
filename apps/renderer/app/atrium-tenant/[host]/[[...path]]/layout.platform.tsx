import type { ReactNode } from 'react';
import { PlatformLayout } from '@/lib/platform';

type Params = Promise<{ host: string; path?: string[] }>;

export default async function TenantLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { host, path } = await params;
  return <PlatformLayout target={{ kind: 'host', host: decodeURIComponent(host) }} segments={path}>{children}</PlatformLayout>;
}
