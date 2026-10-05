import type { Metadata } from 'next';
import { SeoScreen } from '@/components/seo/seo-screen';

export const metadata: Metadata = { title: 'SEO' };

export default async function Page({ params, searchParams }: { params: Promise<{ websiteId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { websiteId } = await params;
  const { tab } = await searchParams;
  return <SeoScreen websiteId={websiteId} initialTab={tab} />;
}
