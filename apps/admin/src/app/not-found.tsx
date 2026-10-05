import Link from 'next/link';
import { AtriumMark } from '@/components/auth/auth-layout';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <AtriumMark className="size-8" />
      <p className="mt-2 font-mono text-xs text-fg-subtle">404</p>
      <h1 className="text-lg font-semibold text-fg">This page doesn’t exist</h1>
      <p className="max-w-sm text-sm text-fg-muted">The link may be broken, or the page may have been moved or deleted.</p>
      <Link href="/" className="mt-2 inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg shadow-xs hover:bg-surface-2">
        Back to Atrium
      </Link>
    </div>
  );
}
