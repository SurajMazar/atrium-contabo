import { X } from 'lucide-react';
import { Dialog as D, Popover as P, Tooltip as T } from 'radix-ui';
import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Button } from './button';
import { cn } from './utils';

/* ------------------------------------------------------------------ Dialog */

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof D.Content> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  hideClose?: boolean;
}

const dialogSizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-[min(1200px,calc(100vw-32px))] h-[calc(100vh-64px)]' } as const;

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent({ className, size = 'md', hideClose, children, ...props }, ref) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/30 animate-fade-in data-[state=closed]:opacity-0" />
      <D.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-[max(32px,10vh)] z-50 flex max-h-[calc(100vh-64px)] w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-dialog outline-none animate-slide-up',
          size === 'full' && 'top-8',
          dialogSizes[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <D.Close className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-fg-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
            <X className="size-4" strokeWidth={1.5} />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
});

export function DialogHeader({ title, description, className, children }: { title: ReactNode; description?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('shrink-0 border-b border-border px-5 pb-3 pt-4 pr-12', className)}>
      <D.Title className="text-base font-semibold text-fg">{title}</D.Title>
      {description ? <D.Description className="mt-1 text-sm text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>}
      {children}
    </div>
  );
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3', className)}>{children}</div>;
}

/* ------------------------------------------------------------- Sheet/Drawer */

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

export interface SheetContentProps extends Omit<ComponentPropsWithoutRef<typeof D.Content>, 'title'> {
  side?: 'right' | 'left';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  title?: ReactNode;
  description?: ReactNode;
  /** Header actions placed left of the close button. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Render without modal overlay (inspector-style). */
  bodyClassName?: string;
}

const sheetSizes = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' } as const;

export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(function SheetContent(
  { side = 'right', size = 'md', title, description, actions, footer, className, bodyClassName, children, ...props },
  ref,
) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/20 animate-fade-in" />
      <D.Content
        ref={ref}
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col border-border bg-surface text-fg shadow-dialog outline-none animate-fade-in',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          sheetSizes[size],
          className,
        )}
        {...props}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-4 pr-2">
          <div className="min-w-0 flex-1">
            <D.Title className="truncate text-sm font-semibold">{title ?? ''}</D.Title>
            {description ? <D.Description className="truncate text-xs text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">Panel</D.Description>}
          </div>
          {actions}
          <D.Close className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
            <X className="size-4" strokeWidth={1.5} />
          </D.Close>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName ?? 'p-4')}>{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
});

/* ----------------------------------------------------------------- Popover */

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export const PopoverContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof P.Content>>(function PopoverContent({ className, align = 'start', sideOffset = 4, ...props }, ref) {
  return (
    <P.Portal>
      <P.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 w-72 rounded-md border border-border bg-surface p-3 text-sm text-fg shadow-popover outline-none animate-fade-in', className)}
        {...props}
      />
    </P.Portal>
  );
});

/* ----------------------------------------------------------------- Tooltip */

export const TooltipProvider = T.Provider;

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  shortcut?: ReactNode;
  disabled?: boolean;
  delayDuration?: number;
}

export function Tooltip({ content, children, side = 'top', align = 'center', shortcut, disabled, delayDuration }: TooltipProps) {
  if (disabled || !content) return <>{children}</>;
  return (
    <T.Root delayDuration={delayDuration}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          align={align}
          sideOffset={6}
          className="z-[60] flex max-w-xs items-center gap-2 rounded-sm bg-fg px-2 py-1 text-xs text-bg shadow-popover animate-fade-in"
        >
          {content}
          {shortcut && <span className="text-bg/60">{shortcut}</span>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/* ----------------------------------------------------------- ConfirmDialog */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** Require typing this text to enable confirm (destructive actions). */
  confirmText?: string;
  onConfirm: () => void | Promise<unknown>;
  children?: ReactNode;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', confirmText, onConfirm, children }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const blocked = confirmText !== undefined && typed !== confirmText;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTyped('');
        onOpenChange(o);
      }}
    >
      <DialogContent size="sm" hideClose role="alertdialog">
        <div className="px-5 pb-4 pt-5">
          <D.Title className="text-base font-semibold text-fg">{title}</D.Title>
          {description ? <D.Description className="mt-1.5 text-sm text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">Confirm action</D.Description>}
          {children}
          {confirmText !== undefined && (
            <div className="mt-4 space-y-1.5">
              <label className="text-xs text-fg-muted" htmlFor="confirm-text">
                Type <span className="font-mono font-medium text-fg">{confirmText}</span> to confirm
              </label>
              <input
                id="confirm-text"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            size="sm"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            disabled={blocked}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
                setTyped('');
              } catch {
                /* caller surfaces the error; keep dialog open */
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
