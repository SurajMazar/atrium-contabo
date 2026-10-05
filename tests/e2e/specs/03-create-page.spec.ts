import { expect, test } from '../fixtures/test';
import { uniqueSlug } from '../fixtures/env';

test('add a page from the pages screen', async ({ authedPage: page, site, userApi }) => {
  const title = `About ${uniqueSlug('p', 6)}`;
  await page.goto(`/w/${site.id}/pages`);
  await page.getByRole('button', { name: 'New page' }).first().click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  // The URL is derived from the title until edited.
  await expect(dialog.getByLabel('URL')).not.toHaveValue('');
  await dialog.getByRole('button', { name: 'Create page' }).click();

  await expect(dialog.getByText('Page created')).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Open in editor/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByText(title)).toBeVisible();
  const draft = await userApi.draft(site.id);
  expect(draft.definition.pages.map((p) => p.title)).toContain(title);
});
