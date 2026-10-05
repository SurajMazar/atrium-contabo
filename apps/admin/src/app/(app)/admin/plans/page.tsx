import type { Metadata } from 'next';
import { AdminPlans } from '@/components/admin/plans';

export const metadata: Metadata = { title: 'Plans · Admin' };

export default function Page() {
  return <AdminPlans />;
}
