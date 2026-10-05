import type { Metadata } from 'next';
import { CollectionsScreen } from '@/components/cms/collections-screen';

export const metadata: Metadata = { title: 'CMS' };

export default function Page() {
  return <CollectionsScreen />;
}
