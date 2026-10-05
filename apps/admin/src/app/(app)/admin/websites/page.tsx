import type { Metadata } from 'next';
import { AdminWebsites } from '@/components/admin/websites';

export const metadata: Metadata = { title: 'Websites · Admin' };

export default function Page() {
  return <AdminWebsites />;
}
