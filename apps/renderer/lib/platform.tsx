import { cookies } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getPreviewSnapshot, getSnapshotForHost, hostForSlug, normalizeHost, type SnapshotResult } from './snapshot';
import { enforceRequest } from './enforce';
import { resolveRequest, SiteBody, SiteDocument, StatusDocument, toNextMetadata, type SiteRequest } from './site';
import type { Metadata } from 'next';

export type Target = { kind: 'host'; host: string } | { kind: 'dev'; slug: string } | { kind: 'preview'; token: string };

export const previewCookie = (token: string) => `atrium_preview_${token.replace(/[^\w-]/g, '').slice(0, 24)}`;

async function load(target: Target): Promise<SnapshotResult> {
  if (target.kind === 'host') return getSnapshotForHost(target.host);
  if (target.kind === 'dev') return getSnapshotForHost(hostForSlug(target.slug));
  const pw = (await cookies()).get(previewCookie(target.token))?.value;
  return getPreviewSnapshot(target.token, pw);
}

function basePathFor(target: Target): string {
  if (target.kind === 'dev') return `/_site/${target.slug}`;
  if (target.kind === 'preview') return `/_preview/${target.token}`;
  return '';
}

export async function platformRequest(target: Target, segments: string[] | undefined): Promise<{ result: SnapshotResult; req?: SiteRequest }> {
  const result = await load(target);
  if (result.status !== 'ok') return { result };
  const host = target.kind === 'host' ? normalizeHost(target.host) : undefined;
  return { result, req: { snapshot: result.snapshot, segments: segments ?? [], basePath: basePathFor(target), mode: target.kind === 'preview' ? 'preview' : 'live', host } };
}

/** Optional: snapshots may list domains with `redirectToPrimary` (forward compatible with the API). */
function primaryRedirect(req: SiteRequest): string | null {
  const snap = req.snapshot as SiteRequest['snapshot'] & { domains?: Array<{ hostname: string; redirectToPrimary?: boolean }> };
  if (!req.host || !snap.primaryDomain || req.host === snap.primaryDomain) return null;
  const d = snap.domains?.find((x) => normalizeHost(x.hostname) === req.host);
  if (!d?.redirectToPrimary) return null;
  return `https://${snap.primaryDomain}/${req.segments.join('/')}`;
}

export async function PlatformLayout({ target, segments, children }: { target: Target; segments?: string[]; children: ReactNode }) {
  const { result, req } = await platformRequest(target, segments);
  if (!req) return <PlatformStatus target={target} result={result} segments={segments}>{children}</PlatformStatus>;
  return <SiteDocument r={resolveRequest(req)} req={req}>{children}</SiteDocument>;
}

export async function PlatformPage({ target, segments }: { target: Target; segments?: string[] }) {
  const { req, result } = await platformRequest(target, segments);
  // API outage: throw so the response is a 500 and never cached by ISR.
  if (result.status === 'error') throw new Error(`Site snapshot unavailable: ${result.message}`);
  if (!req) notFound();
  const to = primaryRedirect(req);
  if (to) permanentRedirect(to);
  return <SiteBody r={enforceRequest(req)} />;
}

export async function platformMetadata(target: Target, segments?: string[]): Promise<Metadata> {
  const { req } = await platformRequest(target, segments);
  if (!req) return { title: 'Site not found', robots: { index: false, follow: false } };
  return toNextMetadata(resolveRequest(req));
}

/** not-found.js receives no params; the layout renders the 404 body, so this stays empty (keeps ISR static). */
export function PlatformNotFound(_: { kind: Target['kind'] }) {
  return null;
}

function PlatformStatus({ target, result, segments, children }: { target: Target; result: SnapshotResult; segments?: string[]; children?: ReactNode }) {
  if (result.status === 'password-required' && target.kind === 'preview') {
    return (
      <StatusDocument slot={children} title="Protected preview" message={result.invalid ? 'That password was not correct. Please try again.' : 'Enter the password you were given to view this preview.'} status="Preview">
        <form method="post" action="/api/preview-auth">
          <input type="hidden" name="token" value={target.token} />
          <input type="hidden" name="path" value={(segments ?? []).join('/')} />
          <label htmlFor="pw" style={{ position: 'absolute', left: '-9999px' }}>Password</label>
          <input id="pw" type="password" name="password" required autoFocus autoComplete="current-password" />
          <button type="submit">View preview</button>
        </form>
      </StatusDocument>
    );
  }
  if (result.status === 'error') return <StatusDocument slot={children} title="Temporarily unavailable" message="This site could not be loaded right now. Please try again in a moment." status="Error" />;
  return <StatusDocument slot={children} title="Site not found" message={target.kind === 'preview' ? 'This preview link has expired or was revoked.' : 'There is no published website at this address yet.'} status="404" />;
}
