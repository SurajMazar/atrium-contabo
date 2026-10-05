export const FEATURE_FLAGS = {
  aiBuilder: 'AI website generation and editing',
  collaboration: 'Presence and page locking',
  customCode: 'Custom CSS and script injection',
  vercelDeployment: 'Independent deployments to Vercel',
  multilingual: 'Localized pages and content',
  advancedAnalytics: 'Advanced analytics dashboards',
  gitIntegration: 'Push deployment packages to Git providers',
  siteSearch: 'Public website search',
} as const;
export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export interface PlanLimits {
  websites: number;
  members: number;
  storageMb: number;
  aiRequestsPerMonth: number;
  aiTokensPerMonth: number;
  submissionsPerMonth: number;
  customDomains: number;
  monthlyPageviews: number;
}

export const DEFAULT_PLANS: Array<{ key: string; name: string; limits: PlanLimits; features: FeatureFlag[] }> = [
  {
    key: 'starter',
    name: 'Starter',
    limits: { websites: 1, members: 3, storageMb: 1024, aiRequestsPerMonth: 50, aiTokensPerMonth: 500_000, submissionsPerMonth: 500, customDomains: 1, monthlyPageviews: 25_000 },
    features: ['aiBuilder'],
  },
  {
    key: 'studio',
    name: 'Studio',
    limits: { websites: 10, members: 15, storageMb: 20_480, aiRequestsPerMonth: 1000, aiTokensPerMonth: 10_000_000, submissionsPerMonth: 10_000, customDomains: 20, monthlyPageviews: 500_000 },
    features: ['aiBuilder', 'customCode', 'vercelDeployment', 'multilingual', 'collaboration'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    limits: { websites: 1000, members: 1000, storageMb: 1_048_576, aiRequestsPerMonth: 100_000, aiTokensPerMonth: 1_000_000_000, submissionsPerMonth: 1_000_000, customDomains: 1000, monthlyPageviews: 100_000_000 },
    features: ['aiBuilder', 'customCode', 'vercelDeployment', 'multilingual', 'collaboration', 'advancedAnalytics', 'gitIntegration', 'siteSearch'],
  },
];
