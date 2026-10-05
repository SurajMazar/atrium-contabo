/** Platform events emitted to webhooks, audit and activity timeline. */
export const WEBHOOK_EVENTS = [
  'form.submitted', 'page.published', 'website.published', 'deployment.created', 'deployment.completed',
  'deployment.failed', 'media.uploaded', 'user.invited', 'domain.verified', 'ai.generation.completed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
