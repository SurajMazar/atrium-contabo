import { existsSync } from 'node:fs';
import { run, tryCapture, which, type RunOptions } from './exec';
import { paths } from './paths';
import { CliError } from './ui';

export type EngineName = 'podman' | 'docker';

export interface ContainerEngine {
  engine: EngineName;
  /** Path to podman/docker. */
  bin: string;
  /** Compose invocation, e.g. ['podman', 'compose'] or ['podman-compose']. */
  compose: string[];
  composeLabel: string;
}

let cached: ContainerEngine | null | undefined;

/** Quiet podman's "Executing external compose provider" banner. */
export const ENGINE_ENV = { PODMAN_COMPOSE_WARNING_LOGS: 'false' };

async function composeWorks(cmd: string[]): Promise<boolean> {
  const out = await tryCapture(cmd[0]!, [...cmd.slice(1), 'version'], { env: { ...process.env, ...ENGINE_ENV }, timeoutMs: 15_000 });
  return out !== null;
}

/**
 * Detect the container engine once. Prefers Podman (the supported local
 * engine), then Docker. Override with ATRIUM_CONTAINER_ENGINE=podman|docker.
 */
export async function detectEngine(): Promise<ContainerEngine | null> {
  if (cached !== undefined) return cached;
  const forced = process.env.ATRIUM_CONTAINER_ENGINE as EngineName | undefined;
  const order: EngineName[] = forced ? [forced] : ['podman', 'docker'];
  for (const engine of order) {
    const bin = which(engine);
    if (!bin) continue;
    const candidates: string[][] =
      engine === 'podman' ? [[bin, 'compose'], ...(which('podman-compose') ? [[which('podman-compose')!]] : [])] : [[bin, 'compose'], ...(which('docker-compose') ? [[which('docker-compose')!]] : [])];
    for (const c of candidates) {
      if (await composeWorks(c)) {
        cached = { engine, bin, compose: c, composeLabel: c.length > 1 ? `${engine} compose` : c[0]!.split('/').pop()! };
        return cached;
      }
    }
    // engine without compose — still usable for exec/logs
    cached = { engine, bin, compose: [], composeLabel: 'none' };
    return cached;
  }
  cached = null;
  return null;
}

export async function requireEngine(needCompose = true): Promise<ContainerEngine> {
  const e = await detectEngine();
  if (!e) throw new CliError('No container engine found', 'Install Podman (recommended: https://podman.io) or Docker. On macOS: `brew install podman podman-compose && podman machine init --memory 6144 && podman machine start`.');
  if (needCompose && !e.compose.length) {
    throw new CliError(`${e.engine} is installed but no compose provider was found`, e.engine === 'podman' ? 'Install podman-compose (`brew install podman-compose` / `pip install podman-compose`) or docker-compose.' : 'Install the Docker Compose plugin.');
  }
  return e;
}

export interface ComposeOptions extends RunOptions {
  file?: string;
  profiles?: string[];
  envFile?: string;
}

/** Run `<compose> -f infra/compose.yaml --env-file .env <args>`. */
export async function compose(args: string[], opts: ComposeOptions = {}) {
  const e = await requireEngine();
  const p = paths();
  const file = opts.file ?? p.compose;
  const envFile = opts.envFile ?? p.env;
  const base = [...e.compose.slice(1), '-f', file];
  if (existsSync(envFile)) base.push('--env-file', envFile);
  for (const prof of opts.profiles ?? []) base.push('--profile', prof);
  return run(e.compose[0]!, [...base, ...args], { cwd: p.root, ...opts, env: { ...process.env, ...ENGINE_ENV, ...opts.env } });
}

export interface ContainerInfo {
  name: string;
  service: string;
  state: string;
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  ports: Array<{ host: number; container: number }>;
  image: string;
}

function parsePorts(raw: unknown): ContainerInfo['ports'] {
  if (Array.isArray(raw)) {
    return raw
      .map((p: Record<string, unknown>) => ({ host: Number(p.host_port ?? p.HostPort ?? p.PublicPort), container: Number(p.container_port ?? p.ContainerPort ?? p.PrivatePort) }))
      .filter((p) => p.host > 0);
  }
  if (typeof raw === 'string') {
    // docker: "0.0.0.0:55432->5432/tcp, :::55432->5432/tcp"
    const out: ContainerInfo['ports'] = [];
    for (const m of raw.matchAll(/:(\d+)->(\d+)\//g)) {
      const entry = { host: Number(m[1]), container: Number(m[2]) };
      if (!out.some((o) => o.host === entry.host)) out.push(entry);
    }
    return out;
  }
  return [];
}

function healthOf(status: string): ContainerInfo['health'] {
  if (/\(healthy\)/.test(status)) return 'healthy';
  if (/unhealthy/.test(status)) return 'unhealthy';
  if (/health: starting|\(starting\)/.test(status)) return 'starting';
  return 'none';
}

/** List containers of the `atrium` compose project (any engine). */
export async function listProjectContainers(project = 'atrium'): Promise<ContainerInfo[]> {
  const e = await detectEngine();
  if (!e) return [];
  const out = await tryCapture(e.bin, ['ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '--format', e.engine === 'podman' ? 'json' : '{{json .}}'], { timeoutMs: 20_000 });
  if (!out) return [];
  let items: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(out);
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    items = out
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }
  return items.map((c) => {
    const labels = (c.Labels ?? {}) as Record<string, string> | string;
    const labelMap: Record<string, string> =
      typeof labels === 'string' ? Object.fromEntries(labels.split(',').map((kv) => kv.split('=') as [string, string])) : labels;
    const names = c.Names;
    const name = Array.isArray(names) ? String(names[0]) : String(names ?? c.Name ?? '');
    const status = String(c.Status ?? '');
    return {
      name,
      service: labelMap['com.docker.compose.service'] ?? name,
      state: String(c.State ?? '').toLowerCase(),
      status,
      health: healthOf(status),
      ports: parsePorts(c.Ports),
      image: String(c.Image ?? ''),
    };
  });
}

/** Container name for a compose service (e.g. postgres → atrium_postgres_1). */
export async function serviceContainer(service: string): Promise<ContainerInfo | undefined> {
  const list = await listProjectContainers();
  return list.find((c) => c.service === service && c.state === 'running') ?? list.find((c) => c.service === service);
}

/** On macOS/Windows podman runs in a VM; report its state and memory. */
export async function podmanMachineInfo(): Promise<{ name: string; running: boolean; memoryMiB: number; cpus: number } | null> {
  if (process.platform === 'linux') return null;
  const podman = which('podman');
  if (!podman) return null;
  const out = await tryCapture(podman, ['machine', 'list', '--format', 'json'], { timeoutMs: 15_000 });
  if (!out) return null;
  try {
    const list = JSON.parse(out) as Array<Record<string, unknown>>;
    const m = list.find((x) => x.Default) ?? list[0];
    if (!m) return null;
    const mem = String(m.Memory ?? '0');
    const memoryMiB = /GiB/i.test(mem) ? Number.parseFloat(mem) * 1024 : /MiB/i.test(mem) ? Number.parseFloat(mem) : Number(mem) / (1024 * 1024);
    return { name: String(m.Name), running: !!m.Running || String(m.LastUp) === 'Currently running', memoryMiB: Math.round(memoryMiB), cpus: Number(m.CPUs ?? 0) };
  } catch {
    return null;
  }
}
