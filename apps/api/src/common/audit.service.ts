import { Injectable, Logger } from '@nestjs/common';
import type { AppRequest, AuthUser } from './decorators';
import { PrismaService } from './prisma.service';

export interface AuditEntry {
  organizationId?: string | null;
  websiteId?: string | null;
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
  actorType?: 'USER' | 'AI' | 'SYSTEM' | 'API';
  action: string;
  resourceType: string;
  resourceId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
  req?: AppRequest;
}

/** Append-only audit log + activity timeline. Never throws into the caller. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  async log(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          organizationId: e.organizationId ?? null,
          websiteId: e.websiteId ?? null,
          actorId: e.actor?.id ?? null,
          actorName: e.actor?.name ?? null,
          actorType: e.actorType ?? (e.actor ? 'USER' : 'SYSTEM'),
          action: e.action,
          resourceType: e.resourceType,
          resourceId: e.resourceId ?? null,
          summary: e.summary,
          ip: e.req ? (e.req.ip ?? null) : null,
          userAgent: e.req ? ((e.req.headers['user-agent'] as string) ?? null) : null,
          metadata: (e.metadata ?? {}) as object,
        },
      });
    } catch (err) {
      this.logger.warn(`audit write failed: ${(err as Error).message}`);
    }
  }
}
