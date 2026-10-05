import type { Director, Scene } from '../director';
import { ADMIN, EMAIL, PASSWORD } from '../session';
import { getWorld } from '../world';
import { card } from './helpers';

const CH = 'Workspace';
export const nav = (d: Director, name: string | RegExp) => d.click(d.page.getByRole('link', { name, exact: typeof name === 'string' }).first());

export const workspaceScenes: Scene[] = [
  card('10-workspace-card', CH, 'Chapter 2', 'Your *workspace*', 'Organizations · websites · roles · the command palette', [
    'Now open the admin at localhost port three thousand and sign in with the seeded super admin.',
  ]),
  {
    id: '11-signin', chapter: CH, title: 'Sign in', storage: 'none',
    setup: async (d) => d.goto(`${ADMIN}/login`, 'input'),
    steps: [
      { say: 'Accounts support passwords, two factor authentication with authenticator apps and recovery codes, and revocable sessions.', do: async (d) => {
        await d.type(d.page.getByLabel(/email/i), EMAIL, { delay: 30 });
        await d.type(d.page.getByLabel(/password/i), PASSWORD, { delay: 45 });
      } },
      { say: 'Access tokens are short lived, and the refresh token is rotated on every use and stored in a secure, http only cookie.', do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /sign in|log in|continue/i }));
        await d.page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
        await d.wait(1500);
      } },
      { say: 'This is your organization. A user can belong to many organizations, and every organization owns its own websites, team, media, integrations and billing.', do: async (d) => {
        await d.highlight(d.page.getByRole('button', { name: /Atrium Demo Studio/ }).first(), 'Organization switcher');
        await d.wait(2200);
        await d.highlight(d.page.locator('main').first(), 'Websites');
        await d.wait(2000);
        await d.highlight(null);
      } },
    ],
  },
  {
    id: '12-palette', chapter: CH, title: 'Command palette', storage: 'admin',
    setup: async (d) => d.goto(`${ADMIN}/`, 'main'),
    steps: [
      { say: 'Three demo websites were seeded: a lakeside resort, a consulting firm, and a wedding venue. All three are published and fully editable.', do: async (d) => {
        for (const n of ['Rosewood Courtyard', 'Northwind Partners', 'Aranya Lake Retreat']) {
          await d.moveTo(d.page.getByText(n, { exact: true }).last(), 700);
          await d.wait(500);
        }
      } },
      { say: 'Press command K anywhere to open the command palette. Jump to any website or page, create pages, open media, preview, publish, or ask AI, without touching the mouse.', do: async (d) => {
        await d.press('Meta+k');
        await d.wait(600);
        await d.page.keyboard.type('aranya', { delay: 90 });
        await d.wait(1600);
        await d.page.keyboard.press('Escape');
      } },
    ],
  },
];

export const createScenes: Scene[] = [
  card('20-create-card', 'Create a website', 'Chapter 3', 'Create a website with *AI*', 'Describe a business · Atrium plans, writes and designs · everything stays editable', [
    'There are four ways to start a website: generate it with AI, start from a template, start blank, or import an export.',
  ]),
  {
    id: '21-create-options', chapter: 'Create a website', title: 'Ways to start', storage: 'admin',
    setup: async (d) => d.goto(`${ADMIN}/w/new`, 'h1'),
    steps: [
      { say: 'Templates and blueprints are configuration, not code: they initialize pages, sections, theme, navigation, forms and collections that you then own.', do: async (d) => {
        for (const re of [/Generate with AI/, /Start from a template/, /Blank website/, /Import an exported website/]) {
          await d.highlight(d.page.getByRole(re.source.startsWith('Generate') ? 'link' : 'button', { name: re }).first());
          await d.wait(1100);
        }
        await d.highlight(null);
      } },
      { say: 'Let us look at the template gallery first. Nine blueprints cover hospitality, venues, restaurants, corporate, agencies, software, portfolios and real estate.', do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /Start from a template/ }));
        await d.wait(1800);
        await d.scroll(500);
        await d.wait(800);
      } },
    ],
  },
  {
    id: '22-create-ai', chapter: 'Create a website', title: 'Generate with AI', storage: 'admin',
    setup: async (d) => d.goto(`${ADMIN}/w/new/ai`, 'h1'),
    steps: [
      { say: 'Now the headline feature. Tell Atrium about your business: its name, what it does, where it is, and who it is for.', do: async (d) => {
        await d.type(d.page.getByLabel('Business name'), 'Himalaya Lodge', { delay: 40 });
        const type = d.page.getByLabel('Business type');
        await d.click(type);
        await d.wait(400);
        const opt = d.page.getByRole('option', { name: /resort|hotel|hospitality/i }).first();
        if (await opt.count()) await d.click(opt);
        else await d.page.keyboard.press('Escape');
        await d.type(d.page.getByLabel('What do you do?'), 'A sixteen room mountain lodge above Pokhara with an infinity pool, a spa, a farm to table restaurant and sunrise views of the Annapurna range.', { delay: 12 });
      } },
      { say: 'Pick a style and the pages you want. The agent turns this brief into a sitemap, a design system, real copy, forms, CMS collections and SEO.', do: async (d) => {
        await d.type(d.page.getByLabel(/Location/), 'Sarangkot, Pokhara, Nepal', { delay: 25 });
        await d.click(d.page.getByRole('radio', { name: 'Earthy eco' }));
        await d.click(d.page.getByRole('checkbox', { name: 'Rooms' }));
        await d.click(d.page.getByRole('checkbox', { name: 'FAQ' }));
      } },
      { say: 'Claude is the default model, with OpenAI and Gemini adapters available. For this recording, the offline demo provider stands in for the model, so you can try the whole flow without an API key.', do: async (d) => {
        await d.scroll(700);
        await d.click(d.page.getByRole('button', { name: 'Generate website' }));
      } },
      { say: 'Progress is streamed live from the background worker. These are the real steps: understanding the business, planning, the design system, the homepage, the remaining pages, content, and SEO.', do: async (d) => d.wait(3000) },
      { say: 'Every piece of output is validated against the component registry. If the model produces something invalid, Atrium sends the exact problems back for one repair pass, so a single bad property never breaks a generation.', do: async (d) => {
        await d.page.waitForURL(/\/editor/, { timeout: 60_000 }).catch(() => undefined);
        await d.wait(2500);
      } },
      { say: 'And here is the result, open in the visual builder. Because the AI wrote structured data for the same components a human uses, every part of this site is immediately editable.', do: async (d) => {
        const f = d.page.frameLocator('iframe[title="Page canvas"]');
        await d.wait(1500);
        await f.locator('body').evaluate(() => window.scrollTo({ top: 900, behavior: 'smooth' })).catch(() => undefined);
        await d.wait(2500);
        await f.locator('body').evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => undefined);
      } },
    ],
  },
];

export async function siteId(slug: 'aranya' | 'northwind' | 'rosewood') {
  return (await getWorld()).sites[slug];
}
