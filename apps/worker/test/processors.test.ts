import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { encryptJson, encryptSecret, verifyWebhookSignature } from '@atrium/server-kit';
import { UnrecoverableError } from 'bullmq';
import { processEmailSend } from '../src/processors/email';
import { processWebhookDeliver, processWebhookDispatch, readWebhookSecret } from '../src/processors/webhooks';
import { toHex, variantKey, variantWidths } from '../src/processors/media';
import { dayRange, referrerSource } from '../src/processors/analytics';
import { processAiGenerateSite, setAgentLoader } from '../src/processors/ai';
import { processDeploymentRun, projectNameFor, toDbStatus } from '../src/processors/deployments';
import { routeJob } from '../src/router';
import { assertPublicUrl, isPublicIp } from '@atrium/providers';
import { job, makeCtx } from './helpers';
import { ProviderError } from '@atrium/providers';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('webhook.deliver', () => {
  function setup(response: Response | Error, over: Record<string, unknown> = {}) {
    const secretEnc = encryptJson('whsec_test');
    const delivery = {
      id: 'del_1',
      event: 'form.submitted',
      attempts: 0,
      status: 'PENDING',
      createdAt: new Date('2026-10-05T11:00:00Z'),
      payload: { id: 'del_1', event: 'form.submitted', data: { a: 1 } },
      webhook: { id: 'wh_1', url: 'https://hooks.example/atrium', enabled: true, secretEnc },
      ...over,
    };
    const update = vi.fn(async () => ({}));
    const fetchMock = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    const { ctx } = makeCtx({ prisma: { webhookDelivery: { findUnique: vi.fn(async () => delivery), update } }, fetch: fetchMock as unknown as typeof fetch });
    return { ctx, update, fetchMock };
  }

  it('signs the request with X-Atrium headers and records success', async () => {
    const { ctx, update, fetchMock } = setup(new Response('ok', { status: 200 }));
    const res = await processWebhookDeliver(ctx, { deliveryId: 'del_1' }, job());
    expect(res).toMatchObject({ status: 200 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://hooks.example/atrium');
    const h = init.headers;
    expect(h['X-Atrium-Event']).toBe('form.submitted');
    expect(h['X-Atrium-Delivery']).toBe('del_1');
    expect(h['X-Atrium-Timestamp']).toBe(String(Math.floor(new Date('2026-10-05T12:00:00Z').getTime() / 1000)));
    expect(h['X-Atrium-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature('whsec_test', h['X-Atrium-Timestamp']!, init.body as string, h['X-Atrium-Signature']!, 300, new Date('2026-10-05T12:00:00Z').getTime())).toBe(true);
    expect(init.signal).toBeDefined();
    expect(update).toHaveBeenCalledWith({ where: { id: 'del_1' }, data: expect.objectContaining({ status: 'SUCCESS', attempts: 1, responseStatus: 200, responseBody: 'ok' }) });
  });

  it('marks RETRYING with backoff on 5xx, FAILED on the final attempt', async () => {
    const a = setup(new Response('boom', { status: 503 }));
    await expect(processWebhookDeliver(a.ctx, { deliveryId: 'del_1' }, job({ attemptsMade: 0, attempts: 8 }))).rejects.toThrow('HTTP 503');
    expect(a.update).toHaveBeenCalledWith({ where: { id: 'del_1' }, data: expect.objectContaining({ status: 'RETRYING', attempts: 1, responseStatus: 503, nextAttemptAt: new Date('2026-10-05T12:00:30Z') }) });
    const b = setup(new Response('boom', { status: 500 }), { attempts: 7 });
    await expect(processWebhookDeliver(b.ctx, { deliveryId: 'del_1' }, job({ attemptsMade: 7, attempts: 8 }))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(b.update).toHaveBeenCalledWith({ where: { id: 'del_1' }, data: expect.objectContaining({ status: 'FAILED', attempts: 8, nextAttemptAt: null }) });
  });

  it('timeouts and 410 Gone', async () => {
    const t = setup(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
    await expect(processWebhookDeliver(t.ctx, { deliveryId: 'del_1' }, job())).rejects.toThrow(/Timed out after 10s/);
    const g = setup(new Response('', { status: 410 }));
    await expect(processWebhookDeliver(g.ctx, { deliveryId: 'del_1' }, job())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('reads secrets stored either as encryptJson or encryptSecret', () => {
    expect(readWebhookSecret(encryptJson('a'))).toBe('a');
    expect(readWebhookSecret(encryptSecret('plain-b'))).toBe('plain-b');
    expect(readWebhookSecret(encryptJson({ secret: 'c' }))).toBe('c');
  });
});

describe('webhook.dispatch', () => {
  it('creates one delivery per subscribed webhook and enqueues delivery jobs', async () => {
    const findMany = vi.fn(async () => [{ id: 'wh_1' }, { id: 'wh_2' }]);
    let n = 0;
    const create = vi.fn(async () => ({ id: `del_${++n}`, createdAt: new Date('2026-10-05T12:00:00Z') }));
    const update = vi.fn(async () => ({}));
    const { ctx, enqueued } = makeCtx({ prisma: { webhook: { findMany }, webhookDelivery: { create, update } } });
    const res = await processWebhookDispatch(ctx, { organizationId: 'org1', websiteId: 'w1', event: 'form.submitted', payload: { x: 1 } });
    expect(res.deliveries).toEqual(['del_1', 'del_2']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org1', enabled: true, events: { hasSome: ['form.submitted', '*', 'form.*'] }, OR: [{ websiteId: null }, { websiteId: 'w1' }] }) }));
    expect(update).toHaveBeenCalledWith({ where: { id: 'del_1' }, data: { payload: { id: 'del_1', event: 'form.submitted', createdAt: '2026-10-05T12:00:00.000Z', organizationId: 'org1', websiteId: 'w1', data: { x: 1 } } } });
    expect(enqueued).toEqual([
      { name: 'webhook.deliver', data: { deliveryId: 'del_1' }, opts: { jobId: 'whd-del_1' } },
      { name: 'webhook.deliver', data: { deliveryId: 'del_2' }, opts: { jobId: 'whd-del_2' } },
    ]);
  });
});

describe('email.send', () => {
  function setup(sendImpl: () => Promise<unknown>) {
    const send = vi.fn(sendImpl);
    const resolved = { send, driver: 'smtp', source: 'platform', from: { email: 'no-reply@atrium.localhost', name: 'Atrium' } };
    const email = vi.fn(async () => resolved);
    const sub = {
      id: 'sub_1', createdAt: new Date('2026-10-05T10:00:00Z'), status: 'NEW', pageUrl: null, referrer: null, locale: null, tags: [],
      values: [{ fieldName: 'name', fieldLabel: 'Name', fieldType: 'text', value: 'Ram & Sita', valueJson: null }],
      form: { id: 'f', name: 'Contact', slug: 'contact' },
      website: { id: 'w', name: 'Aranya', slug: 'aranya', organizationId: 'org1', domains: [] },
    };
    const { ctx } = makeCtx({ resolver: { email }, prisma: { formSubmission: { findUnique: vi.fn(async () => sub) } } });
    return { ctx, send, email };
  }

  it('renders templates with the submission scope, uses the resolved sender and logs the result', async () => {
    const { ctx, send, email } = setup(async () => ({ id: 'm1', accepted: ['ops@x.com'], rejected: [], provider: 'smtp' }));
    await processEmailSend(ctx, { organizationId: 'org1', message: { to: [{ email: 'ops@x.com' }], subject: 'New from {{name}}', html: '<p>{{name}} via {{website.name}}</p>' }, context: { submissionId: 'sub_1', ruleId: 'r1' } }, job());
    expect(email).toHaveBeenCalledWith({ organizationId: 'org1', websiteId: undefined, providerId: undefined });
    const msg = (send.mock.calls[0] as unknown[])[0] as { from: unknown; subject: string; html: string; text: string };
    expect(msg.from).toEqual({ email: 'no-reply@atrium.localhost', name: 'Atrium' });
    expect(msg.subject).toBe('New from Ram & Sita');
    expect(msg.html).toBe('<p>Ram &amp; Sita via Aranya</p>');
    expect(msg.text).toBe('Ram & Sita via Aranya');
    const logged = JSON.parse((ctx.prisma.$executeRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1] as string);
    expect(logged[0]).toMatchObject({ type: 'email', status: 'sent', ruleId: 'r1', messageId: 'm1', target: 'ops@x.com' });
  });

  it('platform email (no organization) and non-retryable failures become permanent + logged', async () => {
    const { ctx, email } = setup(async () => {
      throw new ProviderError('smtp: bad auth', 'smtp', false);
    });
    await expect(processEmailSend(ctx, { organizationId: null, message: { to: [{ email: 'u@x.com' }], subject: 'Reset', text: 'link' }, context: { submissionId: 'sub_1', kind: 'password-reset' } }, job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(email).toHaveBeenCalledWith({ organizationId: null, websiteId: undefined, providerId: undefined });
    const logged = JSON.parse((ctx.prisma.$executeRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1] as string);
    expect(logged[0]).toMatchObject({ status: 'failed', error: 'smtp: bad auth' });
  });

  it('retryable failures are rethrown for BullMQ backoff (not logged until the last attempt)', async () => {
    const { ctx } = setup(async () => {
      throw new ProviderError('smtp: timeout', 'smtp', true);
    });
    const err = await processEmailSend(ctx, { message: { to: [{ email: 'u@x.com' }], subject: 'x', text: 'y' }, context: { submissionId: 'sub_1' } }, job({ attemptsMade: 0, attempts: 5 })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(ctx.prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('media helpers', () => {
  it('chooses widths ≤ original and builds variant keys', () => {
    expect(variantWidths(4000)).toEqual([320, 640, 960, 1280, 1920, 2560]);
    expect(variantWidths(1000)).toEqual([320, 640, 960]);
    expect(variantWidths(200)).toEqual([200]);
    expect(variantKey('media/org/2026/10/abc-photo.jpg', 640, 'webp')).toBe('media/org/2026/10/abc-photo/w640.webp');
    expect(variantKey('media/org/noext', 320, 'avif')).toBe('media/org/noext/w320.avif');
    expect(toHex({ r: 255, g: 0, b: 16.4 })).toBe('#ff0010');
  });
});

describe('analytics + deployments + net helpers', () => {
  it('helpers', () => {
    expect(dayRange('2026-10-05')).toEqual({ start: new Date('2026-10-05T00:00:00Z'), end: new Date('2026-10-06T00:00:00Z') });
    expect(referrerSource('https://www.google.com/search?q=x')).toBe('google.com');
    expect(referrerSource(null)).toBe('(direct)');
    expect(toDbStatus('building')).toBe('BUILDING');
    expect(projectNameFor('My_Site')).toBe('atrium-my-site');
    expect(isPublicIp('10.1.2.3')).toBe(false);
    expect(isPublicIp('172.20.0.1')).toBe(false);
    expect(isPublicIp('::1')).toBe(false);
    expect(isPublicIp('::ffff:7f00:1')).toBe(false);
    expect(isPublicIp('8.8.8.8')).toBe(true);
  });

  it('SSRF guard blocks private targets unless allowed', async () => {
    await expect(assertPublicUrl('http://127.0.0.1:8080/x', { allowPrivate: false })).rejects.toThrow(/loopback/);
    await expect(assertPublicUrl('http://localhost/x', { allowPrivate: false })).rejects.toThrow(/local/);
    await expect(assertPublicUrl('ftp://example.com', { allowPrivate: true })).rejects.toThrow(/scheme/);
    await expect(assertPublicUrl('https://user:pw@example.com', { allowPrivate: true })).rejects.toThrow(/credentials/);
    await expect(assertPublicUrl('http://127.0.0.1:8080/x', { allowPrivate: true })).resolves.toBeInstanceOf(URL);
  });

  it('platform-mode deployment marks the version live and emits deployment.completed', async () => {
    const deployment = {
      id: 'dep_1', status: 'QUEUED', target: 'PRODUCTION', provider: 'self-hosted', versionId: 'v1', externalId: null, url: null, inspectorUrl: null, logs: [], meta: {},
      version: { id: 'v1', number: 4, snapshot: {} },
      website: { id: 'w1', organizationId: 'org1', slug: 'aranya', name: 'Aranya', deploymentMode: 'PLATFORM', deploymentProvider: null, deploymentIntegrationId: null, externalProject: null, publishedVersionId: null },
    };
    const deploy = vi.fn(async () => ({ id: 'self-aranya-1', status: 'ready', target: 'production', url: 'http://aranya.sites.localhost:3001' }));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const websiteUpdate = vi.fn(async () => ({}));
    const audit = vi.fn(async () => ({}));
    const { ctx, enqueued } = makeCtx({
      prisma: { deployment: { findUnique: vi.fn(async () => deployment), update: vi.fn(async () => ({})), updateMany }, website: { update: websiteUpdate }, domain: { findMany: vi.fn(async () => []) }, auditLog: { create: audit } },
      resolver: { platformDeployment: () => ({ deploy, driver: 'self-hosted', addDomain: vi.fn() }) },
    });
    const res = await processDeploymentRun(ctx, { deploymentId: 'dep_1' }, job());
    expect(res).toMatchObject({ status: 'READY' });
    expect(deploy).toHaveBeenCalledWith(expect.objectContaining({ projectName: 'aranya', target: 'production', files: [] }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY', externalId: 'self-aranya-1', url: 'http://aranya.sites.localhost:3001' }) }));
    expect(websiteUpdate).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { publishedVersionId: 'v1', status: 'PUBLISHED' } });
    expect(enqueued.map((e) => [e.name, (e.data as { event?: string }).event])).toEqual([['webhook.dispatch', 'deployment.completed']]);
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'deployment.completed', actorType: 'SYSTEM', resourceId: 'dep_1' }) });
  });
});

describe('ai.generate-site', () => {
  it('delegates to runSiteGeneration and forwards progress', async () => {
    const run = vi.fn(async (opts: { onProgress?: (p: unknown) => void }) => {
      opts.onProgress?.([{ step: 'plan', status: 'done' }]);
      return { ok: true };
    });
    setAgentLoader(async () => ({ runSiteGeneration: run as never }));
    const { ctx } = makeCtx({ prisma: { aiGeneration: { updateMany: vi.fn() } } });
    const j = job();
    await expect(processAiGenerateSite(ctx, { generationId: 'gen_1' }, j)).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ generationId: 'gen_1', prisma: ctx.prisma, resolver: ctx.resolver }));
    expect(j.updateProgress).toHaveBeenCalled();
  });

  it('marks the generation failed when the agent is unavailable', async () => {
    setAgentLoader(async () => ({}));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { ctx } = makeCtx({ prisma: { aiGeneration: { updateMany } } });
    await expect(processAiGenerateSite(ctx, { generationId: 'gen_1' }, job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'gen_1', status: { in: ['PENDING', 'RUNNING'] } }, data: expect.objectContaining({ status: 'FAILED' }) }));
  });
});

describe('router', () => {
  it('rejects unknown jobs and invalid payloads permanently', async () => {
    const { ctx } = makeCtx();
    await expect(routeJob(ctx, 'nope', {}, job())).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(routeJob(ctx, 'media.process', { wrong: 1 }, job())).rejects.toThrow(/Invalid payload for media.process/);
  });
});
