import type { TestResult } from '../driver';

export type DeploymentStatus = 'queued' | 'building' | 'ready' | 'failed' | 'cancelled';
export type DeploymentTarget = 'preview' | 'production';

export interface DeploymentFile {
  /** Path relative to project root, POSIX separators. */
  path: string;
  content: Buffer | string;
}

export interface DeployInput {
  /** Stable project identity for this website at the provider (created if missing). */
  projectName: string;
  target: DeploymentTarget;
  files: DeploymentFile[];
  /** Framework hint (nextjs | static). */
  framework: 'nextjs' | 'static';
  env?: Record<string, string>;
  meta?: Record<string, string>;
}

export interface DeploymentInfo {
  id: string;
  url?: string;
  status: DeploymentStatus;
  target: DeploymentTarget;
  createdAt?: string;
  readyAt?: string;
  error?: string;
  inspectorUrl?: string;
  projectId?: string;
}

export interface DeploymentLogLine {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface DomainConfig {
  domain: string;
  verified: boolean;
  /** DNS records the user must create. */
  records: Array<{ type: 'A' | 'AAAA' | 'CNAME' | 'TXT'; name: string; value: string; reason: string }>;
  misconfigured?: boolean;
  ssl?: 'pending' | 'active' | 'error';
}

/** Deployment is provider-independent: core logic only talks to this interface. */
export interface DeploymentProvider {
  readonly driver: string;
  deploy(input: DeployInput): Promise<DeploymentInfo>;
  redeploy(deploymentId: string, target?: DeploymentTarget): Promise<DeploymentInfo>;
  rollback(projectName: string, deploymentId: string): Promise<DeploymentInfo>;
  cancel?(deploymentId: string): Promise<void>;
  getStatus(deploymentId: string): Promise<DeploymentInfo>;
  getLogs(deploymentId: string): Promise<DeploymentLogLine[]>;
  addDomain(projectName: string, domain: string, opts?: { redirectTo?: string }): Promise<DomainConfig>;
  removeDomain(projectName: string, domain: string): Promise<void>;
  verifyDomain(projectName: string, domain: string): Promise<DomainConfig>;
  test(): Promise<TestResult>;
}
