import { createConnection, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

/**
 * Minimal RESP2 client — just enough for health checks and BullMQ queue
 * counts without pulling ioredis into the CLI.
 */
export type RespValue = string | number | null | RespValue[] | Error;

export function encodeCommand(args: Array<string | number>): Buffer {
  const parts = [`*${args.length}\r\n`];
  for (const a of args) {
    const s = String(a);
    parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`);
  }
  return Buffer.from(parts.join(''));
}

/** Parse one RESP value from `buf` at `offset`. Returns null if incomplete. */
export function parseResp(buf: Buffer, offset = 0): { value: RespValue; next: number } | null {
  if (offset >= buf.length) return null;
  const type = String.fromCharCode(buf[offset]!);
  const lineEnd = buf.indexOf('\r\n', offset);
  if (lineEnd < 0) return null;
  const line = buf.toString('utf8', offset + 1, lineEnd);
  const after = lineEnd + 2;
  switch (type) {
    case '+':
      return { value: line, next: after };
    case '-':
      return { value: new Error(line), next: after };
    case ':':
      return { value: Number(line), next: after };
    case '$': {
      const len = Number(line);
      if (len < 0) return { value: null, next: after };
      if (buf.length < after + len + 2) return null;
      return { value: buf.toString('utf8', after, after + len), next: after + len + 2 };
    }
    case '*': {
      const count = Number(line);
      if (count < 0) return { value: null, next: after };
      const items: RespValue[] = [];
      let pos = after;
      for (let i = 0; i < count; i++) {
        const r = parseResp(buf, pos);
        if (!r) return null;
        items.push(r.value);
        pos = r.next;
      }
      return { value: items, next: pos };
    }
    default:
      throw new Error(`Unexpected RESP type byte "${type}"`);
  }
}

export class MiniRedis {
  private buf = Buffer.alloc(0);
  private queue: Array<{ resolve: (v: RespValue) => void; reject: (e: Error) => void }> = [];

  private constructor(private readonly sock: Socket) {
    sock.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      for (;;) {
        const r = parseResp(this.buf);
        if (!r) break;
        this.buf = this.buf.subarray(r.next);
        const waiter = this.queue.shift();
        if (!waiter) continue;
        if (r.value instanceof Error) waiter.reject(r.value);
        else waiter.resolve(r.value);
      }
    });
    const fail = (err: Error) => {
      for (const w of this.queue.splice(0)) w.reject(err);
    };
    sock.on('error', fail);
    sock.on('close', () => fail(new Error('connection closed')));
  }

  static connect(url: string, timeoutMs = 3000): Promise<MiniRedis> {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, '') || '127.0.0.1';
    const port = Number(u.port || 6379);
    return new Promise((resolve, reject) => {
      const sock = u.protocol === 'rediss:' ? tlsConnect({ host, port, servername: host }) : createConnection({ host, port });
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new Error(`timeout connecting to ${host}:${port}`));
      }, timeoutMs);
      sock.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      sock.once(u.protocol === 'rediss:' ? 'secureConnect' : 'connect', async () => {
        clearTimeout(timer);
        const client = new MiniRedis(sock);
        try {
          const password = decodeURIComponent(u.password || '');
          const username = decodeURIComponent(u.username || '');
          if (password) await client.command(username ? ['AUTH', username, password] : ['AUTH', password]);
          const db = u.pathname.replace('/', '');
          if (db) await client.command(['SELECT', db]);
          resolve(client);
        } catch (e) {
          client.close();
          reject(e);
        }
      });
    });
  }

  command(args: Array<string | number>): Promise<RespValue> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.sock.write(encodeCommand(args));
    });
  }

  async info(section = 'server'): Promise<Record<string, string>> {
    const raw = String(await this.command(['INFO', section]));
    return Object.fromEntries(
      raw
        .split('\r\n')
        .filter((l) => l && !l.startsWith('#') && l.includes(':'))
        .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)]),
    );
  }

  async scanAll(match: string, count = 500): Promise<string[]> {
    const keys = new Set<string>();
    let cursor = '0';
    do {
      const res = (await this.command(['SCAN', cursor, 'MATCH', match, 'COUNT', count])) as [string, string[]];
      cursor = res[0];
      for (const k of res[1]) keys.add(k);
    } while (cursor !== '0');
    return [...keys];
  }

  close() {
    this.sock.end();
    this.sock.destroy();
  }
}

export interface QueueCounts {
  name: string;
  prefix: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: boolean;
}

/** Discover BullMQ queues (via `<prefix>:<name>:meta`) and count jobs per state. */
export async function bullQueueCounts(client: MiniRedis, prefix = 'bull'): Promise<QueueCounts[]> {
  const metas = await client.scanAll(`${prefix}:*:meta`);
  const out: QueueCounts[] = [];
  for (const meta of metas.sort()) {
    const name = meta.slice(prefix.length + 1, -':meta'.length);
    const k = (s: string) => `${prefix}:${name}:${s}`;
    const [wait, paused, active, delayed, failed, completed, prioritized, metaPaused] = await Promise.all([
      client.command(['LLEN', k('wait')]),
      client.command(['LLEN', k('paused')]),
      client.command(['LLEN', k('active')]),
      client.command(['ZCARD', k('delayed')]),
      client.command(['ZCARD', k('failed')]),
      client.command(['ZCARD', k('completed')]),
      client.command(['ZCARD', k('prioritized')]),
      client.command(['HGET', meta, 'paused']),
    ]);
    out.push({
      name,
      prefix,
      waiting: Number(wait) + Number(paused) + Number(prioritized),
      active: Number(active),
      delayed: Number(delayed),
      failed: Number(failed),
      completed: Number(completed),
      paused: metaPaused === '1',
    });
  }
  return out;
}
