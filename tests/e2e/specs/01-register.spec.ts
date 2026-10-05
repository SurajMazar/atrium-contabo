import { expect, test } from '../fixtures/test';
import { TEST_PASSWORD, uniqueEmail } from '../fixtures/env';

test.describe('registration', () => {
  test('a new user registers and lands in onboarding with an organization', async ({
    page,
    api,
  }) => {
    const email = uniqueEmail('register');
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Ada Lovelace');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel(/Organization name/).fill('Analytical Engines');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });

    // The API agrees: the user can log in and owns the organization.
    const login = await api.post<{ accessToken: string }>('/auth/login', {
      email,
      password: TEST_PASSWORD,
    });
    const me = await api.withToken(login.accessToken).me();
    expect(me.user.email).toBe(email);
    expect(me.memberships.map((m) => m.organization.name)).toContain('Analytical Engines');
  });

  test('duplicate emails are rejected with a field error', async ({ page, user }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Someone Else');
    await page.getByLabel('Work email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('An account with this email already exists')).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });
});
