import path from 'node:path';
import type { Director, Scene } from '../director';
import { asset } from '../director';
import { ADMIN, MAILPIT } from '../session';
import { getWorld } from '../world';
import { card } from './helpers';
import { nav, siteId } from './workspace';

const UPLOADS = path.resolve(import.meta.dirname, '../../.cache/upload');
const org = async (p: string) => `${ADMIN}/org/${(await getWorld()).orgId}${p}`;
const site = async (p = '') => `${ADMIN}/w/${await siteId('aranya')}${p}`;
const btn = (d: Director, name: string | RegExp) => d.page.getByRole('button', { name, exact: typeof name === 'string' }).first();
const tab = (d: Director, name: string | RegExp) => d.page.getByRole('tab', { name }).first();
const closeOverlays = async (d: Director) => {
  await d.page.keyboard.press('Escape');
  await d.wait(400);
};

export const contentScenes: Scene[] = [
  card('40-content-card', 'Content', 'Chapter 5', 'Pages, SEO, *CMS* and media', 'Structured content you manage once and reuse everywhere', [
    'Back in the website dashboard, let us look at content: pages, search optimization, CMS collections, and the media library.',
  ]),
  {
    id: '41-dashboard', chapter: 'Content', title: 'Website dashboard', storage: 'admin',
    setup: async (d) => d.goto(await site(), 'h1'),
    steps: [
      { say: 'Each website has its own control centre: status and production address, visitors, pageviews, new enquiries, conversion rate, SEO score and storage, plus deployment, edit and AI history.', do: async (d) => {
        await d.highlight(d.page.locator('main').getByText('Visitors · 7d').locator('..').locator('..'), 'Key metrics');
        await d.wait(3000);
        await d.highlight(null);
      } },
    ],
  },
  {
    id: '42-pages', chapter: 'Content', title: 'Pages', storage: 'admin',
    setup: async (d) => d.goto(await site('/pages'), 'h1'),
    steps: [
      { say: 'The pages list shows every page with its status. Pages can be drafts, published, scheduled for a future date, or archived. You can duplicate pages, change addresses, and set any page as the homepage.', do: async (d) => {
        await d.click(btn(d, 'Actions for Rooms & Suites'));
        await d.wait(1800);
        await closeOverlays(d);
      } },
      { say: 'New pages can start blank or from sixteen page templates, such as about, contact, gallery, pricing, team or FAQ. Each page keeps a version history you can compare and restore.', do: async (d) => {
        await d.click(btn(d, 'New page'));
        await d.wait(2400);
        await closeOverlays(d);
      } },
    ],
  },
  {
    id: '43-seo', chapter: 'Content', title: 'SEO', storage: 'admin',
    setup: async (d) => d.goto(await site('/seo'), 'h1'),
    steps: [
      { say: 'SEO is built in. Every page gets a score with clear checks: title, description, canonical address, social image, a single H1, alt text coverage, content depth and structured data.', do: async (d) => {
        await d.click(btn(d, 'Show checks for Home'));
        await d.wait(2600);
      } },
      { say: 'AI suggestions propose better titles and descriptions you can apply with one click. Site defaults cover title templates, robots rules, verification codes and structured data such as Hotel, Restaurant, Event, FAQ and LocalBusiness.', do: async (d) => {
        await d.click(tab(d, 'Site defaults'));
        await d.wait(2200);
      } },
      { say: 'Redirects support permanent and temporary status codes with loop detection, and the link checker finds broken internal links and anchors before visitors do. Sitemaps and robots files are generated automatically.', do: async (d) => {
        await d.click(tab(d, /Redirects/));
        await d.wait(1800);
        await d.click(tab(d, 'Broken links'));
        await d.wait(1200);
      } },
    ],
  },
  {
    id: '44-cms', chapter: 'Content', title: 'CMS collections', storage: 'admin',
    setup: async (d) => d.goto(await site('/cms'), 'h1'),
    steps: [
      { say: 'Collections hold repeating content like rooms, events, team members, case studies or blog posts. You define the fields: text, rich text, numbers, dates, images, galleries, relations, selects, colours, links and locations.', do: async (d) => {
        await d.click(d.page.getByRole('link', { name: 'Rooms & Suites' }).first());
        await d.wait(2200);
      } },
      { say: 'Editors work in a clean item form generated from those fields. Items can be drafts or published, and you can drag them into any order.', do: async (d) => {
        const row = d.page.locator('main table tbody tr').first();
        await d.click(row);
        await d.wait(2600);
        await closeOverlays(d);
      } },
      { say: 'Any list component can bind to a collection in the builder, mapping fields like name, image and price into cards. Each item also gets its own detail page from a template, such as slash rooms slash lake suite.', do: async (d) => {
        await d.click(d.page.getByRole('tab', { name: /Schema/ }).first());
        await d.wait(2400);
      } },
    ],
  },
  {
    id: '45-media', chapter: 'Content', title: 'Media library', storage: 'admin',
    setup: async (d) => d.goto(await site('/media'), 'h1'),
    steps: [
      { say: 'The media library supports folders, tags, search and bulk upload with progress. Let us upload three photos.', do: async (d) => {
        await d.moveTo(btn(d, 'Upload'));
        await d.page.locator('input[type="file"]').first().setInputFiles(['spa-massage.jpg', 'fine-dining.jpg', 'lake-view-room.jpg'].map((f) => path.join(UPLOADS, f)));
        await d.wait(4500);
      } },
      { say: 'Images are processed in the background: the worker generates WebP and AVIF variants at several widths, a blur placeholder and a dominant colour, so mobile visitors never download a ten megabyte original.', do: async (d) => {
        await d.wait(1200);
        await d.click(d.page.locator('main img').first());
        await d.wait(2400);
      } },
      { say: 'Add alt text, titles, captions and tags here. Uploading the same file twice is detected, and replacing a file keeps every reference to it working. Storage can be local disk, S3, Cloudflare R2, MinIO, SeaweedFS, Oracle, or Azure Blob.', do: async (d) => {
        await d.wait(3000);
        await closeOverlays(d);
      } },
    ],
  },
];

