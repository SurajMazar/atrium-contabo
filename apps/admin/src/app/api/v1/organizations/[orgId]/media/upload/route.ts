import type { NextRequest } from 'next/server';
import { streamToApi } from '@/lib/stream-proxy';

/** Media upload (up to UPLOAD_MAX_MB): streamed to the API, never buffered here. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  return streamToApi(req, `/organizations/${encodeURIComponent(orgId)}/media/upload`);
}

export const dynamic = 'force-dynamic';
