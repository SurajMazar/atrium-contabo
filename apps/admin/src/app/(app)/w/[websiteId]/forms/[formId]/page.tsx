import type { Metadata } from 'next';
import { FormBuilderScreen } from '@/components/forms/form-builder';

export const metadata: Metadata = { title: 'Form builder' };

export default async function Page({ params }: { params: Promise<{ websiteId: string; formId: string }> }) {
  const { websiteId, formId } = await params;
  return <FormBuilderScreen websiteId={websiteId} formId={formId} />;
}
