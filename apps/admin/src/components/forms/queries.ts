'use client';

import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

/** Shared org-level lookups used by the form builder and the submissions inbox. */
export function useMembers(orgId: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: qk.members(orgId ?? ''), queryFn: () => api.organizations.members(orgId!), enabled: !!orgId, staleTime: 60_000 });
}

export function useEmailProviders(orgId: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: qk.providers(orgId ?? '', 'email'), queryFn: () => api.providers.email.list(orgId!), enabled: !!orgId, staleTime: 60_000 });
}

export function useSmsProviders(orgId: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: qk.providers(orgId ?? '', 'sms'), queryFn: () => api.providers.sms.list(orgId!), enabled: !!orgId, staleTime: 60_000 });
}

export function useWebhooks(orgId: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: qk.webhooks(orgId ?? ''), queryFn: () => api.webhooks.list(orgId!), enabled: !!orgId, staleTime: 60_000 });
}
