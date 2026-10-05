import { RENDERER_CSS } from '@atrium/renderer-core';

export const dynamic = 'force-static';

/** Component CSS shared by every page and site; URL is content-hashed (?v=) so it can be cached forever. */
export function GET() {
  return new Response(RENDERER_CSS, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
