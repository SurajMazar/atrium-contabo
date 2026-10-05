import type { Metadata } from 'next';
import { WebsiteMedia } from '@/components/media/website-media';

export const metadata: Metadata = { title: 'Media' };

export default function WebsiteMediaPage() {
  return <WebsiteMedia />;
}
