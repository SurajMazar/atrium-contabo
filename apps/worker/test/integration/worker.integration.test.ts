/**
 * Integration smoke: runs the real worker (in-process) against local Redis/Postgres/SeaweedFS/Mailpit.
 *   pnpm --filter @atrium/worker test:integration
 * Uses a unique queue prefix so it never competes with a running dev worker; cleans up after itself.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { enqueue, loadEnv } from '@atrium/server-kit';

const prefix = `atrium-it-${randomBytes(4).toString('hex')}`;
process.env.QUEUE_PREFIX = prefix;
process.env.WORKER_QUEUES = 'email,media';
process.env.WORKER_HEARTBEAT_MS = '600000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
loadEnv();

const MAILPIT = `http://localhost:${process.env.ATRIUM_MAILPIT_PORT ?? '58025'}/api/v1`;

async function until<T>(fn: () => Promise<T | undefined | null | false>, timeoutMs = 30_000, intervalMs = 300): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const reachable = await Promise.all([
  fetch(`${MAILPIT}/messages?limit=1`, { signal: AbortSignal.timeout(10000) }).then((r) => r.ok).catch(() => false),
  fetch(process.env.S3_ENDPOINT ?? 'http://localhost:59000', { signal: AbortSignal.timeout(10000) }).then(() => true).catch(() => false),
]).then((r) => r.every(Boolean));

describe.skipIf(!reachable)('worker integration', () => {
  let worker: Awaited<ReturnType<typeof import('../../src/main').startWorker>>;
  const cleanup: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    const { startWorker } = await import('../../src/main');
    worker = await startWorker({ handleSignals: false });
  }, 30_000);

  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch((e: unknown) => console.warn('cleanup failed', e));
    if (worker) {
      await Promise.all(worker.queues.all().map((q) => q.obliterate({ force: true }).catch(() => undefined)));
      await worker.stop();
    }
  }, 30_000);

  it('email.send delivers a platform email through Mailpit', async () => {
    const subject = `Atrium integration ${randomBytes(6).toString('hex')}`;
    await enqueue(worker.queues, 'email.send', {
      organizationId: null,
      message: { to: [{ email: 'integration@atrium.localhost', name: 'Integration' }], subject, html: '<p>Hello from the <strong>worker</strong> integration test.</p>' },
      context: { kind: 'integration-test' },
    });
    const found = await until(async () => {
      const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
      const body = (await res.json()) as { messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }>; From: { Address: string } }> };
      return body.messages.find((m) => m.Subject === subject);
    });
    expect(found.To[0]!.Address).toBe('integration@atrium.localhost');
    expect(found.From.Address).toBe('no-reply@atrium.localhost');
    const full = (await (await fetch(`${MAILPIT}/message/${found.ID}`)).json()) as { HTML: string; Text: string };
    expect(full.HTML).toContain('<strong>worker</strong>');
    expect(full.Text).toContain('Hello from the worker integration test.');
    cleanup.push(() => fetch(`${MAILPIT}/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [found.ID] }) }));
  }, 40_000);

  it('media.process generates responsive variants, blur placeholder and dominant color', async () => {
    const prisma = worker.ctx.prisma;
    const suffix = randomBytes(4).toString('hex');
    const org = await prisma.organization.create({ data: { name: `Integration ${suffix}`, slug: `it-${suffix}` } });
    cleanup.push(() => prisma.organization.delete({ where: { id: org.id } }));

    const image = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: { r: 200, g: 40, b: 40 } } })
      .composite([{ input: Buffer.from('<svg width="1500" height="1000"><rect x="0" y="0" width="300" height="1000" fill="#2040c0"/></svg>'), top: 0, left: 0 }])
      .jpeg({ quality: 85 })
      .toBuffer();
    const key = `media/${org.id}/2026/10/${suffix}-integration photo.jpg`;
    const storage = await worker.ctx.resolver.storage({ organizationId: org.id });
    await storage.upload({ key, body: image, contentType: 'image/jpeg', visibility: 'public' });
    const media = await prisma.media.create({
      data: { organizationId: org.id, key, filename: 'integration photo.jpg', mimeType: 'image/jpeg', size: image.byteLength, checksum: suffix, status: 'PROCESSING' },
    });

    await enqueue(worker.queues, 'media.process', { mediaId: media.id });
    const done = await until(async () => {
      const m = await prisma.media.findUnique({ where: { id: media.id } });
      return m && (m.status === 'READY' || m.status === 'FAILED') ? m : undefined;
    }, 60_000);
    const variants = done.variants as Array<{ width: number; height: number; format: string; key: string; url: string; size: number }>;
    cleanup.push(async () => {
      for (const k of [key, ...variants.map((v) => v.key)]) await storage.delete(k);
    });

    expect(done.status).toBe('READY');
    expect(done.width).toBe(1500);
    expect(done.height).toBe(1000);
    expect(variants.map((v) => `${v.format}:${v.width}`).sort()).toEqual(['avif:1280', 'avif:320', 'avif:640', 'avif:960', 'webp:1280', 'webp:320', 'webp:640', 'webp:960'].sort());
    expect(variants.find((v) => v.width === 640 && v.format === 'webp')).toMatchObject({ height: 427, key: `media/${org.id}/2026/10/${suffix}-integration photo/w640.webp` });
    expect(done.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(done.dominantColor).toMatch(/^#[0-9a-f]{6}$/);

    const v = variants.find((x) => x.format === 'webp' && x.width === 320)!;
    const res = await fetch(v.url);
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 320 });
  }, 90_000);
});
