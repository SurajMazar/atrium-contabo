import type { CheckResult } from './checks';
import { tryCapture, which } from './exec';
import { detectEngine, podmanMachineInfo } from './runtime';

export function compareVersions(a: string, b: string): number {
  const pa = a
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const pb = b
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export const MIN_NODE = '22.12.0';
export const MIN_PNPM = '10.0.0';

/** Toolchain prerequisites: node, pnpm, git, container engine + compose, podman machine. */
export async function prerequisiteChecks(
  opts: { needEngine?: boolean } = {},
): Promise<CheckResult[]> {
  const g = 'Prerequisites';
  const out: CheckResult[] = [];
  const node = process.versions.node;
  out.push(
    compareVersions(node, MIN_NODE) >= 0
      ? {
          group: g,
          label: 'Node.js',
          status: 'ok',
          detail: `v${node}${compareVersions(node, '24.0.0') < 0 ? ' (24 LTS recommended)' : ''}`,
        }
      : {
          group: g,
          label: 'Node.js',
          status: 'fail',
          detail: `v${node} < ${MIN_NODE}`,
          hint: 'Install Node 24 LTS (fnm/nvm/volta)',
        },
  );
  const pnpm = await tryCapture('pnpm', ['--version'], { timeoutMs: 10_000 });
  out.push(
    pnpm && compareVersions(pnpm, MIN_PNPM) >= 0
      ? { group: g, label: 'pnpm', status: 'ok', detail: `v${pnpm}` }
      : {
          group: g,
          label: 'pnpm',
          status: 'fail',
          detail: pnpm ? `v${pnpm} < ${MIN_PNPM}` : 'not found',
          hint: 'corepack enable && corepack prepare pnpm@10 --activate',
        },
  );
  const git = await tryCapture('git', ['--version']);
  out.push(
    git
      ? { group: g, label: 'git', status: 'ok', detail: git.replace('git version ', 'v') }
      : {
          group: g,
          label: 'git',
          status: 'warn',
          detail: 'not found',
          hint: 'Needed for `atrium update`',
        },
  );

  const engine = await detectEngine();
  if (!engine) {
    out.push({
      group: g,
      label: 'Container engine',
      status: opts.needEngine === false ? 'warn' : 'fail',
      detail: 'podman/docker not found',
      hint: 'brew install podman podman-compose (macOS) · apt install podman podman-compose (Debian/Ubuntu)',
    });
  } else {
    const version = await tryCapture(engine.bin, ['--version']);
    out.push({
      group: g,
      label: 'Container engine',
      status: 'ok',
      detail: `${version ?? engine.engine}${engine.engine === 'docker' ? ' (podman preferred)' : ''}`,
    });
    out.push(
      engine.compose.length
        ? { group: g, label: 'Compose', status: 'ok', detail: engine.composeLabel }
        : {
            group: g,
            label: 'Compose',
            status: 'fail',
            detail: 'no compose provider',
            hint:
              engine.engine === 'podman'
                ? 'brew/pip install podman-compose'
                : 'install the docker compose plugin',
          },
    );
    if (engine.engine === 'podman' && process.platform !== 'linux') {
      const m = await podmanMachineInfo();
      if (!m)
        out.push({
          group: g,
          label: 'Podman machine',
          status: 'fail',
          detail: 'no machine',
          hint: 'podman machine init --cpus 4 --memory 6144 && podman machine start',
        });
      else {
        out.push(
          m.running
            ? {
                group: g,
                label: 'Podman machine',
                status: 'ok',
                detail: `${m.name} running · ${m.cpus} CPU · ${(m.memoryMiB / 1024).toFixed(1)} GiB`,
              }
            : {
                group: g,
                label: 'Podman machine',
                status: 'fail',
                detail: `${m.name} is stopped`,
                hint: 'podman machine start',
              },
        );
        if (m.memoryMiB < 4096) {
          out.push({
            group: g,
            label: 'Podman machine memory',
            status: 'warn',
            detail: `${m.memoryMiB} MiB — enough for backing services, too little to build app images (Next.js builds OOM)`,
            hint: `podman machine stop && podman machine set --memory 6144 && podman machine start`,
          });
        }
      }
    }
  }
  if (!which('psql'))
    out.push({
      group: g,
      label: 'psql/pg_dump (optional)',
      status: 'info',
      detail: 'not installed — the CLI uses the postgres container instead',
    });
  return out;
}
