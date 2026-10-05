import type { Metadata } from 'next';
import { WebsitesHome } from '@/components/websites/websites-home';

export const metadata: Metadata = { title: 'Websites' };

export default function HomePage() {
  return <WebsitesHome />;
}
