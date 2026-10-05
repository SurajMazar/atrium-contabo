import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Slider as SliderPrimitive, Switch as SwitchPrimitive, ToggleGroup } from 'radix-ui';
import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './utils';

export interface CheckboxProps extends Omit<ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'onChange'> {
  label?: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox({ className, label, description, id, ...props }, ref) {
  const auto = useId();
  const cid = id ?? auto;
  const box = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={cid}
      className={cn(
        'peer flex size-4 shrink-0 items-center justify-center rounded-xs border border-border-strong bg-surface transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-accent-fg',
        !label && className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        {props.checked === 'indeterminate' ? <Minus className="size-3" strokeWidth={2.5} /> : <Check className="size-3" strokeWidth={2.5} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!label) return box;
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <div className="pt-0.5">{box}</div>
      <label htmlFor={cid} className="cursor-pointer select-none text-sm leading-5 text-fg">
        {label}
        {description && <span className="block text-xs text-fg-muted">{description}</span>}
      </label>
    </div>
  );
});

export interface SwitchProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md';
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch({ className, label, description, size = 'md', id, ...props }, ref) {
  const auto = useId();
  const sid = id ?? auto;
  const sw = (
    <SwitchPrimitive.Root
      ref={ref}
      id={sid}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent',
        size === 'sm' ? 'h-3.5 w-6' : 'h-4 w-7',
        !label && className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block rounded-full bg-white shadow-xs transition-transform',
          size === 'sm' ? 'size-2.5 translate-x-0.5 data-[state=checked]:translate-x-[11px]' : 'size-3 translate-x-0.5 data-[state=checked]:translate-x-[13px]',
        )}
      />
    </SwitchPrimitive.Root>
  );
  if (!label) return sw;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={sid} className="min-w-0 cursor-pointer select-none text-sm text-fg">
        {label}
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </label>
      <div className="pt-0.5">{sw}</div>
    </div>
  );
});

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps extends Omit<ComponentPropsWithoutRef<typeof RadioPrimitive.Root>, 'children'> {
  options: RadioOption[];
  /** Card-style options with borders (good for 2–4 choices with descriptions). */
  variant?: 'default' | 'cards';
}

export function RadioGroup({ options, className, variant = 'default', ...props }: RadioGroupProps) {
  const base = useId();
  return (
    <RadioPrimitive.Root className={cn(variant === 'cards' ? 'grid gap-2' : 'flex flex-col gap-2', className)} {...props}>
      {options.map((o) => {
        const id = `${base}-${o.value}`;
        return (
          <label
            key={o.value}
            htmlFor={id}
            className={cn(
              'flex cursor-pointer items-start gap-2 text-sm',
              variant === 'cards' && 'rounded-md border border-border bg-surface px-3 py-2.5 hover:border-border-strong has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent-soft/40',
              o.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <RadioPrimitive.Item
              id={id}
              value={o.value}
              disabled={o.disabled}
              className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-accent"
            >
              <RadioPrimitive.Indicator className="size-2 rounded-full bg-accent" />
            </RadioPrimitive.Item>
            <span className="min-w-0">
              <span className="text-fg">{o.label}</span>
              {o.description && <span className="mt-0.5 block text-xs text-fg-muted">{o.description}</span>}
            </span>
          </label>
        );
      })}
    </RadioPrimitive.Root>
  );
}

export interface SegmentedOption<T extends string = string> {
  value: T;
  label?: ReactNode;
  icon?: ReactNode;
  /** Accessible label when only an icon is shown. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  fullWidth?: boolean;
}

export function SegmentedControl<T extends string = string>({ value, onValueChange, options, size = 'sm', className, fullWidth, ...aria }: SegmentedControlProps<T>) {
  const h = size === 'xs' ? 'h-6 text-xs' : size === 'sm' ? 'h-7 text-sm' : 'h-8 text-sm';
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={aria['aria-label']}
      className={cn('inline-flex items-center gap-0.5 rounded-md bg-surface-3/70 p-0.5', fullWidth && 'flex w-full', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          aria-label={o.ariaLabel}
          title={o.ariaLabel}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-sm px-2 font-medium text-fg-muted transition-colors outline-none',
            'hover:text-fg focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-sm disabled:opacity-50',
            '[&_svg]:size-3.5 [&_svg]:stroke-[1.5]',
            h,
            size === 'xs' ? 'h-5' : size === 'sm' ? 'h-6' : 'h-7',
            fullWidth && 'flex-1',
          )}
        >
          {o.icon}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export interface SliderProps extends Omit<ComponentPropsWithoutRef<typeof SliderPrimitive.Root>, 'value' | 'defaultValue' | 'onValueChange'> {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  showValue?: boolean;
  format?: (v: number) => string;
}

export function Slider({ value, defaultValue, onValueChange, className, showValue, format = String, ...props }: SliderProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <SliderPrimitive.Root
        value={value === undefined ? undefined : [value]}
        defaultValue={defaultValue === undefined ? undefined : [defaultValue]}
        onValueChange={(v) => onValueChange?.(v[0] ?? 0)}
        className="relative flex h-4 flex-1 touch-none select-none items-center"
        {...props}
      >
        <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-surface-3">
          <SliderPrimitive.Range className="absolute h-full bg-accent" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-3.5 rounded-full border border-border-strong bg-surface shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </SliderPrimitive.Root>
      {showValue && <span className="w-10 text-right font-mono text-xs tabular-nums text-fg-muted">{format(value ?? defaultValue ?? 0)}</span>}
    </div>
  );
}
