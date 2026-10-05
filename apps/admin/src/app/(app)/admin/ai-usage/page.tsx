import type { Metadata } from 'next';
import { AdminAiUsage } from '@/components/admin/ai-usage';

export const metadata: Metadata = { title: 'AI usage · Admin' };

export default function Page() {
  return <AdminAiUsage />;
}
