import { canvas, expect, test } from '../fixtures/test';
import { siteURL, uniqueSlug } from '../fixtures/env';

test('publish from the builder; draft changes only go live on publish', async ({
  authedPage: page,
  site,
  userApi,
  browser,
}) => {
  // Baseline: first publication.
  await userApi.publish(site.id, 'baseline');

  const text = `Published ${uniqueSlug('p', 6)}`;
  await page.goto(`/w/${site.id}/editor?page=${site.homepageId}`);
  const heading = canvas(page).locator('[data-node-id] h1, [data-node-id] h2').first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await heading.click();
  await page
    .getByLabel(/^(Headline|Heading|Text|Title)$/)
    .first()
    .fill(text);
  await expect(page.getByText(/^(Saved|All changes saved)/)).toBeVisible({ timeout: 20_000 });

  // Not live yet.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(siteURL(site.slug));
  await expect(visitor.getByText(text)).toHaveCount(0);

  // Publish through the toolbar dialog.
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: /Publish website/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click({ timeout: 30_000 });
  await expect(page.getByText(/Published version \d+/)).toBeVisible({ timeout: 30_000 });

  // Live after revalidation.
  await expect(async () => {
    await visitor.goto(siteURL(site.slug));
    await expect(visitor.getByText(text).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  const versions = await userApi.get<unknown>(`/websites/${site.id}/versions`);
  const list = (
    Array.isArray(versions) ? versions : (versions as { items: unknown[] }).items
  ) as Array<{ number: number }>;
  expect(list.length).toBeGreaterThanOrEqual(2);
});