export const formScenes: Scene[] = [
  card('50-forms-card', 'Forms & workflows', 'Chapter 6', 'Forms, *workflows* and enquiries', 'Visual form builder · conditional logic · rules · captcha · inbox', [
    'Forms turn visitors into enquiries. Atrium includes a visual form builder, a rules engine for notifications, spam protection, and an inbox for your team.',
  ]),
  {
    id: '51-form-builder', chapter: 'Forms & workflows', title: 'Form builder', storage: 'admin',
    setup: async (d) => d.goto(await site('/forms'), 'h1'),
    steps: [
      { say: 'Open the weddings and events enquiry form. Drag fields from the palette: text, email, phone, number, dates and times, selects, checkboxes, file uploads, ratings, consent and hidden fields.', do: async (d) => {
        await d.click(d.page.getByRole('link', { name: 'Weddings & events enquiry' }).first());
        await d.wait(2600);
      } },
      { say: 'Each field has validation, help text, placeholders, widths, and conditional visibility. For example, show the guest count only when the event type is a wedding.', do: async (d) => {
        await d.click(d.page.locator('main').getByText(/guest/i).first());
        await d.wait(2600);
      } },
      { say: 'The workflows tab is a rules engine. If the guest count is over two hundred, email the events team, send the manager an SMS, call a webhook and tag the enquiry. Otherwise, notify the general sales inbox.', do: async (d) => {
        await d.click(tab(d, /Workflows|Rules/));
        await d.wait(3200);
      } },
      { say: 'Settings control the success message, redirects, honeypot, rate limits and captcha. Atrium supports Google reCAPTCHA version two and three with a minimum score, Cloudflare Turnstile and hCaptcha.', do: async (d) => {
        await d.click(tab(d, 'Settings'));
        await d.wait(3000);
      } },
    ],
  },
  {
    id: '52-form-submit', chapter: 'Forms & workflows', title: 'A real enquiry', storage: 'none',
    setup: async (d) => {
      await d.goto(`http://aranya.sites.localhost:3001/contact`, 'form');
      await d.page.getByRole('button', { name: /essential only|accept all/i }).first().click({ timeout: 4000 }).catch(() => undefined);
      await d.page.locator('form').first().scrollIntoViewIfNeeded();
    },
    steps: [
      { say: 'Here is the public contact page. Let us send an enquiry as a guest would. Validation runs instantly in the browser, and again on the server.', do: async (d) => {
        const form = d.page.locator('form').first();
        const fill = async (re: RegExp, value: string) => {
          const f = form.getByLabel(re).first();
          if (await f.count()) await d.type(f, value, { delay: 22 });
        };
        await fill(/name/i, 'Maya Thapa');
        await fill(/email/i, 'maya.thapa@example.com');
        await fill(/phone/i, '+977 980 000 0000');
        await fill(/message|enquiry|tell us|how can/i, 'We would love to stay four nights in late March, ideally a lake view suite. Is airport pickup available?');
      } },
      { say: 'On submit, the API checks the honeypot, captcha, rate limit and a spam score, stores the enquiry, and hands the rules to the background worker.', do: async (d) => {
        const form = d.page.locator('form').first();
        const consent = form.getByRole('checkbox').first();
        if (await consent.count()) await d.click(consent);
        await d.click(form.getByRole('button', { name: /send|submit|enquire/i }).first());
        await d.wait(2500);
      } },
    ],
  },
  {
    id: '53-inbox', chapter: 'Forms & workflows', title: 'Submissions inbox', storage: 'admin',
    setup: async (d) => d.goto(await site('/submissions'), 'h1'),
    steps: [
      { say: 'The enquiry is already in the inbox. Filter by form, status, tag, assignee or date, and work through enquiries with bulk actions.', do: async (d) => {
        await d.wait(1200);
        await d.click(d.page.locator('main table tbody tr').first());
        await d.wait(2200);
      } },
      { say: 'Each enquiry moves through statuses: new, contacted, qualified, converted, rejected or spam. Assign it to a teammate, add internal notes, and see exactly which workflow actions ran. Export everything to CSV or Excel.', do: async (d) => {
        await d.wait(3200);
        await closeOverlays(d);
      } },
    ],
  },
  {
    id: '54-mailpit', chapter: 'Forms & workflows', title: 'Email notification', storage: 'none',
    setup: async (d) => d.goto(MAILPIT, 'body'),
    steps: [
      { say: 'And here is the notification email the worker sent, caught by Mailpit in development. In production the same workflow sends through your SMTP server, Amazon SES, SendGrid, Mailgun, Postmark or Resend.', do: async (d) => {
        await d.wait(800);
        await d.click(d.page.getByText(/enquiry|Maya/i).first());
        await d.wait(2800);
      } },
    ],
  },
];

