import type { Metadata } from 'next';
import { AdminFlags } from '@/components/admin/flags';

export const metadata: Metadata = { title: 'Feature flags · Admin' };

export default function Page() {
  return <AdminFlags />;
}
