import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/builder/builder.css';
import { PasswordChangeGate } from '@/components/account/password-change-gate';

export const metadata: Metadata = { title: 'Editor' };

/** Full-screen builder layout: no admin sidebar or shell chrome. */
export default function BuilderLayout({ children }: { children: ReactNode }) {
  return (
    <PasswordChangeGate>
      <div className="fixed inset-0 overflow-hidden">{children}</div>
    </PasswordChangeGate>
  );
}
