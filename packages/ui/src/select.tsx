import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Select as S } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn, controlHeight, fieldBase } from './utils';

export interface SelectOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[] | Array<{ label: string; options: SelectOption[] }>;
  placeholder?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  className?: string;
  contentClassName?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const heights = { xs: `${controlHeight.xs} text-xs`, sm: `${controlHeight.sm} text-sm`, md: `${controlHeight.md} text-sm`, lg: `${controlHeight.lg} text-sm` } as const;

function isGrouped(o: SelectProps['options']): o is Array<{ label: string; options: SelectOption[] }> {
  return o.length > 0 && 'options' in (o[0] as object);
}

/** Radix Select with a flat `options` API. Empty-string values are not allowed by Radix; use a sentinel like "none". */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { value, defaultValue, onValueChange, options, placeholder = 'Select…', size = 'md', disabled, invalid, id, name, className, contentClassName, ...aria },
  ref,
) {
  return (
    <S.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled} name={name}>
      <S.Trigger
        ref={ref}
        id={id}
        aria-invalid={invalid || undefined}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        className={cn(fieldBase, heights[size], 'inline-flex items-center justify-between gap-2 text-left data-[placeholder]:text-fg-subtle data-[state=open]:border-accent data-[state=open]:ring-2 data-[state=open]:ring-ring', 'pl-2.5 pr-2', className)}
      >
        <span className="truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon className="shrink-0 text-fg-subtle">
          <ChevronDown className="size-3.5" strokeWidth={1.5} />
        </S.Icon>
      </S.Trigger>
      <SelectContent className={contentClassName}>
        {isGrouped(options)
          ? options.map((g, gi) => (
              <S.Group key={gi}>
                {gi > 0 && <S.Separator className="my-1 h-px bg-border" />}
                <S.Label className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{g.label}</S.Label>
                {g.options.map((o) => (
                  <SelectItem key={o.value} {...o} />
                ))}
              </S.Group>
            ))
          : (options as SelectOption[]).map((o) => <SelectItem key={o.value} {...o} />)}
      </SelectContent>
    </S.Root>
  );
});

export function SelectContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof S.Content>) {
  return (
    <S.Portal>
      <S.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 max-h-[min(var(--radix-select-content-available-height),320px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface text-sm shadow-popover animate-fade-in',
          className,
        )}
        {...props}
      >
        <S.ScrollUpButton className="flex h-5 items-center justify-center text-fg-subtle">
          <ChevronUp className="size-3.5" />
        </S.ScrollUpButton>
        <S.Viewport className="p-1">{children}</S.Viewport>
        <S.ScrollDownButton className="flex h-5 items-center justify-center text-fg-subtle">
          <ChevronDown className="size-3.5" />
        </S.ScrollDownButton>
      </S.Content>
    </S.Portal>
  );
}

export function SelectItem({ value, label, description, disabled, icon }: SelectOption) {
  return (
    <S.Item
      value={value}
      disabled={disabled}
      className="relative flex min-h-7 cursor-default select-none items-start gap-2 rounded-sm py-1 pl-2 pr-7 text-sm leading-5 text-fg outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2"
    >
      {icon && <span className="mt-0.5 shrink-0 text-fg-muted [&_svg]:size-4 [&_svg]:stroke-[1.5]">{icon}</span>}
      <div className="min-w-0">
        <S.ItemText>{label}</S.ItemText>
        {description && <div className="text-xs text-fg-muted">{description}</div>}
      </div>
      <S.ItemIndicator className="absolute right-2 top-[7px] text-accent">
        <Check className="size-3.5" strokeWidth={2} />
      </S.ItemIndicator>
    </S.Item>
  );
}

/** Native select for very long lists or where a portal is undesirable. */
export const NativeSelect = forwardRef<HTMLSelectElement, Omit<ComponentPropsWithoutRef<'select'>, 'size'> & { size?: 'xs' | 'sm' | 'md' | 'lg'; invalid?: boolean }>(function NativeSelect(
  { className, size = 'md', invalid, children, ...props },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(fieldBase, controlHeight[size], 'px-2 text-sm', className)} {...props}>
      {children}
    </select>
  );
});
