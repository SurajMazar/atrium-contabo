import type { Browser } from 'playwright';
import path from 'node:path';

export const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3000';
export const API = process.env.API_URL ?? 'http://localhost:4000';
export const RENDERER = process.env.RENDERER_URL ?? 'http://localhost:3001';
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:58025';
export const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@atrium.localhost';
export const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Atrium!2026';

/** Sign in once through the real UI and reuse the refresh cookie in every scene. */
export async function prepareAdminSession(browser: Browser): Promise<string> {
  const file = path.resolve(import.meta.dirname, '../.cache/admin-state.json');
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}
