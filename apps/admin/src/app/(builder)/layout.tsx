import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/builder/builder.css';

export const metadata: Metadata = { title: 'Editor' };

/** Full-screen builder layout: no admin sidebar or shell chrome. */
export default function BuilderLayout({ children }: { children: ReactNode }) {
  return <div className="fixed inset-0 overflow-hidden">{children}</div>;
}
