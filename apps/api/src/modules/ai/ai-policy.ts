import { HttpStatus } from '@nestjs/common';
import { AiLimitError, type AiEditMode, type TouchedUnits } from '@atrium/agent';
import type { ChangeSummary } from '@atrium/builder-core';
import { ApiError, badRequest, conflict, limitExceeded, type ErrorCode } from '../../common/errors';

/** 409 with code CONFIRMATION_REQUIRED and the reasons (client must resend with `{ confirm: true }`). */
export function confirmationRequired(reasons: string[]): ApiError {
  // TODO(common/errors.ts owner): add 'CONFIRMATION_REQUIRED' to ErrorCode; the cast keeps the wire format today.
  return new ApiError(HttpStatus.CONFLICT, 'CONFIRMATION_REQUIRED' as ErrorCode, 'This AI change needs explicit confirmation before it is applied', { reasons });
}

/** 409 when a revert would discard edits made after the AI change. */
export function revertStale(): ApiError {
  return conflict('The website was edited after this AI change was applied. Reverting now would discard those edits — send { "force": true } to revert anyway.', { code: 'AI_REVERT_STALE' });
}

/** Map agent limit/abort errors to API errors; rethrow anything else. */
export function mapAiError(err: unknown): never {
  if (err instanceof AiLimitError) {
    if (err.kind === 'model') throw badRequest(err.message);
    if (err.kind === 'deadline') throw new ApiError(HttpStatus.GATEWAY_TIMEOUT, 'INTERNAL', err.message);
    throw limitExceeded(err.message, { kind: err.kind });
  }
  if ((err as { name?: string })?.name === 'AbortError' || (err as { name?: string })?.name === 'TimeoutError') throw new ApiError(HttpStatus.GATEWAY_TIMEOUT, 'INTERNAL', 'The AI request took too long and was stopped');
  throw err;
}

export const modeOfKind = (kind: string): AiEditMode => (kind === 'PAGE' ? 'page' : kind === 'SECTION' ? 'section' : 'edit');

/** Why a proposal needs explicit confirmation before apply (empty = none). */
export function confirmationReasons(p: { changes: ChangeSummary[]; rejected?: Array<{ op: string; reason: string }> }, mode: AiEditMode): string[] {
  const reasons: string[] = [];
  const removes = p.changes.filter((c) => c.kind === 'removed').length;
  if (removes) reasons.push(`Removes ${removes} item${removes === 1 ? '' : 's'}`);
  if (p.changes.length > 3) reasons.push(`Makes ${p.changes.length} changes`);
  if (mode === 'page') reasons.push('Creates a new page');
  if (mode === 'section') reasons.push('Adds a new section');
  if (p.changes.some((c) => c.scope === 'theme')) reasons.push('Changes the site theme');
  if (p.changes.some((c) => c.scope === 'page' && c.kind !== 'added')) reasons.push('Changes page settings');
  if (p.changes.some((c) => c.scope === 'navigation' || c.scope === 'header' || c.scope === 'footer')) reasons.push('Changes navigation, header or footer');
  if (p.changes.some((c) => c.scope === 'form')) reasons.push('Changes a form');
  for (const c of p.changes.filter((x) => x.sensitive).slice(0, 20)) reasons.push(`Sensitive: ${c.label}${c.detail ? ` (${c.detail})` : ''}`);
  if (p.rejected?.length) reasons.push(`${p.rejected.length} requested change${p.rejected.length === 1 ? ' was' : 's were'} blocked by the AI safety policy`);
  return [...new Set(reasons)];
}

/** Units an applied edit touched (for the revert staleness fingerprint). */
export function touchedUnits(changed: { site: boolean; theme: boolean; pages: string[]; forms: string[]; redirects: boolean; globalSections?: string[] }, createdPages: string[] = [], deletedPages: string[] = []): TouchedUnits {
  return {
    site: changed.site,
    theme: changed.theme,
    redirects: changed.redirects,
    globalSections: !!changed.globalSections?.length,
    pages: [...changed.pages, ...createdPages, ...deletedPages],
    forms: changed.forms,
  };
}
