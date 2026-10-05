import { EditorApp } from '@/builder/editor-app';

export default async function EditorPage({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <EditorApp websiteId={websiteId} />;
}
