import { randomBytes } from 'node:crypto';

// The secret policy (specs, .env.example values, strength assessment, production checks) is shared
// with the API and worker: it lives in @atrium/server-kit and is imported from source here because the
// CLI must work on a fresh checkout before any workspace package is built (the file is dependency-free).
import {
  APP_SECRETS,
  INFRA_SECRETS,
  type SecretEncoding,
} from '../../../server-kit/src/production-secrets';

export {
  APP_SECRETS,
  INFRA_SECRETS,
  KNOWN_EXAMPLE_VALUES,
  assessSecret,
  assessKeyring,
  assertProductionSecrets,
  productionConfigIssues,
  publicUrlProblem,
  isLoopbackUrl,
  API_PRODUCTION_SPEC,
  WORKER_PRODUCTION_SPEC,
  ProductionConfigError,
} from '../../../server-kit/src/production-secrets';
export type {
  SecretEncoding,
  SecretSpec,
  SecretAssessment,
  ProductionCheckSpec,
} from '../../../server-kit/src/production-secrets';

export function randomSecret(bytes: number, encoding: SecretEncoding = 'base64url'): string {
  return randomBytes(bytes).toString(encoding);
}

export function generateSecret(key: string): string {
  const spec = APP_SECRETS[key] ?? INFRA_SECRETS[key];
  if (!spec) return randomSecret(32);
  return randomSecret(spec.bytes, spec.encoding);
}

/** Keys whose values are secret and must be masked in output. */
export function isSecretKey(key: string): boolean {
  if (key in APP_SECRETS || key in INFRA_SECRETS) return true;
  if (/_ALLOW_PRIVATE$/.test(key)) return false; // boolean toggles such as OUTBOUND_ALLOW_PRIVATE
  return /(SECRET|PASSWORD|PASSWD|TOKEN|SALT|PRIVATE|_KEY$|_KEY_ID$|API_KEY|CREDENTIALS)/.test(key);
}

/** Keys whose values are URLs that may embed credentials. */
export function isUrlKey(key: string): boolean {
  return /(_URL|_DSN|_URI)$/.test(key);
}
