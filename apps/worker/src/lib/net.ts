import { guardedFetch, readTextLimited } from '@atrium/providers';
import type { WorkerContext } from '../context';

/** Max bytes read from a webhook / form HTTP action response (the rest is aborted). */
export const RESPONSE_READ_LIMIT = 64 * 1024;
/** Max characters of a response body stored on delivery rows / timelines. */
export const RESPONSE_STORE_LIMIT = 4096;

/**
 * Tenant-supplied URL fetch (webhooks, form HTTP actions) through the shared outbound guard:
 * http(s) only, no credentials, every connection pinned to a validated public address (unless
 * `settings.allowPrivateNetwork`), redirects NOT followed (a 3xx is returned as the result).
 */
export function fetchTenantUrl(ctx: WorkerContext, url: string, init: RequestInit): Promise<Response> {
  return guardedFetch(url, init, { network: 'public-only', allowPrivate: ctx.settings.allowPrivateNetwork, maxRedirects: 0, fetch: ctx.fetch });
}

/** Read at most RESPONSE_READ_LIMIT bytes of a response and keep RESPONSE_STORE_LIMIT chars. */
export async function readResponseExcerpt(res: Response, storeLimit = RESPONSE_STORE_LIMIT): Promise<string> {
  try {
    const { text, truncated } = await readTextLimited(res, RESPONSE_READ_LIMIT);
    return truncate(text, storeLimit) + (truncated && text.length <= storeLimit ? '…[truncated]' : '');
  } catch {
    return '';
  }
}

export function truncate(text: string, max = 4096): string {
  return text.length > max ? `${text.slice(0, max)}…[truncated ${text.length - max} chars]` : text;
}
