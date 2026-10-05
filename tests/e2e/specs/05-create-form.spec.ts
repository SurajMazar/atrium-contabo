import { expect, test } from '../fixtures/test';
import { uniqueSlug } from '../fixtures/env';

test('create a form; it starts with name, email and message fields', async ({
  authedPage: page,
  site,
  userApi,
}) => {
  const name = `Enquiry ${uniqueSlug('f', 6)}`;
  await page.goto(`/w/${site.id}/forms`);
  await page.getByRole('button', { name: 'New form' }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Starts with name, email and message fields')).toBeVisible();
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create form' }).click();

  await expect(page).toHaveURL(new RegExp(`/w/${site.id}/forms/[^/]+$`), { timeout: 20_000 });
  await expect(page.getByText('Form created')).toBeVisible();

  const formId = page.url().split('/').pop()!;
  const form = await userApi.get<{ name: string; fields: Array<{ name: string; type: string }> }>(
    `/forms/${formId}`,
  );
  expect(form.name).toBe(name);
  expect(form.fields.map((f) => f.type)).toEqual(expect.arrayContaining(['email']));
  expect(form.fields.length).toBeGreaterThanOrEqual(3);
});
