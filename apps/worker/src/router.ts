import { JOB_SCHEMAS, type JobName, type JobPayload } from '@atrium/server-kit';
import type { JobInfo, WorkerContext } from './context';
import { PermanentError } from './lib/errors';
import { processAiGenerateSite } from './processors/ai';
import { processAnalyticsRollup } from './processors/analytics';
import { processDeploymentPoll, processDeploymentRun } from './processors/deployments';
import { processEmailSend } from './processors/email';
import { processFormSubmission } from './processors/forms';
import { processMaintenanceCleanup } from './processors/maintenance';
import { processMedia } from './processors/media';
import { processSmsSend } from './processors/sms';
import { processWebhookDeliver, processWebhookDispatch } from './processors/webhooks';

type Processor<N extends JobName> = (ctx: WorkerContext, data: JobPayload<N>, job: JobInfo) => Promise<unknown>;

export const PROCESSORS: { [N in JobName]: Processor<N> } = {
  'email.send': processEmailSend,
  'sms.send': processSmsSend,
  'webhook.dispatch': processWebhookDispatch,
  'webhook.deliver': processWebhookDeliver,
  'form.process': processFormSubmission,
  'media.process': processMedia,
  'deployment.run': processDeploymentRun,
  'deployment.poll': processDeploymentPoll,
  'ai.generate-site': processAiGenerateSite,
  'analytics.rollup': processAnalyticsRollup,
  'maintenance.cleanup': processMaintenanceCleanup,
};

/** Validate the payload against the shared contract and dispatch to its processor. */
export async function routeJob(ctx: WorkerContext, name: string, data: unknown, job: JobInfo): Promise<unknown> {
  if (!(name in JOB_SCHEMAS)) throw new PermanentError(`Unknown job "${name}"`);
  const jobName = name as JobName;
  const parsed = JOB_SCHEMAS[jobName].safeParse(data);
  if (!parsed.success) throw new PermanentError(`Invalid payload for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const processor = PROCESSORS[jobName] as Processor<JobName>;
  return processor(ctx, parsed.data as JobPayload<JobName>, job);
}
