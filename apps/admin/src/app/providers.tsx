'use client';

import { AtriumApiError } from '@atrium/sdk';
import { Toaster, TooltipProvider } from '@atrium/ui';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useState, type ReactNode } from 'react';
import { AuthRedirect } from '@/components/auth/auth-redirect';
import { OfflineBanner } from '@/components/shell/offline-banner';
import { SessionProvider } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/lib/theme';

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          if (err instanceof AtriumApiError && err.status >= 400 && err.status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} />;
}

/**
 * Root client providers shared by the admin and the builder:
 * TanStack Query, session/auth, theme, tooltips and toasts.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SessionProvider>
          <TooltipProvider delayDuration={400} skipDelayDuration={200}>
            <Suspense fallback={null}>
              <AuthRedirect />
            </Suspense>
            <OfflineBanner />
            {children}
            <ThemedToaster />
          </TooltipProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
