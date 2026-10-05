import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

export interface CreatePrismaOptions {
  url?: string;
  log?: Array<'query' | 'info' | 'warn' | 'error'>;
  /** Connection pool size per process. */
  max?: number;
}

/** Create a PrismaClient using the pg driver adapter (Prisma 7). */
export function createPrismaClient(opts: CreatePrismaOptions = {}): PrismaClient {
  const connectionString = opts.url ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaPg({ connectionString, max: opts.max ?? Number(process.env.DATABASE_POOL_SIZE ?? 10) });
  return new PrismaClient({ adapter, log: opts.log ?? ['warn', 'error'] });
}
