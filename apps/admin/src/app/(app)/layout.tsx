import type { ReactNode } from 'react';
import { PasswordChangeGate } from '@/components/account/password-change-gate';
import { AppShell } from '@/components/shell/app-shell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PasswordChangeGate>
      <AppShell>{children}</AppShell>
    </PasswordChangeGate>
  );
}
