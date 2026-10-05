import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IS_EXPORT } from '@/lib/env';
import { enforce, fileRequest, fileStaticParams } from '@/lib/file-site';
import { resolveRequest, SiteBody, toNextMetadata } from '@/lib/site';

type Params = Promise<{ path?: string[] }>;

export const dynamicParams = false;

export function generateStaticParams() {
  const params = fileStaticParams();
  // Next requires at least one entry for an export; platform builds render nothing here.
  return params.length ? params : [{ path: ['__atrium'] }];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const req = fileRequest((await params).path);
  if (!req) return {};
  const r = resolveRequest(req);
  if (r.kind === 'redirect') return { title: 'Redirecting…', robots: { index: false, follow: true }, alternates: { canonical: r.destination } };
  return toNextMetadata(r);
}

export default async function FilePage({ params }: { params: Params }) {
  const req = fileRequest((await params).path);
  if (!req) notFound();
  if (IS_EXPORT) {
    // Static hosting cannot send 3xx: the layout emits <meta http-equiv="refresh">; this is the no-JS fallback.
    const r = resolveRequest(req);
    if (r.kind === 'redirect') return <p style={{ padding: '2rem', fontFamily: 'system-ui' }}>This page has moved to <a href={r.destination}>{r.destination}</a>.</p>;
  }
  return <SiteBody r={enforce(req)} />;
}
