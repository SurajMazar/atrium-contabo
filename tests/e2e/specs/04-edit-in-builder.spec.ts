import { canvas, expect, test } from '../fixtures/test';
import { uniqueSlug } from '../fixtures/env';

test('select a heading on the canvas, edit it in the inspector, autosave persists', async ({
  authedPage: page,
  site,
  userApi,
}) => {
  const text = `Hello from e2e ${uniqueSlug('h', 6)}`;
  await page.goto(`/w/${site.id}/editor?page=${site.homepageId}`);

  const frame = canvas(page);
  const heading = frame.locator('[data-node-id] h1, [data-node-id] h2').first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await heading.click();

  // The inspector exposes the heading prop as a labelled text field ("Headline" on heroes, "Heading"/"Text" elsewhere).
  const field = page.getByLabel(/^(Headline|Heading|Text|Title)$/).first();
  await expect(field).toBeVisible();
  await field.fill(text);

  // Autosave: the indicator moves through "Saving…" to "Saved".
  await expect(page.getByText(/^(Saved|All changes saved)/)).toBeVisible({ timeout: 20_000 });
  await expect(heading).toContainText(text);

  // Persisted server-side…
  await expect
    .poll(async () => JSON.stringify((await userApi.page(site.homepageId)).document), {
      timeout: 15_000,
    })
    .toContain(text);
  // …and after a reload.
  await page.reload();
  await expect(canvas(page).getByText(text).first()).toBeVisible({ timeout: 30_000 });
});
