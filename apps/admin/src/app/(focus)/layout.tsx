import type { ReactNode } from 'react';
import { PasswordChangeGate } from '@/components/account/password-change-gate';
import { FocusShell } from '@/components/create/focus-shell';

export default function FocusLayout({ children }: { children: ReactNode }) {
  return (
    <PasswordChangeGate>
      <FocusShell>{children}</FocusShell>
    </PasswordChangeGate>
  );
}
