import { compose, listProjectContainers, type ContainerInfo } from './runtime';
import { CliError, task } from './ui';

export const BACKING_SERVICES = ['postgres', 'redis', 's3', 'mailpit'] as const;
export const ONE_SHOT_SERVICES = new Set(['s3-init', 'migrate']);

export function isReady(c: ContainerInfo): boolean {
  if (c.state !== 'running') return false;
  return c.health === 'healthy' || c.health === 'none';
}

/** Poll until every expected service is running (and healthy when it has a healthcheck). */
export async function waitHealthy(
  services: readonly string[],
  timeoutMs = 180_000,
  onProgress?: (msg: string) => void,
): Promise<ContainerInfo[]> {
  const deadline = Date.now() + timeoutMs;
  let last: ContainerInfo[] = [];
  while (Date.now() < deadline) {
    last = await listProjectContainers();
    const pending = services.filter((s) => {
      const c = last.find((x) => x.service === s);
      return !c || !isReady(c);
    });
    if (!pending.length) return last;
    const bad = last.find(
      (c) => services.includes(c.service) && (c.health === 'unhealthy' || c.state === 'exited'),
    );
    onProgress?.(
      `waiting for ${pending.join(', ')}${bad ? ` (${bad.service}: ${bad.status})` : ''}`,
    );
    await new Promise((r) => setTimeout(r, 2000));
  }
  const states = services
    .map((s) => `${s}=${last.find((x) => x.service === s)?.status ?? 'missing'}`)
    .join(', ');
  throw new CliError(
    `Timed out waiting for infrastructure: ${states}`,
    'Inspect with `atrium logs <service>`; on macOS check `podman machine list`.',
  );
}

export async function infraUp(
  opts: { app?: boolean; wait?: boolean; pull?: boolean; build?: boolean } = {},
) {
  const args = ['up', '-d'];
  if (opts.build) args.push('--build');
  if (opts.pull) await compose(['pull'], { profiles: opts.app ? ['app'] : [] });
  await task(
    `Starting ${opts.app ? 'infrastructure + app containers' : 'backing services'} (postgres, redis, s3, mailpit)`,
    async () => {
      await compose(args, { profiles: opts.app ? ['app'] : [], stdio: 'pipe' });
    },
    () => 'Containers started',
  );
  if (opts.wait !== false) {
    await task(
      'Waiting for services to become healthy',
      (update) => waitHealthy(BACKING_SERVICES, 180_000, update),
      () => 'Infrastructure is healthy',
    );
  }
}

/** True when all backing services are already up and healthy. */
export async function infraHealthy(): Promise<boolean> {
  const list = await listProjectContainers();
  return BACKING_SERVICES.every((s) => {
    const c = list.find((x) => x.service === s);
    return !!c && isReady(c);
  });
}
