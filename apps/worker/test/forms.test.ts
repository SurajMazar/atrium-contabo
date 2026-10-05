import { describe, expect, it, vi } from 'vitest';
import { processFormSubmission, rulesFromRows } from '../src/processors/forms';
import { buildSubmissionScope, defaultSubmissionHtml, renderHtml, renderRecipients, renderText, ruleData } from '../src/lib/templates';
import { job, makeCtx } from './helpers';

const values = [
  { fieldName: 'name', fieldLabel: 'Your name', fieldType: 'text', value: 'Asha <b>Rai</b>', valueJson: null },
  { fieldName: 'email', fieldLabel: 'Email', fieldType: 'email', value: 'asha@example.com', valueJson: null },
  { fieldName: 'guestCount', fieldLabel: 'Guests', fieldType: 'number', value: '250', valueJson: null },
  { fieldName: 'country', fieldLabel: 'Country', fieldType: 'select', value: 'NP', valueJson: null },
  { fieldName: 'phone', fieldLabel: 'Phone', fieldType: 'phone', value: '9812345678', valueJson: null },
  { fieldName: 'services', fieldLabel: 'Services', fieldType: 'multiselect', value: null, valueJson: ['catering', 'decor'] },
  { fieldName: 'docs', fieldLabel: 'Documents', fieldType: 'file', value: null, valueJson: [{ key: 'private/submissions/w1/2026-10-05/abc-plan.pdf', filename: 'plan.pdf', size: 20480, mimeType: 'application/pdf' }] },
];

const ruleRows = [
  {
    ruleId: 'big-wedding',
    name: 'Large weddings go to events team',
    enabled: true,
    position: 0,
    when: { match: 'all', conditions: [{ field: 'guestCount', op: 'gt', value: 200 }] },
    then: [
      { type: 'email', to: ['events@venue.com'], subject: 'Big wedding: {{name}} ({{guestCount}} guests)' },
      { type: 'tag', tags: ['vip', 'wedding'] },
      { type: 'status', status: 'qualified' },
    ],
    otherwise: [{ type: 'email', to: ['hello@venue.com'], subject: 'Enquiry from {{name}}' }],
    stopProcessing: false,
  },
  {
    ruleId: 'nepal-routing',
    name: 'Nepal vs international',
    enabled: true,
    position: 1,
    when: { match: 'all', conditions: [{ field: 'country', op: 'eq', value: 'NP' }] },
    then: [
      { type: 'sms', to: ['+9779800000000', '{{phone}}'], body: 'Namaste {{name}}, we got your request for {{guestCount}} guests.' },
      { type: 'autoresponder', subject: 'Thanks {{name}}', html: '<p>Hi {{name}}, thanks for contacting {{website.name}}.</p>', emailField: 'email' },
    ],
    otherwise: [{ type: 'email', to: ['intl@venue.com'], subject: 'International enquiry' }],
    stopProcessing: false,
  },
  { ruleId: 'disabled', name: 'Off', enabled: false, position: 2, when: null, then: [{ type: 'tag', tags: ['never'] }], otherwise: [], stopProcessing: false },
  { ruleId: 'broken', name: 'Broken', enabled: true, position: 3, when: null, then: [{ type: 'nope' }], otherwise: [], stopProcessing: false },
  { ruleId: 'hook', name: 'CRM', enabled: true, position: 4, when: null, then: [{ type: 'webhook', webhookId: 'wh_crm' }], otherwise: [], stopProcessing: false },
];

function submission(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'NEW',
    tags: ['web'],
    createdAt: new Date('2026-10-05T10:00:00Z'),
    pageUrl: 'https://aranya.example/weddings',
    referrer: null,
    locale: 'en',
    actionsLog: [],
    values,
    form: { id: 'form_1', name: 'Wedding enquiry', slug: 'wedding', settings: { storeSubmissions: true }, rules: ruleRows },
    website: { id: 'w1', name: 'Aranya', slug: 'aranya', organizationId: 'org1', domains: [{ hostname: 'aranya.example' }] },
    ...over,
  };
}

