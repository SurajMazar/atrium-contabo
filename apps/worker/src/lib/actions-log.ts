import type { PrismaClient } from '@atrium/db';

/** One entry in FormSubmission.actionsLog (shown on the submission timeline in the admin). */
export interface ActionLogEntry {
  at: string;
  type: string;
  status: 'queued' | 'sent' | 'done' | 'failed' | 'skipped';
  ruleId?: string;
  branch?: 'then' | 'otherwise';
  provider?: string;
  target?: string;
  messageId?: string;
  detail?: string;
  error?: string;
}

/**
 * Atomically append entries (jsonb concatenation) — safe when several email/SMS jobs for the
 * same submission finish concurrently. No-op when the submission no longer exists.
 */
export async function appendActionsLog(prisma: PrismaClient, submissionId: string, entries: ActionLogEntry | ActionLogEntry[]): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return;
  await prisma.$executeRaw`UPDATE form_submissions SET actions_log = COALESCE(actions_log, '[]'::jsonb) || ${JSON.stringify(list)}::jsonb, updated_at = NOW() WHERE id = ${submissionId}`;
}
