import { expect, test } from '../fixtures/test';
import { uniqueSlug } from '../fixtures/env';

test('create a website from a template and open it in the builder', async ({
  authedPage: page,
  userApi,
  user,
}) => {
  const template = await userApi.firstSiteTemplate();
  test.skip(!template, 'The platform has no SITE templates (run `pnpm db:seed`).');

  const name = `Lakeside ${uniqueSlug('t', 8)}`;
  await page.goto('/w/new?method=template');
  await expect(page.getByRole('heading', { name: 'Choose a template' })).toBeVisible();
  // Pick the first template card's "Use" button.
  await page.getByRole('button', { name: 'Use', exact: true }).first().click();

  await expect(page.getByRole('heading', { name: 'Name your website' })).toBeVisible();
  await page.getByLabel('Website name').fill(name);
  await page.getByRole('button', { name: 'Create website' }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+\/editor/, { timeout: 30_000 });
  await expect(page.locator('iframe[title="Page canvas"]')).toBeVisible({ timeout: 30_000 });

  const websiteId = /\/w\/([^/]+)\/editor/.exec(page.url())![1]!;
  const sites = await userApi.get<unknown>(`/organizations/${user.organizationId}/websites`);
  const list = (Array.isArray(sites) ? sites : (sites as { items: unknown[] }).items) as Array<{
    id: string;
    name: string;
  }>;
  expect(list.find((s) => s.id === websiteId)?.name).toBe(name);
});
