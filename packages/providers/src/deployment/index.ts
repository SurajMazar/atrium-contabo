import { cloudflarePagesDriver } from './cloudflare-pages';
import { netlifyDriver } from './netlify';
import { selfHostedDriver } from './self-hosted';
import { vercelDriver } from './vercel';

export * from './types';
export { dnsGuidance, isApexDomain, normalizeDomain, registrableDomain, subdomainLabel, type DnsGuidanceTarget, type DnsRecord } from './dns';
export {
  vercelDriver,
  VercelDeploymentProvider,
  vercelConfigSchema,
  vercelSecretsSchema,
  sanitizeVercelProjectName,
  mapVercelState,
  buildVercelDomainConfig,
  type VercelConfig,
  type VercelSecrets,
} from './vercel';
export {
  netlifyDriver,
  NetlifyDeploymentProvider,
  netlifyConfigSchema,
  netlifySecretsSchema,
  sanitizeNetlifySiteName,
  mapNetlifyState,
  type NetlifyConfig,
  type NetlifySecrets,
} from './netlify';
export {
  cloudflarePagesDriver,
  CloudflarePagesDeploymentProvider,
  cloudflarePagesConfigSchema,
  cloudflarePagesSecretsSchema,
  encodePagesDeploymentId,
  decodePagesDeploymentId,
  sanitizePagesProjectName,
  pagesAssetHash,
  mapPagesStage,
  unwrapCloudflare,
  buildPagesDomainConfig,
  type CloudflarePagesConfig,
  type CloudflarePagesSecrets,
} from './cloudflare-pages';
export {
  selfHostedDriver,
  SelfHostedDeploymentProvider,
  selfHostedConfigSchema,
  selfHostedSecretsSchema,
  selfHostedLabel,
  selfHostedVerificationRecordName,
  type SelfHostedConfig,
  type DnsResolver,
} from './self-hosted';

export const deploymentDrivers = [vercelDriver, netlifyDriver, cloudflarePagesDriver, selfHostedDriver] as const;
