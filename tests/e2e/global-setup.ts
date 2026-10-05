import { env } from './fixtures/env';

async function waitFor(
  url: string,
  label: string,
  ok: (status: number) => boolean,
  timeoutMs = 60_000,
) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (ok(res.status)) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `${label} is not reachable at ${url} (${last}). Start the stack first: \`pnpm atrium start\` (and \`pnpm atrium status\` to check).`,
  );
}

/** Fail fast with a clear message when the stack is not running. */
export default async function globalSetup() {
  await waitFor(`${env.apiURL}/v1/health/ready`, 'API (db + redis)', (s) => s === 200);
  await waitFor(`${env.adminURL}/login`, 'Admin', (s) => s < 500);
  await waitFor(env.rendererURL, 'Renderer', (s) => s < 500);
}
