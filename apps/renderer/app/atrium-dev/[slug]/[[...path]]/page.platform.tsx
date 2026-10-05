import type { Metadata } from 'next';
import { PlatformPage, platformMetadata } from '@/lib/platform';

type Params = Promise<{ slug: string; path?: string[] }>;

/** Dev convenience: /_site/<slug>/… (cached like tenant pages). */
export const revalidate = 300;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, path } = await params;
  return platformMetadata({ kind: 'dev', slug }, path);
}

export default async function DevPage({ params }: { params: Params }) {
  const { slug, path } = await params;
  return <PlatformPage target={{ kind: 'dev', slug }} segments={path} />;
}