function setup(sub = submission()) {
  const update = vi.fn(async () => ({}));
  const del = vi.fn(async () => ({}));
  const storage = { getSignedUrl: vi.fn(async (key: string) => `https://signed.example/${key}?sig=1`) };
  const { ctx, enqueued } = makeCtx({
    prisma: { formSubmission: { findUnique: vi.fn(async () => sub), update, delete: del } },
    resolver: { storage: vi.fn(async () => storage) },
  });
  return { ctx, enqueued, update, del, storage };
}

describe('templates', () => {
  const scope = buildSubmissionScope({
    submission: { id: 'sub_1', createdAt: new Date('2026-10-05T10:00:00Z'), status: 'NEW', pageUrl: null, referrer: null, locale: null, tags: [] },
    form: { id: 'f', name: 'Contact', slug: 'contact' },
    website: { id: 'w', name: 'Aranya', slug: 'aranya', url: 'https://aranya.example' },
    values,
  });

  it('interpolates field values, submission/website/form variables and escapes HTML', () => {
    expect(renderText('{{name}} · {{guestCount}} · {{services}} · {{submission.id}} · {{website.name}} · {{form.name}} · {{missing | n/a}}', scope)).toBe('Asha <b>Rai</b> · 250 · catering, decor · sub_1 · Aranya · Contact · n/a');
    expect(renderHtml('<p>{{name}}</p>', scope)).toBe('<p>Asha &lt;b&gt;Rai&lt;/b&gt;</p>');
    expect(ruleData(values)).toMatchObject({ guestCount: 250, services: ['catering', 'decor'] });
  });

  it('default template lists all fields and files', () => {
    const html = defaultSubmissionHtml(scope, { adminUrl: 'http://admin/x' });
    expect(html).toContain('New Contact submission');
    expect(html).toContain('Your name');
    expect(html).toContain('Asha &lt;b&gt;Rai&lt;/b&gt;');
    expect(html).toContain('catering, decor');
    expect(html).toContain('1 file attached');
    expect(html).toContain('plan.pdf');
    expect(html).not.toContain('<b>Rai</b>');
  });

  it('renders recipient templates and drops invalid addresses', () => {
    expect(renderRecipients(['{{email}}', 'Team <TEAM@venue.com>, bad-address', 'team@venue.com'], scope)).toEqual([{ email: 'asha@example.com' }, { email: 'team@venue.com', name: 'Team' }]);
  });
});

describe('rulesFromRows', () => {
  it('orders by position and reports invalid rules', () => {
    const { rules, invalid } = rulesFromRows(ruleRows, undefined);
    expect(rules.map((r) => r.id)).toEqual(['big-wedding', 'nepal-routing', 'disabled', 'hook']);
    expect(invalid.map((i) => i.ruleId)).toEqual(['broken']);
  });
});