export const opsScenes: Scene[] = [
  card('60-ops-card', 'Integrations & publishing', 'Chapter 7', 'Integrations, *domains* and deployment', 'Bring your own providers · connect domains · deploy anywhere', [
    'Every external service in Atrium sits behind a provider interface, so nothing is locked in. Credentials are encrypted at rest and never shown again after saving.',
  ]),
  {
    id: '61-integrations', chapter: 'Integrations & publishing', title: 'Providers', storage: 'admin',
    setup: async (d) => d.goto(await org('/integrations'), 'h1'),
    steps: [
      { say: 'Integrations are grouped by kind: email, SMS, storage, AI, deployment and captcha. Adding an email provider shows a form generated from the driver itself, with presets for Gmail, Outlook, Amazon SES, SendGrid, Mailgun and more.', do: async (d) => {
        await d.click(btn(d, 'Add email provider'));
        await d.wait(3000);
        await closeOverlays(d);
      } },
      { say: 'SMS supports Twilio, Vonage, Amazon SNS, any HTTP gateway, and local providers like Sparrow and Aakash in Nepal. AI supports Claude, OpenAI and Gemini, and deployment supports Vercel, Netlify, Cloudflare Pages and self-hosting.', do: async (d) => {
        for (const t of ['SMS', 'AI', 'Deployment']) {
          await d.click(tab(d, t));
          await d.wait(900);
        }
      } },
      { say: 'For Google reCAPTCHA, open the captcha tab, add your site key and secret key, and choose version two or three. Every form on the website can then require it.', do: async (d) => {
        await d.click(tab(d, 'Captcha'));
        await d.wait(700);
        await d.click(d.page.getByRole('button', { name: /^Add/ }).first());
        await d.wait(2600);
        await closeOverlays(d);
      } },
    ],
  },
  {
    id: '62-webhooks', chapter: 'Integrations & publishing', title: 'Webhooks', storage: 'admin',
    setup: async (d) => d.goto(await org('/webhooks'), 'h1'),
    steps: [
      { say: 'Webhooks send signed events to your own systems: form submitted, page and website published, deployment completed or failed, media uploaded, user invited. Every delivery is signed with HMAC, retried with exponential backoff, and logged with a manual retry button.', do: async (d) => {
        await d.click(btn(d, 'Add webhook'));
        await d.wait(3200);
        await closeOverlays(d);
      } },
    ],
  },
  {
    id: '63-domains', chapter: 'Integrations & publishing', title: 'Custom domains', storage: 'admin',
    setup: async (d) => d.goto(await site('/domains'), 'h1'),
    steps: [
      { say: 'Every site gets a platform address immediately. To connect your own domain, add it here, and Atrium shows exactly which DNS records to create, for the root domain or any subdomain.', do: async (d) => {
        await d.click(btn(d, 'Add domain'));
        await d.wait(600);
        await d.page.keyboard.type('booking.aranya.example', { delay: 45 });
        await d.page.keyboard.press('Enter');
        await d.wait(2600);
      } },
      { say: 'Verify checks ownership and routing. Certificates are issued automatically by the edge, and you can choose a primary domain and redirect the others to it.', do: async (d) => d.wait(3000) },
    ],
  },
  {
    id: '64-deployments', chapter: 'Integrations & publishing', title: 'Deployments', storage: 'admin',
    setup: async (d) => d.goto(await site('/deployments'), 'h1'),
    steps: [
      { say: 'There are two deployment modes. Platform hosted sites are served by Atrium’s own renderer from published snapshots, and go live the moment you publish.', do: async (d) => {
        await d.highlight(d.page.getByRole('radio', { name: /Platform hosted/ }));
        await d.wait(2600);
      } },
      { say: 'Independent mode deploys each website to its own Vercel project. The exporter turns the snapshot into a standalone Next.js project, Vercel builds it, and Atrium tracks the status and logs, attaches domains, and can redeploy or roll back with one click.', do: async (d) => {
        await d.highlight(d.page.getByRole('radio', { name: /Independent/ }));
        await d.wait(3200);
        await d.highlight(null);
      } },
    ],
  },
  {
    id: '65-versions', chapter: 'Integrations & publishing', title: 'Versions & previews', storage: 'admin',
    setup: async (d) => d.goto(await site('/versions'), 'h1'),
    steps: [
      { say: 'Every publish is kept as a version. Compare any version with the draft or another version, restore it into the draft, or roll production back to it.', do: async (d) => {
        await d.highlight(d.page.getByRole('heading', { name: 'Compare' }).locator('..').locator('..'), 'Compare versions');
        await d.wait(2800);
        await d.highlight(null);
      } },
      { say: 'Preview links share unpublished work with clients. They expire, can be password protected, and are never indexed by search engines.', do: async (d) => {
        await d.click(btn(d, 'Create link'));
        await d.wait(1200);
        const confirm = d.page.getByRole('dialog').getByRole('button', { name: /Create/ }).first();
        if (await confirm.count()) await d.click(confirm);
        await d.wait(2200);
      } },
    ],
  },
];

