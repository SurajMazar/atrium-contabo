import type { Metadata } from 'next';
import { PlatformPage, platformMetadata } from '@/lib/platform';

type Params = Promise<{ token: string; path?: string[] }>;

/** Previews always render fresh and are never indexed. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token, path } = await params;
  const meta = await platformMetadata({ kind: 'preview', token }, path);
  return { ...meta, robots: { index: false, follow: false } };
}

export default async function PreviewPage({ params }: { params: Params }) {
  const { token, path } = await params;
  return <PlatformPage target={{ kind: 'preview', token }} segments={path} />;
}
