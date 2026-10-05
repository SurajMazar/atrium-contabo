import type { Metadata } from 'next';
import { SettingsScreen } from '@/components/settings/settings-screen';

export const metadata: Metadata = { title: 'Settings' };

export default async function Page({ params, searchParams }: { params: Promise<{ websiteId: string }>; searchParams: Promise<{ section?: string }> }) {
  const { websiteId } = await params;
  const { section } = await searchParams;
  return <SettingsScreen websiteId={websiteId} initialSection={section} />;
}