describe('form.process', () => {
  it('executes the planned actions (wedding guestCount>200 + Nepal routing)', async () => {
    const { ctx, enqueued, update } = setup();
    const res = await processFormSubmission(ctx, { submissionId: 'sub_1' }, job());
    expect(res).toMatchObject({ planned: 3, failed: 0, deleted: false });

    const names = enqueued.map((e) => e.name);
    expect(names).toEqual(['email.send', 'sms.send', 'sms.send', 'email.send', 'webhook.dispatch', 'webhook.dispatch']);

    const notify = enqueued[0]!.data as { message: { to: unknown; subject: string; html: string }; context: Record<string, unknown> };
    expect(notify.message.to).toEqual([{ email: 'events@venue.com' }]);
    expect(notify.message.subject).toBe('Big wedding: Asha <b>Rai</b> (250 guests)');
    expect(notify.message.html).toContain('1 file attached');
    expect(notify.message.html).toContain('https://signed.example/private/submissions/w1/2026-10-05/abc-plan.pdf');
    expect(notify.context).toMatchObject({ submissionId: 'sub_1', ruleId: 'big-wedding', rendered: true });
    expect(enqueued[0]!.opts).toEqual({ jobId: 'fp-sub_1-big-wedding-then-0' });

    const sms = enqueued.slice(1, 3).map((e) => e.data as { to: string; body: string });
    expect(sms.map((s) => s.to)).toEqual(['+9779800000000', '9812345678']);
    expect(sms[0]!.body).toBe('Namaste Asha <b>Rai</b>, we got your request for 250 guests.');

    const auto = enqueued[3]!.data as { message: { to: unknown; html: string } };
    expect(auto.message.to).toEqual([{ email: 'asha@example.com' }]);
    expect(auto.message.html).toBe('<p>Hi Asha &lt;b&gt;Rai&lt;/b&gt;, thanks for contacting Aranya.</p>');

    expect(enqueued[4]!.data).toMatchObject({ event: 'form.submitted', webhookId: 'wh_crm' });
    expect(enqueued[5]!.data).toMatchObject({ event: 'form.submitted', organizationId: 'org1', websiteId: 'w1', payload: { submissionId: 'sub_1', data: { guestCount: '250', services: ['catering', 'decor'] } } });
    expect(enqueued[5]!.opts).toEqual({ jobId: 'fp-sub_1-event' });

    expect(update).toHaveBeenCalledWith({ where: { id: 'sub_1' }, data: { tags: ['web', 'vip', 'wedding'] } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'sub_1' }, data: { status: 'QUALIFIED' } });
    expect(ctx.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const logged = JSON.parse((ctx.prisma.$executeRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1] as string);
    expect(logged.at(-1)).toMatchObject({ type: 'rules', status: 'done' });
    expect(logged.find((e: { ruleId?: string }) => e.ruleId === 'broken')).toMatchObject({ status: 'skipped' });
  });

  it('takes the otherwise branches for small international enquiries', async () => {
    const small = submission({ values: values.map((v) => (v.fieldName === 'guestCount' ? { ...v, value: '80' } : v.fieldName === 'country' ? { ...v, value: 'IN' } : v)) });
    const { ctx, enqueued } = setup(small);
    await processFormSubmission(ctx, { submissionId: 'sub_1' }, job());
    const emails = enqueued.filter((e) => e.name === 'email.send').map((e) => (e.data as { message: { to: Array<{ email: string }> } }).message.to[0]!.email);
    expect(emails).toEqual(['hello@venue.com', 'intl@venue.com']);
    expect(enqueued.some((e) => e.name === 'sms.send')).toBe(false);
  });

  it('skips spam and already-processed submissions', async () => {
    const spam = setup(submission({ status: 'SPAM' }));
    expect(await processFormSubmission(spam.ctx, { submissionId: 'sub_1' }, job())).toMatchObject({ skipped: 'spam' });
    expect(spam.enqueued).toHaveLength(0);
    const done = setup(submission({ actionsLog: [{ type: 'rules', status: 'done' }] }));
    expect(await processFormSubmission(done.ctx, { submissionId: 'sub_1' }, job())).toMatchObject({ skipped: 'already processed' });
  });

  it('deletes the submission after actions when storeSubmissions is false', async () => {
    const s = submission();
    (s.form as { settings: unknown }).settings = { storeSubmissions: false };
    const { ctx, enqueued, del } = setup(s);
    const res = await processFormSubmission(ctx, { submissionId: 'sub_1' }, job());
    expect(res.deleted).toBe(true);
    expect(enqueued.length).toBeGreaterThan(0);
    expect(del).toHaveBeenCalledWith({ where: { id: 'sub_1' } });
  });

  it('rethrows queue failures so the job is retried', async () => {
    const { ctx } = setup();
    ctx.enqueue = vi.fn(async () => {
      throw new Error('redis down');
    }) as never;
    await expect(processFormSubmission(ctx, { submissionId: 'sub_1' }, job())).rejects.toThrow(/Could not enqueue/);
  });
});
