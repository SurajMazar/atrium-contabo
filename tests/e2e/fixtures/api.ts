import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { apiV1, TEST_PASSWORD, uniqueEmail, uniqueSlug } from './env';

export interface TestUser {
  email: string;
  password: string;
  name: string;
  accessToken: string;
  organizationId: string;
  organizationSlug: string;
}

export interface TestSite {
  id: string;
  slug: string;
  name: string;
  homepageId: string;
}

async function json<T>(res: APIResponse, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what} failed: HTTP ${res.status()} ${await res.text()}`);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/**
 * Thin typed client for test setup. The UI is exercised for the behaviour under test;
 * everything else (users, sites, forms, publishing) is arranged through the REST API.
 */
export class Api {
  constructor(
    private readonly request: APIRequestContext,
    private token?: string,
  ) {}

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  withToken(token: string) {
    return new Api(this.request, token);
  }

  async get<T>(route: string, params?: Record<string, string>) {
    return json<T>(
      await this.request.get(apiV1(route), { headers: this.headers(), params }),
      `GET ${route}`,
    );
  }
  async post<T>(route: string, data?: unknown) {
    return json<T>(
      await this.request.post(apiV1(route), { headers: this.headers(), data }),
      `POST ${route}`,
    );
  }
  async patch<T>(route: string, data?: unknown) {
    return json<T>(
      await this.request.patch(apiV1(route), { headers: this.headers(), data }),
      `PATCH ${route}`,
    );
  }
  async delete(route: string) {
    return json<void>(
      await this.request.delete(apiV1(route), { headers: this.headers() }),
      `DELETE ${route}`,
    );
  }

  /** Register a fresh user + organization (POST /auth/register). */
  async register(tag = 'e2e'): Promise<TestUser> {
    const email = uniqueEmail(tag);
    const name = `E2E ${tag}`;
    const res = await this.post<{ accessToken: string }>('/auth/register', {
      name,
      email,
      password: TEST_PASSWORD,
      organizationName: `E2E Org ${uniqueSlug('o', 12)}`,
    });
    const me = await this.withToken(res.accessToken).me();
    const org = me.memberships[0]?.organization;
    expect(org, 'registration should create an organization').toBeTruthy();
    return {
      email,
      password: TEST_PASSWORD,
      name,
      accessToken: res.accessToken,
      organizationId: org!.id,
      organizationSlug: org!.slug,
    };
  }

  me() {
    return this.get<{
      user: { id: string; email: string };
      memberships: Array<{ organization: { id: string; slug: string; name: string } }>;
    }>('/auth/me');
  }

  /** First SITE template key, or undefined when the platform has none. */
  async firstSiteTemplate(): Promise<{ key: string; name: string } | undefined> {
    const res = await this.get<unknown>('/templates', { kind: 'SITE' });
    const items = (
      Array.isArray(res) ? res : ((res as { items?: unknown[] }).items ?? [])
    ) as Array<{ key?: string; id: string; name: string }>;
    const t = items.find((x) => x.key) ?? items[0];
    return t ? { key: t.key ?? t.id, name: t.name } : undefined;
  }

  /** Create a website (from a template when available) and return its homepage id. */
  async createSite(
    user: TestUser,
    opts: { template?: boolean; name?: string } = {},
  ): Promise<TestSite> {
    const slug = uniqueSlug('site', 30);
    const template = opts.template === false ? undefined : await this.firstSiteTemplate();
    const site = await this.post<{ id: string; slug: string; name: string }>(
      `/organizations/${user.organizationId}/websites`,
      {
        name: opts.name ?? `E2E ${slug}`,
        slug,
        source: template ? { type: 'template', templateKey: template.key } : { type: 'blank' },
      },
    );
    const draft = await this.draft(site.id);
    const home = draft.definition.pages.find((p) => p.isHomepage) ?? draft.definition.pages[0];
    expect(home, 'new websites have a homepage').toBeTruthy();
    return { id: site.id, slug: site.slug, name: site.name, homepageId: home!.id };
  }

  draft(websiteId: string) {
    return this.get<{
      definition: {
        pages: Array<{
          id: string;
          slug: string;
          title: string;
          isHomepage?: boolean;
          sections: Array<{ id: string; type: string; props: Record<string, unknown> }>;
        }>;
      };
    }>(`/websites/${websiteId}/draft`);
  }

  page(pageId: string) {
    return this.get<{
      id: string;
      title: string;
      slug: string;
      revision: number;
      document: unknown;
    }>(`/pages/${pageId}`);
  }

  /** Apply validated SiteOperations (same path the builder and AI agent use). */
  operations(websiteId: string, operations: unknown[], label = 'e2e') {
    return this.post<{ results: unknown[] }>(`/websites/${websiteId}/operations`, {
      operations,
      label,
    });
  }

  publish(websiteId: string, message = 'e2e publish') {
    return this.post<{ version: { id: string; number: number } }>(
      `/websites/${websiteId}/publish`,
      { message },
    );
  }

  createPreviewToken(
    websiteId: string,
    body: { expiresInHours?: number; password?: string; label?: string } = {},
  ) {
    return this.post<{ id: string; url: string; token: string; expiresAt: string }>(
      `/websites/${websiteId}/preview-tokens`,
      { expiresInHours: 1, label: 'e2e', ...body },
    );
  }

  revokePreviewToken(websiteId: string, tokenId: string) {
    return this.delete(`/websites/${websiteId}/preview-tokens/${tokenId}`);
  }

  /** Contact form with name/email/message (FormDefinition from @atrium/schema). */
  createContactForm(websiteId: string, name = `Contact ${uniqueSlug('f', 10)}`) {
    const slug = uniqueSlug('contact', 30);
    return this.post<{ id: string; name: string; slug: string }>(`/websites/${websiteId}/forms`, {
      name,
      slug,
      fields: [
        { id: 'f_name', type: 'text', name: 'name', label: 'Name', required: true },
        { id: 'f_email', type: 'email', name: 'email', label: 'Email', required: true },
        { id: 'f_message', type: 'textarea', name: 'message', label: 'Message', required: true },
      ],
      rules: [],
      settings: { submitLabel: 'Send', successMessage: 'Thanks — e2e received.' },
    });
  }

  submissions(websiteId: string, formId?: string) {
    return this.get<{
      items: Array<{
        id: string;
        formId: string;
        status: string;
        summary: Record<string, unknown>;
      }>;
    }>(`/websites/${websiteId}/submissions`, formId ? { formId } : undefined);
  }
}