export const insightScenes: Scene[] = [
  card('70-team-card', 'Team & insights', 'Chapter 8', 'Analytics, *teams* and governance', 'Privacy-first analytics · role-based access · audit trail · super admin', [
    'Next, analytics, your team, and the controls that keep a multi-tenant platform safe.',
  ]),
  {
    id: '71-analytics', chapter: 'Team & insights', title: 'Analytics', storage: 'admin',
    setup: async (d) => d.goto(await site('/analytics'), 'h1'),
    steps: [
      { say: 'Built-in analytics are cookie-free and privacy friendly: visitors are counted with daily rotating hashes, never raw IP addresses. You see traffic, top pages, referrers, countries, devices and form conversions.', do: async (d) => {
        await d.wait(1500);
        await d.scroll(500);
        await d.wait(1600);
      } },
      { say: 'Google Analytics, Tag Manager and Meta Pixel can be added in settings, and they only load after the visitor consents in the cookie banner.', do: async (d) => d.wait(2600) },
    ],
  },
  {
    id: '72-team', chapter: 'Team & insights', title: 'Team & roles', storage: 'admin',
    setup: async (d) => d.goto(await org('/team'), 'h1'),
    steps: [
      { say: 'Invite teammates by email and choose a role. Access can also be limited to specific websites, so an agency can give a client access to their site only.', do: async (d) => {
        await d.click(btn(d, 'Invite members'));
        await d.wait(2600);
        await closeOverlays(d);
      } },
      { say: 'Roles are built from permissions, never from role names. Atrium ships ten roles, from owner and designer to SEO manager and submission manager, and you can create your own.', do: async (d) => {
        await nav(d, 'Roles');
        await d.wait(1500);
        await d.click(btn(d, 'SEO Manager'));
        await d.wait(2800);
      } },
      { say: 'Every permission is enforced on the server, and every resource is checked against your organization in the database. Websites from another tenant simply do not exist for you.', do: async (d) => d.wait(2800) },
    ],
  },
  {
    id: '73-audit', chapter: 'Team & insights', title: 'Audit log', storage: 'admin',
    setup: async (d) => d.goto(await org('/audit'), 'h1'),
    steps: [
      { say: 'The audit log records who did what and when: edits, publishes, AI changes, provider changes, invitations and deployments, including changes made by AI agents.', do: async (d) => d.wait(3200) },
      { say: 'Usage and billing shows plan limits for websites, members, storage, AI requests and tokens, submissions and custom domains, ready for subscription billing.', do: async (d) => {
        await nav(d, 'Usage & billing');
        await d.wait(2600);
      } },
    ],
  },
  {
    id: '74-superadmin', chapter: 'Team & insights', title: 'Super admin', storage: 'admin',
    setup: async (d) => d.goto(`${ADMIN}/admin`, 'h1'),
    steps: [
      { say: 'Platform operators get a separate super admin area: organizations and plans, users, websites, background job health with retries, feature flags, AI consumption, audit logs and abuse reports.', do: async (d) => {
        await d.wait(1800);
        await d.scroll(400);
        await d.wait(1500);
      } },
    ],
  },
];

