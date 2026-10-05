import type { ReactNode } from 'react';
import { FocusShell } from '@/components/create/focus-shell';

export default function FocusLayout({ children }: { children: ReactNode }) {
  return <FocusShell>{children}</FocusShell>;
}
