import type { Metadata } from 'next';
import { PlatformProvidersScreen } from '@/components/integrations/platform-providers-screen';

export const metadata: Metadata = { title: 'Platform providers · Admin' };

export default function Page() {
  return <PlatformProvidersScreen />;
}
