'use client';

import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[70] flex h-7 items-center justify-center gap-2 bg-fg text-xs text-bg">
      <WifiOff className="size-3.5" strokeWidth={1.5} />
      You’re offline. Changes will fail until your connection returns.
    </div>
  );
}
