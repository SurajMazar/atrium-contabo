import { z } from 'zod';
import { defineDriver, ProviderError, type TestResult } from '{{driverImport}}';
import type { DeployInput, DeploymentInfo, DeploymentLogLine, DeploymentProvider, DeploymentTarget, DomainConfig } from '{{typesImport}}';

export const {{camel}}ConfigSchema = z.object({
  teamId: z.string().optional(),
  region: z.string().optional(),
});
export const {{camel}}SecretsSchema = z.object({ token: z.string().min(1) });

const todo = (op: string): never => {
  throw new ProviderError(`{{id}}: ${op}() not implemented`, '{{id}}', false);
};

/** Turns exporter output (files) into a deployment on the provider; see docs/VERCEL.md for the reference flow. */
export class {{Pascal}}DeploymentProvider implements DeploymentProvider {
  readonly driver = '{{id}}';
  constructor(
    private readonly config: z.output<typeof {{camel}}ConfigSchema>,
    private readonly secrets: z.output<typeof {{camel}}SecretsSchema>,
  ) {}

  async deploy(input: DeployInput): Promise<DeploymentInfo> {
    void this.config;
    void this.secrets;
    return todo(`deploy ${input.projectName} (${input.files.length} files, ${input.target})`);
  }
  async redeploy(deploymentId: string, target?: DeploymentTarget): Promise<DeploymentInfo> {
    return todo(`redeploy ${deploymentId} ${target ?? ''}`);
  }
  async rollback(projectName: string, deploymentId: string): Promise<DeploymentInfo> {
    return todo(`rollback ${projectName} → ${deploymentId}`);
  }
  async getStatus(deploymentId: string): Promise<DeploymentInfo> {
    return todo(`getStatus ${deploymentId}`);
  }
  async getLogs(deploymentId: string): Promise<DeploymentLogLine[]> {
    return todo(`getLogs ${deploymentId}`);
  }
  async addDomain(projectName: string, domain: string): Promise<DomainConfig> {
    return todo(`addDomain ${domain} on ${projectName}`);
  }
  async removeDomain(projectName: string, domain: string): Promise<void> {
    todo(`removeDomain ${domain} on ${projectName}`);
  }
  async verifyDomain(projectName: string, domain: string): Promise<DomainConfig> {
    return todo(`verifyDomain ${domain} on ${projectName}`);
  }
  async test(): Promise<TestResult> {
    return { ok: false, message: '{{id}}: test() not implemented' };
  }
}

export const {{camel}}Driver = defineDriver({
  kind: '{{kind}}',
  id: '{{id}}',
  name: '{{title}}',
  description: 'TODO: one line shown in the admin integrations picker.',
  configSchema: {{camel}}ConfigSchema,
  secretsSchema: {{camel}}SecretsSchema,
  create: (config, secrets): DeploymentProvider => new {{Pascal}}DeploymentProvider(config, secrets),
});
