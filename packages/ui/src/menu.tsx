import { Check, ChevronRight } from 'lucide-react';
import { ContextMenu as C, DropdownMenu as M } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './utils';

const contentCls = 'z-50 min-w-[180px] overflow-hidden rounded-md border border-border bg-surface p-1 text-sm text-fg shadow-popover animate-fade-in';
const itemCls =
  'relative flex h-7 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ' +
  'data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5] [&_svg]:text-fg-muted';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;
export const DropdownMenuSub = M.Sub;
export const DropdownMenuRadioGroup = M.RadioGroup;

export const DropdownMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof M.Content>>(function DropdownMenuContent({ className, sideOffset = 4, align = 'start', ...props }, ref) {
  return (
    <M.Portal>
      <M.Content ref={ref} sideOffset={sideOffset} align={align} className={cn(contentCls, className)} {...props} />
    </M.Portal>
  );
});

export interface MenuItemProps extends ComponentPropsWithoutRef<typeof M.Item> {
  icon?: ReactNode;
  shortcut?: ReactNode;
  tone?: 'default' | 'danger';
}

export const DropdownMenuItem = forwardRef<HTMLDivElement, MenuItemProps>(function DropdownMenuItem({ className, icon, shortcut, tone, children, ...props }, ref) {
  return (
    <M.Item ref={ref} className={cn(itemCls, tone === 'danger' && 'text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft', className)} {...props}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="ml-4 text-xs text-fg-subtle">{shortcut}</span>}
    </M.Item>
  );
});

export const DropdownMenuCheckboxItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof M.CheckboxItem>>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <M.CheckboxItem ref={ref} className={cn(itemCls, 'pl-7', className)} {...props}>
      <M.ItemIndicator className="absolute left-2 flex items-center">
        <Check className="size-3.5 !text-accent" strokeWidth={2} />
      </M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  );
});

export const DropdownMenuRadioItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof M.RadioItem>>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <M.RadioItem ref={ref} className={cn(itemCls, 'pl-7', className)} {...props}>
      <M.ItemIndicator className="absolute left-2 flex items-center">
        <span className="size-1.5 rounded-full bg-accent" />
      </M.ItemIndicator>
      {children}
    </M.RadioItem>
  );
});

export function DropdownMenuLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <M.Label className={cn('px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle', className)}>{children}</M.Label>;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <M.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} />;
}

export function DropdownMenuSubTrigger({ className, icon, children, ...props }: ComponentPropsWithoutRef<typeof M.SubTrigger> & { icon?: ReactNode }) {
  return (
    <M.SubTrigger className={cn(itemCls, 'data-[state=open]:bg-surface-2', className)} {...props}>
      {icon}
      <span className="flex-1">{children}</span>
      <ChevronRight className="ml-auto size-3.5" />
    </M.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentPropsWithoutRef<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent className={cn(contentCls, className)} {...props} />
    </M.Portal>
  );
}

/* ------------------------------------------------------------ ContextMenu */

export const ContextMenu = C.Root;
export const ContextMenuTrigger = C.Trigger;

export const ContextMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof C.Content>>(function ContextMenuContent({ className, ...props }, ref) {
  return (
    <C.Portal>
      <C.Content ref={ref} className={cn(contentCls, className)} {...props} />
    </C.Portal>
  );
});

export const ContextMenuItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof C.Item> & { icon?: ReactNode; shortcut?: ReactNode; tone?: 'default' | 'danger' }>(function ContextMenuItem(
  { className, icon, shortcut, tone, children, ...props },
  ref,
) {
  return (
    <C.Item ref={ref} className={cn(itemCls, tone === 'danger' && 'text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft', className)} {...props}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="ml-4 text-xs text-fg-subtle">{shortcut}</span>}
    </C.Item>
  );
});

export function ContextMenuSeparator() {
  return <C.Separator className="-mx-1 my-1 h-px bg-border" />;
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return <C.Label className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{children}</C.Label>;
}
