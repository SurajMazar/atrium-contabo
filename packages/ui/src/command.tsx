'use client';
import { Command as Cmdk } from 'cmdk';
import { Search } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Kbd } from './feedback';
import { cn } from './utils';

/** cmdk primitives with Atrium styling. */
export const Command = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Cmdk>>(function Command({ className, ...props }, ref) {
  return <Cmdk ref={ref} className={cn('flex size-full flex-col overflow-hidden bg-surface text-fg', className)} {...props} />;
});

export const CommandInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof Cmdk.Input>>(function CommandInput({ className, ...props }, ref) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3">
      <Search className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.5} />
      <Cmdk.Input ref={ref} className={cn('h-11 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle', className)} {...props} />
    </div>
  );
});

export const CommandList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Cmdk.List>>(function CommandList({ className, ...props }, ref) {
  return <Cmdk.List ref={ref} className={cn('max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain p-1', className)} {...props} />;
});

export function CommandEmpty({ children = 'No results' }: { children?: ReactNode }) {
  return <Cmdk.Empty className="px-3 py-8 text-center text-sm text-fg-muted">{children}</Cmdk.Empty>;
}

export function CommandLoading({ children = 'Searching…' }: { children?: ReactNode }) {
  return <Cmdk.Loading className="px-3 py-3 text-sm text-fg-muted">{children}</Cmdk.Loading>;
}

export const CommandGroup = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Cmdk.Group>>(function CommandGroup({ className, ...props }, ref) {
  return (
    <Cmdk.Group
      ref={ref}
      className={cn('[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle', className)}
      {...props}
    />
  );
});

export interface CommandItemProps extends ComponentPropsWithoutRef<typeof Cmdk.Item> {
  icon?: ReactNode;
  shortcut?: string[];
  hint?: ReactNode;
}

export const CommandItem = forwardRef<HTMLDivElement, CommandItemProps>(function CommandItem({ className, icon, shortcut, hint, children, ...props }, ref) {
  return (
    <Cmdk.Item
      ref={ref}
      className={cn(
        'flex h-8 cursor-default select-none items-center gap-2.5 rounded-sm px-2 text-sm text-fg outline-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-surface-2',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5] [&_svg]:text-fg-muted',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="truncate text-xs text-fg-subtle">{hint}</span>}
      {shortcut && (
        <span className="flex gap-0.5">
          {shortcut.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      )}
    </Cmdk.Item>
  );
});

export function CommandSeparator() {
  return <Cmdk.Separator className="-mx-1 my-1 h-px bg-border" />;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  search?: string;
  onSearchChange?: (v: string) => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Disable cmdk's built-in filtering (for async search). */
  shouldFilter?: boolean;
}

/** Modal command palette (⌘K). Compose with CommandGroup/CommandItem. */
export function CommandPalette({ open, onOpenChange, placeholder = 'Type a command or search…', search, onSearchChange, children, footer, shouldFilter }: CommandPaletteProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/25 animate-fade-in" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-dialog outline-none animate-slide-up">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search for pages, websites and actions</D.Description>
          <Command loop shouldFilter={shouldFilter}>
            <CommandInput placeholder={placeholder} value={search} onValueChange={onSearchChange} autoFocus />
            <CommandList>{children}</CommandList>
            <div className="flex items-center gap-3 border-t border-border bg-surface-2/50 px-3 py-1.5 text-2xs text-fg-subtle">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> select
              </span>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd> close
              </span>
              {footer && <span className="ml-auto">{footer}</span>}
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
