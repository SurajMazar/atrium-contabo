import { expect, test } from '../fixtures/test';
import { uniqueSlug } from '../fixtures/env';

test('a preview link shows the draft without signing in; revoked links stop working', async ({
  browser,
  site,
  userApi,
}) => {
  const draftText = `Draft only ${uniqueSlug('d', 6)}`;
  // Draft-only change: a hero section at the top of the homepage (never published in this test).
  await userApi.operations(site.id, [
    {
      op: 'addNode',
      pageId: site.homepageId,
      parentId: null,
      index: 0,
      node: { type: 'hero', variant: 'minimal', props: { heading: draftText } },
    },
  ]);
  const preview = await userApi.createPreviewToken(site.id);
  expect(preview.url).toContain(preview.token);

  // Fresh context: no admin session at all.
  const anon = await browser.newContext();
  const page = await anon.newPage();
  await page.goto(preview.url);
  await expect(page.getByText(draftText).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Preview · not published/)).toBeVisible();

  await userApi.revokePreviewToken(site.id, preview.id);
  const res = await page.goto(preview.url);
  expect(res?.status() ?? 0, 'revoked preview must not render').toBeGreaterThanOrEqual(400);
  await expect(page.getByText(draftText)).toHaveCount(0);
  await anon.close();
});
