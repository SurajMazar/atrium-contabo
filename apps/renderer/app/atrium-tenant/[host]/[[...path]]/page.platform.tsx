import type { Metadata } from 'next';
import { PlatformPage, platformMetadata } from '@/lib/platform';

type Params = Promise<{ host: string; path?: string[] }>;

/** ISR: rendered on first request per host+path, cached, revalidated by tag or after 5 minutes. */
export const revalidate = 300;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { host, path } = await params;
  return platformMetadata({ kind: 'host', host: decodeURIComponent(host) }, path);
}

export default async function TenantPage({ params }: { params: Params }) {
  const { host, path } = await params;
  return <PlatformPage target={{ kind: 'host', host: decodeURIComponent(host) }} segments={path} />;
}
