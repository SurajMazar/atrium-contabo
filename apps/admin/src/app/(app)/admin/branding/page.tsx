import type { Metadata } from 'next';
import { PlatformBrandingScreen } from '@/components/branding/org-branding-screen';

export const metadata: Metadata = { title: 'Branding · Admin' };

export default function Page() {
  return <PlatformBrandingScreen />;
}
