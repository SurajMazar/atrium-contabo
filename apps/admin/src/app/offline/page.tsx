import { AtriumMark } from '@/components/auth/auth-layout';

export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <AtriumMark className="size-8" />
      <h1 className="mt-2 text-lg font-semibold text-fg">You’re offline</h1>
      <p className="max-w-sm text-sm text-fg-muted">Atrium needs a connection to load your websites. This page will work again as soon as you’re back online.</p>
    </div>
  );
}
