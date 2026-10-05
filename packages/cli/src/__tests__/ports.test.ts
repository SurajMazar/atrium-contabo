import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { EnvFile } from '../lib/env';
import {
  applyPorts,
  currentPorts,
  findFreePort,
  isPortFree,
  pickPorts,
  replacePortInValue,
} from '../lib/ports';

describe('port picking', () => {
  it('keeps free defaults and moves busy ones without collisions', async () => {
    const busy = new Set([3000, 3001, 3002, 4000]);
    const plans = await pickPorts(
      ['ADMIN_PORT', 'RENDERER_PORT', 'API_PORT'],
      {},
      async (p) => !busy.has(p),
    );
    expect(plans.map((p) => [p.key, p.chosen])).toEqual([
      ['ADMIN_PORT', 3003],
      ['RENDERER_PORT', 3004],
      ['API_PORT', 4001],
    ]);
    expect(plans.every((p) => p.changed)).toBe(true);
  });

  it('never moves ports already owned by Atrium', async () => {
    const plans = await pickPorts(
      ['ATRIUM_PG_PORT'],
      { ATRIUM_PG_PORT: 55432 },
      async () => false,
      new Set(['ATRIUM_PG_PORT']),
    );
    expect(plans[0]).toMatchObject({ chosen: 55432, changed: false });
  });

  it('findFreePort skips taken ports', async () => {
    expect(await findFreePort(5000, async (p) => p >= 5003, new Set([5003]))).toBe(5004);
  });

  it('detects a real listener', async () => {
    const srv = createServer();
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as { port: number }).port;
    expect(await isPortFree(port)).toBe(false);
    await new Promise<void>((r) => srv.close(() => r()));
  });
});

describe('applyPorts', () => {
  it('rewrites the port key and every derived URL', () => {
    const env = EnvFile.parse(
      'ADMIN_PORT=3000\nADMIN_URL=http://localhost:3000\nCORS_ORIGINS=http://localhost:3000,http://localhost:3001\nRENDERER_PORT=3001\nPLATFORM_SITES_DOMAIN=sites.localhost:3001\nATRIUM_PG_PORT=55432\nDATABASE_URL=postgresql://atrium:atrium@localhost:55432/atrium\nATRIUM_SMTP_PORT=51025\nSMTP_PORT=51025\n',
    );
    const touched = applyPorts(env, [
      { key: 'ADMIN_PORT', from: 3000, to: 3100 },
      { key: 'RENDERER_PORT', from: 3001, to: 3101 },
      { key: 'ATRIUM_PG_PORT', from: 55432, to: 55433 },
      { key: 'ATRIUM_SMTP_PORT', from: 51025, to: 51026 },
    ]);
    expect(env.get('ADMIN_URL')).toBe('http://localhost:3100');
    expect(env.get('CORS_ORIGINS')).toBe('http://localhost:3100,http://localhost:3101');
    expect(env.get('PLATFORM_SITES_DOMAIN')).toBe('sites.localhost:3101');
    expect(env.get('DATABASE_URL')).toBe('postgresql://atrium:atrium@localhost:55433/atrium');
    expect(env.get('SMTP_PORT')).toBe('51026');
    expect(touched).toContain('DATABASE_URL');
  });

  it('only touches local hosts', () => {
    expect(replacePortInValue('https://api.example.com:4000', 4000, 4001)).toBe(
      'https://api.example.com:4000',
    );
    expect(replacePortInValue('http://127.0.0.1:4000/v1', 4000, 4001)).toBe(
      'http://127.0.0.1:4001/v1',
    );
    expect(replacePortInValue('http://localhost:40000', 4000, 4001)).toBe('http://localhost:40000');
  });

  it('currentPorts falls back to defaults', () => {
    expect(currentPorts(EnvFile.parse('API_PORT=4100\n'))).toMatchObject({
      API_PORT: 4100,
      ADMIN_PORT: 3000,
      ATRIUM_PG_PORT: 55432,
    });
  });
});
