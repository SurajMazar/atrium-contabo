import type { Metadata } from 'next';
import { AdminJobs } from '@/components/admin/jobs';

export const metadata: Metadata = { title: 'Jobs · Admin' };

export default function Page() {
  return <AdminJobs />;
}
