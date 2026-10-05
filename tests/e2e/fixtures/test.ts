import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { Api, type TestSite, type TestUser } from './api';
import { AUTH_DIR, env } from './env';

/** Sign in through the real login form (the refresh cookie is httpOnly on the admin origin). */
export async function login(page: Page, user: Pick<TestUser, 'email' | 'password'>) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
  await expect(page, 'login should leave the /login page').not.toHaveURL(/\/login(\?|$)/, {
    timeout: 20_000,
  });
}

interface Fixtures {
  api: Api;
  user: TestUser;
  userApi: Api;
  site: TestSite;
  /** A page already signed in as `user` (storage state cached per user under .auth/). */
  authedPage: Page;
}

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new Api(request));
  },
  user: async ({ api }, use, info) => {
    await use(await api.register(`w${info.workerIndex}`));
  },
  userApi: async ({ api, user }, use) => {
    await use(api.withToken(user.accessToken));
  },
  site: async ({ userApi, user }, use) => {
    await use(await userApi.createSite(user));
  },
  authedPage: async ({ browser, user }, use) => {
    mkdirSync(AUTH_DIR, { recursive: true });
    const statePath = join(AUTH_DIR, `${user.email.replace(/[^a-z0-9]/gi, '_')}.json`);
    const context = await browser.newContext({ baseURL: env.adminURL });
    const page = await context.newPage();
    await login(page, user);
    await context.storageState({ path: statePath });
    await use(page);
    await context.close();
  },
});

export { expect };

/** The builder canvas is an iframe titled "Page canvas" whose nodes carry data-node-id. */
export function canvas(page: Page) {
  return page.frameLocator('iframe[title="Page canvas"]');
}
