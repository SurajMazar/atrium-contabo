import type { Metadata } from 'next';
import { AdminOrganizations } from '@/components/admin/organizations';

export const metadata: Metadata = { title: 'Organizations · Admin' };

export default function Page() {
  return <AdminOrganizations />;
}
