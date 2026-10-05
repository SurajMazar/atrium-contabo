import { EditorApp } from '@/builder/editor-app';

export default async function EditorPageWithPage({ params }: { params: Promise<{ websiteId: string; pageId: string }> }) {
  const { websiteId, pageId } = await params;
  return <EditorApp websiteId={websiteId} initialPageId={pageId} />;
}