export const publicScenes: Scene[] = [
  card('80-public-card', 'The public website', 'Chapter 9', 'What *visitors* see', 'Server-rendered, fast, accessible and responsive', [
    'Now the most important view: the public website itself.',
  ]),
  {
    id: '81-public-desktop', chapter: 'The public website', title: 'Desktop', storage: 'none',
    setup: async (d) => {
      await d.goto('http://aranya.sites.localhost:3001/', 'h1');
      await d.page.getByRole('button', { name: /essential only/i }).first().click({ timeout: 4000 }).catch(() => undefined);
    },
    steps: [
      { say: 'Pages are server rendered from the published snapshot, with full HTML for search engines, structured data, and fast navigation. Only small interactive islands ship JavaScript.', do: async (d) => d.wait(3000) },
      { say: 'Animations come from the theme’s motion settings: editorial reveals, word reveals, image masks and parallax, used with restraint.', do: async (d) => {
        await d.scroll(950, 1600);
        await d.wait(1400);
        await d.scroll(950, 1600);
        await d.wait(1200);
      } },
      { say: 'The rooms grid is bound to the CMS collection, and each room has its own detail page with photos, facts, amenities and a booking call to action.', do: async (d) => {
        await d.goto('http://aranya.sites.localhost:3001/rooms', 'h1');
        await d.wait(1600);
        await d.scroll(700, 1400);
        await d.wait(1200);
      } },
    ],
  },
  {
    id: '82-public-mobile', chapter: 'The public website', title: 'Mobile', storage: 'none',
    setup: async (d) => d.goto(asset('phone.html', { src: 'http://rosewood.sites.localhost:3001/', title: 'Rosewood Courtyard', subtitle: 'The same components adapt to every screen: the navigation becomes an accessible menu, grids stack, and type scales fluidly.' }), 'iframe'),
    steps: [
      { say: 'On a phone, the same site adapts automatically. This is the Rosewood wedding venue demo, with its own theme, fonts and animation style.', do: async (d) => {
        await d.wait(2500);
        await d.page.frameLocator('#f').locator('html').evaluate((el) => el.ownerDocument.defaultView!.scrollTo({ top: 1400, behavior: 'smooth' })).catch(() => undefined);
        await d.wait(2600);
      } },
      { say: 'And the Northwind consulting demo shows the same engine in a completely different, corporate style.', do: async (d) => {
        await d.page.locator('#f').evaluate((el) => ((el as HTMLIFrameElement).src = 'http://northwind.sites.localhost:3001/'));
        await d.page.locator('#t').evaluate((el) => (el.textContent = 'Northwind Partners'));
        await d.wait(4000);
      } },
    ],
  },
];
