'use client';

import type { AuthResult, Me, Membership, OrganizationSummary, User, Website } from '@atrium/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, onAuthChange, refreshAccessToken, setAccessToken } from './api';
import { qk } from './query-keys';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionValue {
  user: User | null;
  memberships: Membership[];
  /** Organization currently selected in the switcher (persisted per browser). */
  currentOrg: OrganizationSummary | null;
  currentMembership: Membership | null;
  setCurrentOrg: (orgId: string) => void;
  status: SessionStatus;
  /**
   * Permission check against the current org membership. With `websiteId`,
   * honours website access scoping and, when the website is in the query cache,
   * the server-computed `website.permissions`.
   */
  can: (permission: string, websiteId?: string) => boolean;
  /** Store an auth result from login/register/MFA and load memberships. */
  signIn: (result: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch `/auth/me` (after creating an org, accepting an invite…). */
  reload: () => Promise<Me | null>;
}

const SessionContext = createContext<SessionValue | null>(null);
const ORG_KEY = 'atrium.currentOrg';

function readStoredOrg(): string | null {
  try {
    return window.localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const booted = useRef(false);

  const loadMe = useCallback(async (): Promise<Me | null> => {
    try {
      const data = await api.auth.me();
      setMe(data);
      queryClient.setQueryData(qk.me(), data);
      setStatus('authenticated');
      setOrgId((prev) => {
        const stored = prev ?? readStoredOrg();
        if (stored && data.memberships.some((m) => m.organization.id === stored)) return stored;
        return data.memberships[0]?.organization.id ?? null;
      });
      return data;
    } catch {
      setMe(null);
      setStatus('unauthenticated');
      return null;
    }
  }, [queryClient]);

  // Boot: try the refresh cookie once.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    refreshAccessToken().then((r) => {
      if (r) void loadMe();
      else setStatus('unauthenticated');
    });
  }, [loadMe]);

  // If a later refresh fails (expired session), drop to unauthenticated.
  useEffect(
    () =>
      onAuthChange((r) => {
        if (!r) {
          setMe(null);
          setStatus('unauthenticated');
        }
      }),
    [],
  );

  const setCurrentOrg = useCallback((id: string) => {
    setOrgId(id);
    try {
      window.localStorage.setItem(ORG_KEY, id);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const signIn = useCallback(
    async (result: AuthResult) => {
      setAccessToken(result.accessToken);
      await loadMe();
    },
    [loadMe],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    setMe(null);
    setStatus('unauthenticated');
    queryClient.clear();
  }, [queryClient]);

  const currentMembership = useMemo(() => me?.memberships.find((m) => m.organization.id === orgId) ?? me?.memberships[0] ?? null, [me, orgId]);

  const can = useCallback(
    (permission: string, websiteId?: string) => {
      if (!me) return false;
      if (me.user.isSuperAdmin) return true;
      if (websiteId) {
        const site = queryClient.getQueryData<Website>(qk.website(websiteId));
        if (site?.permissions) return site.permissions.includes(permission);
        const m = site ? me.memberships.find((x) => x.organization.id === site.organizationId) : currentMembership;
        if (!m) return false;
        if (m.websiteIds.length > 0 && !m.websiteIds.includes(websiteId)) return false;
        return m.permissions.includes(permission);
      }
      return currentMembership?.permissions.includes(permission) ?? false;
    },
    [me, currentMembership, queryClient],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user: me?.user ?? null,
      memberships: me?.memberships ?? [],
      currentOrg: currentMembership?.organization ?? null,
      currentMembership,
      setCurrentOrg,
      status,
      can,
      signIn,
      signOut,
      reload: loadMe,
    }),
    [me, currentMembership, setCurrentOrg, status, can, signIn, signOut, loadMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** Convenience: `const allowed = useCan('page.publish', websiteId)`. */
export function useCan(permission: string, websiteId?: string): boolean {
  return useSession().can(permission, websiteId);
}
