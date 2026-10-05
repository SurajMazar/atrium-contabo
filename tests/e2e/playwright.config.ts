import { defineConfig, devices } from '@playwright/test';
import { env } from './fixtures/env';

/**
 * Atrium end-to-end suite. Runs against an already running stack:
 *   pnpm atrium start            (or `atrium start --prod -d` after `pnpm build`)
 *   pnpm e2e
 * URLs come from E2E_* env vars (fixtures/env.ts). No webServer is started here.
 */
export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Specs create their own users/sites, but the builder + publish flows are heavy; keep CI deterministic.
  fullyParallel: false,
  workers: env.isCI ? 1 : 2,
  retries: env.isCI ? 2 : 0,
  forbidOnly: env.isCI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: env.adminURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
