import type { Metadata } from 'next';
import { SubmissionsScreen } from '@/components/submissions/submissions-screen';

export const metadata: Metadata = { title: 'Submissions' };

export default async function Page({ params, searchParams }: { params: Promise<{ websiteId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { websiteId } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <SubmissionsScreen websiteId={websiteId} initialFormId={one(sp.formId)} initialSubmissionId={one(sp.id)} />;
}
