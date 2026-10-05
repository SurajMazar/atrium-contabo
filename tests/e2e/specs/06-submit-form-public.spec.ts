import { siteURL } from '../fixtures/env';
import { expect, test } from '../fixtures/test';
import { env } from '../fixtures/env';

test('a visitor submits a form on the published site', async ({ page, site, userApi }) => {
  const form = await userApi.createContactForm(site.id);
  // Put a form section on the homepage through the same SiteOperations the builder uses, then publish.
  await userApi.operations(site.id, [
    {
      op: 'addNode',
      pageId: site.homepageId,
      parentId: null,
      node: { type: 'form', props: { formId: form.id, heading: 'Get in touch' } },
    },
  ]);
  await userApi.publish(site.id);

  const marker = `e2e-${Date.now()}`;
  await page.goto(siteURL(site.slug));
  const formEl = page
    .locator('form')
    .filter({ has: page.getByLabel('Message') })
    .first();
  await expect(formEl).toBeVisible({ timeout: 30_000 });
  await formEl.getByLabel('Name').fill('Grace Hopper');
  await formEl.getByLabel('Email').fill(`grace+${marker}@atrium.test`);
  await formEl.getByLabel('Message').fill(`Hello ${marker}`);
  // Spam scoring treats instant submissions as bots (time-to-submit); behave like a person.
  await page.waitForTimeout(3000);
  await formEl.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Thanks — e2e received.')).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(async () => JSON.stringify((await userApi.submissions(site.id, form.id)).items), {
      timeout: 15_000,
      message: 'submission stored',
    })
    .toContain(marker);

  if (!env.skipEmail) {
    // Notification/auto-responder emails are optional per form; only assert Mailpit is reachable.
    const res = await page.request.get(`${env.mailpitURL}/api/v1/messages`);
    expect(res.ok()).toBe(true);
  }
});
