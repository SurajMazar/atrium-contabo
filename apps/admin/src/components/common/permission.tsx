'use client';

import { Tooltip } from '@atrium/ui';
import { Lock } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { EmptyState } from '@atrium/ui';

/**
 * Hide (`mode="hide"`, default) or wrap with a disabled tooltip (`mode="disable"`)
 * when the user lacks `permission`.
 */
export function Can({ permission, websiteId, children, fallback = null }: { permission: string | string[]; websiteId?: string; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useSession();
  const perms = Array.isArray(permission) ? permission : [permission];
  return <>{perms.every((p) => can(p, websiteId)) ? children : fallback}</>;
}

/** Renders the child disabled with an explanatory tooltip when permission is missing. */
export function RequirePermission({ permission, websiteId, children }: { permission: string; websiteId?: string; children: ReactElement<{ disabled?: boolean }> }) {
  const { can } = useSession();
  if (can(permission, websiteId)) return children;
  return (
    <Tooltip content={`You need the “${permission}” permission`}>
      <span tabIndex={0} className="inline-flex cursor-not-allowed">
        <span className="pointer-events-none opacity-60">{children}</span>
      </span>
    </Tooltip>
  );
}

/** Full-screen 403 for routes the user can’t view. */
export function Forbidden({ permission, children }: { permission?: string; children?: ReactNode }) {
  return (
    <EmptyState
      icon={<Lock />}
      title="You don’t have access to this"
      description={
        children ?? (
          <>
            Ask an organization admin to grant you {permission ? <code className="font-mono text-xs">{permission}</code> : 'the required permission'}.
          </>
        )
      }
    />
  );
}

/** Gate an entire screen behind a permission. */
export function PermissionPage({ permission, websiteId, children }: { permission: string; websiteId?: string; children: ReactNode }) {
  const { can, status } = useSession();
  if (status !== 'authenticated') return null;
  if (!can(permission, websiteId)) return <Forbidden permission={permission} />;
  return <>{children}</>;
}
