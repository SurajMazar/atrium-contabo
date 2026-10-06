import type { NextRequest } from 'next/server';
import { streamToApi } from '@/lib/stream-proxy';

/** Site bundle import (up to 300 MB): streamed to the API, never buffered here. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  return streamToApi(req, `/organizations/${encodeURIComponent(orgId)}/websites/import`);
}

export const dynamic = 'force-dynamic';
