import type { Metadata } from 'next';
import { AdminAbuse } from '@/components/admin/abuse';

export const metadata: Metadata = { title: 'Abuse reports · Admin' };

export default function Page() {
  return <AdminAbuse />;
}
