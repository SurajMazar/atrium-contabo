'use client';
import { Toaster as Sonner, toast } from 'sonner';

export { toast };

/** App-wide toaster; theme follows `[data-theme]` via CSS variables. */
export function Toaster({ theme = 'system' }: { theme?: 'light' | 'dark' | 'system' }) {
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      gap={8}
      visibleToasts={4}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            '!rounded-md !border !border-border !bg-surface !text-fg !shadow-popover !text-sm !py-2.5 !px-3 !gap-2 !font-sans',
          title: '!text-sm !font-medium',
          description: '!text-xs !text-fg-muted',
          actionButton: '!bg-accent !text-accent-fg !rounded-sm !text-xs !h-6',
          cancelButton: '!bg-surface-2 !text-fg !rounded-sm !text-xs !h-6',
          closeButton: '!bg-surface !border-border !text-fg-muted',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
          warning: '[&_[data-icon]]:!text-warning',
        },
      }}
    />
  );
}
