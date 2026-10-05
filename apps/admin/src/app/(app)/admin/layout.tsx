import type { ReactNode } from 'react';
import { SuperAdminGuard } from '@/components/admin/admin-guard';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <SuperAdminGuard>{children}</SuperAdminGuard>;
}
