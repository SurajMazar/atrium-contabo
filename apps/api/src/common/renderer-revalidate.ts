import { Logger } from '@nestjs/common';
import { env } from '../config/env';

const logger = new Logger('RendererRevalidate');

/**
 * Ask the renderer to drop cached pages and snapshots for these websites (`site:<id>` tags; the
 * renderer maps them to every host it has served for the site). Best effort, never throws.
 */
export async function revalidateWebsites(websiteIds: string[]): Promise<void> {
  if (!websiteIds.length) return;
  try {
    const res = await fetch(`${env().RENDERER_URL.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Renderer-Secret': env().RENDERER_SECRET },
      body: JSON.stringify({ tags: websiteIds.map((id) => `site:${id}`) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) logger.warn(`renderer revalidate returned ${res.status}`);
  } catch (err) {
    logger.warn(`renderer revalidate failed: ${(err as Error).message}`);
  }
}
