import type { Metadata } from 'next';
import { AdminOverview } from '@/components/admin/overview';

export const metadata: Metadata = { title: 'Platform admin' };

export default function Page() {
  return <AdminOverview />;
}
