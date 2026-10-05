import { createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

export interface ProbeResult {
  ok: boolean;
  ms: number;
  detail?: string;
  status?: number;
  body?: unknown;
}

/** HTTP GET with timeout; never throws. */
export async function httpProbe(url: string, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: opts.headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 3000), redirect: 'manual' });
    const ct = res.headers.get('content-type') ?? '';
    let body: unknown;
    try {
      body = ct.includes('json') ? await res.json() : (await res.text()).slice(0, 200);
    } catch {
      body = undefined;
    }
    return { ok: res.status < 400, status: res.status, ms: Date.now() - started, body, detail: `HTTP ${res.status}` };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    return { ok: false, ms: Date.now() - started, detail: e.cause?.code ?? (e.name === 'TimeoutError' ? 'timeout' : e.message) };
  }
}

/** Open a TCP connection and optionally read the first line (SMTP greeting). */
export function tcpProbe(host: string, port: number, opts: { timeoutMs?: number; readGreeting?: boolean; tls?: boolean } = {}): Promise<ProbeResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const sock = opts.tls ? tlsConnect({ host, port, servername: host, rejectUnauthorized: false }) : createConnection({ host, port });
    let settled = false;
    const finish = (r: Omit<ProbeResult, 'ms'>) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve({ ...r, ms: Date.now() - started });
    };
    sock.setTimeout(opts.timeoutMs ?? 3000, () => finish({ ok: false, detail: 'timeout' }));
    sock.once('error', (err: NodeJS.ErrnoException) => finish({ ok: false, detail: err.code ?? err.message }));
    sock.once(opts.tls ? 'secureConnect' : 'connect', () => {
      if (!opts.readGreeting) finish({ ok: true, detail: 'connected' });
    });
    if (opts.readGreeting) {
      sock.once('data', (d) => {
        const line = d.toString('utf8').split('\r\n')[0] ?? '';
        finish({ ok: /^2\d\d/.test(line), detail: line.slice(0, 80) });
      });
    }
  });
}

/** Parse host/port out of a URL with a default port. */
export function hostPort(url: string, defaultPort: number): { host: string; port: number } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port || defaultPort) };
  } catch {
    return null;
  }
}
