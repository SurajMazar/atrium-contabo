import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { env } from '../config/env';
import { PrismaService } from './prisma.service';

/**
 * Organization admin hostnames (organizations.admin_hostname) → organization ids. Their origins are
 * trusted for cookie-based sign-in in addition to ADMIN_URL / CORS_ORIGINS, so a new white-label admin
 * domain needs no env change. Only super admins can set them. Kept in memory and refreshed after
 * every change and once a minute (several API replicas converge within that interval).
 */
let byHost = new Map<string, string>();
let origins = new Set<string>();

/** Origins (`https://admin.example.com`) of every organization admin hostname. */
export function adminHostOrigins(): ReadonlySet<string> {
  return origins;
}

/** Organization owning this admin hostname, if any. */
export function organizationForAdminHost(hostname: string | undefined | null): string | null {
  if (!hostname) return null;
  return byHost.get(hostname.trim().toLowerCase().replace(/\.$/, '')) ?? null;
}

/** Scheme of the admin app (https in production) — admin hostnames are served the same way. */
function scheme(): string {
  try {
    return new URL(env().ADMIN_URL).protocol;
  } catch {
    return 'https:';
  }
}

export function setAdminHosts(rows: Array<{ id: string; adminHostname: string | null }>) {
  const nextHosts = new Map<string, string>();
  const nextOrigins = new Set<string>();
  for (const r of rows) {
    if (!r.adminHostname) continue;
    nextHosts.set(r.adminHostname, r.id);
    nextOrigins.add(`${scheme()}//${r.adminHostname}`);
  }
  byHost = nextHosts;
  origins = nextOrigins;
}

@Injectable()
export class AdminHostsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminHostsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async refresh(): Promise<void> {
    try {
      setAdminHosts(await this.prisma.client.organization.findMany({ where: { adminHostname: { not: null } }, select: { id: true, adminHostname: true } }));
    } catch (err) {
      this.logger.warn(`could not load organization admin hostnames: ${(err as Error).message}`);
    }
  }

  async onModuleInit() {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
