/**
 * Next.js calls register() once when a server instance starts (never during `next build`).
 * In production the renderer refuses to start with a missing/placeholder RENDERER_SECRET or
 * localhost/non-https public URLs (see lib/env.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertRendererProductionEnv } = await import('./lib/env');
  assertRendererProductionEnv();
}
