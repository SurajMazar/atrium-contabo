import { Injectable } from '@nestjs/common';
import { applyOperation, OperationError, type SiteOperation } from '@atrium/builder-core';
import { registry } from '@atrium/component-registry';
import { loadDraft, persistDraft, SiteStoreError, type PersistMeta, type PersistResult } from '@atrium/site-store';
import type { WebsiteDefinition } from '@atrium/schema';
import { createDraft, finishDraft } from 'immer';
import { conflict, notFound, validation } from '../../common/errors';
import { sanitizeDefinition } from '../../common/sanitize';
import { PrismaService } from '../../common/prisma.service';

export type Tx = Parameters<Parameters<PrismaService['client']['$transaction']>[0]>[0];

/**
 * All structural edits funnel through here: load the draft, transform it with
 * builder-core (validated against the component registry), and persist the diff
 * under a per-website advisory lock so concurrent writers serialize.
 */
@Injectable()
export class DraftService {
  readonly registry = registry;
  constructor(private readonly prisma: PrismaService) {}

  async load(websiteId: string) {
    try {
      return await loadDraft(this.prisma.client, websiteId);
    } catch (err) {
      if (err instanceof SiteStoreError && err.code === 'NOT_FOUND') throw notFound('Website');
      throw err;
    }
  }

  /** Run `mutate` against the current draft inside a locked transaction and persist the result. */
  async transform(
    websiteId: string,
    mutate: (draft: WebsiteDefinition, before: WebsiteDefinition) => void | Promise<void>,
    meta: PersistMeta = {},
  ): Promise<PersistResult & { before: WebsiteDefinition; after: WebsiteDefinition }> {
    return this.prisma.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${websiteId}))`;
        const { definition: before } = await loadDraft(tx, websiteId);
        let after: WebsiteDefinition;
        try {
          after = await produceAsync(before, async (d) => {
            await mutate(d, before);
            sanitizeDefinition(d);
          });
        } catch (err) {
          if (err instanceof OperationError) throw validation(err.message);
          if ((err as { name?: string }).name === 'ZodError') throw validation('Invalid change', (err as { issues?: unknown }).issues);
          throw err;
        }
        const res = await persistDraft(tx, websiteId, before, after, meta);
        return { ...res, before, after };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  async applyOperations(websiteId: string, operations: SiteOperation[], meta: PersistMeta = {}) {
    const results: Array<{ createdId?: string; warnings: string[] }> = [];
    const res = await this.transform(
      websiteId,
      (d) => {
        for (const op of operations) results.push(applyOperation(d, op, this.registry));
      },
      meta,
    );
    return { ...res, results };
  }

  /** Optimistic-concurrency guard for revisioned units. */
  static assertRevision(current: number, sent: number | undefined, what: string) {
    if (sent !== undefined && sent !== current) throw conflict(`${what} was changed by someone else`, { current });
  }
}

/** Async-safe immer transform (immer 10 recipes must be synchronous; drafts can span awaits). */
async function produceAsync<T>(base: T, recipe: (draft: T) => void | Promise<void>): Promise<T> {
  const draft = createDraft(base as object) as T;
  await recipe(draft);
  return finishDraft(draft as object) as T;
}
