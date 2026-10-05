import { ProviderError } from '@atrium/providers';
import { UnrecoverableError } from 'bullmq';

/** Throw to fail a job permanently (no further BullMQ retries). */
export class PermanentError extends UnrecoverableError {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

/** Retry only provider errors flagged retryable (and unknown errors); everything else is permanent. */
export function classify(err: unknown): Error {
  if (err instanceof UnrecoverableError) return err;
  if (err instanceof ProviderError) return err.retryable ? err : new PermanentError(err.message);
  return err instanceof Error ? err : new Error(String(err));
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
