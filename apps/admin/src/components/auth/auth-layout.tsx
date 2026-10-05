import Link from 'next/link';
import type { ReactNode } from 'react';

export function AtriumMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="112" className="fill-fg" />
      <path d="M168 384V248a88 88 0 0 1 176 0v136" fill="none" className="stroke-bg" strokeWidth="40" strokeLinecap="square" />
      <path d="M228 384v-96a28 28 0 0 1 56 0v96" fill="none" className="stroke-accent" strokeWidth="24" />
    </svg>
  );
}

export function AuthFrame({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md text-sm font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <AtriumMark />
          Atrium
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]">
        <div className="w-full max-w-[360px]">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t border-border pt-4 text-sm text-fg-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
