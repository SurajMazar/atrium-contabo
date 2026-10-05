import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Slider as SliderPrimitive, Switch as SwitchPrimitive, ToggleGroup } from 'radix-ui';
import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn, controlHeight } from './utils';

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
        'peer flex size-4 shrink-0 items-center justify-center rounded-xs border border-border-strong bg-surface shadow-xs transition-colors duration-75 hover:border-fg-subtle',
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
      <div className="flex h-5 items-center">{box}</div>
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
  /** Put the switch before the label (default: label left, switch right). */
  labelPosition?: 'start' | 'end';
}

const switchSizes = {
  // track w × h, thumb, travel = w − 2·2px − thumb
  sm: { track: 'h-4 w-[26px]', thumb: 'size-3 data-[state=checked]:translate-x-[10px]' },
  md: { track: 'h-[18px] w-8', thumb: 'size-3.5 data-[state=checked]:translate-x-[14px]' },
} as const;

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch({ className, label, description, size = 'md', labelPosition = 'start', id, ...props }, ref) {
  const auto = useId();
  const sid = id ?? auto;
  const sz = switchSizes[size];
  const sw = (
    <SwitchPrimitive.Root
      ref={ref}
      id={sid}
      className={cn(
        'group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full bg-track p-0.5 transition-colors duration-100',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
        'hover:bg-border-strong data-[state=checked]:bg-accent data-[state=checked]:hover:bg-accent/90',
        'disabled:cursor-not-allowed disabled:opacity-50',
        sz.track,
        !label && className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block translate-x-0 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.22),0_0_0_0.5px_rgb(0_0_0/0.06)] transition-transform duration-150 ease-out',
          sz.thumb,
        )}
      />
    </SwitchPrimitive.Root>
  );
  if (!label) return sw;
  const text = (
    <label htmlFor={sid} className={cn('min-w-0 cursor-pointer select-none text-sm leading-5 text-fg', props.disabled && 'cursor-not-allowed opacity-60')}>
      {label}
      {description && <span className="mt-0.5 block text-xs leading-4 text-fg-muted">{description}</span>}
    </label>
  );
  // With a description the switch centres on the first text line (20px);
  // without one, label and switch share the same centre line.
  const swWrap = description ? <div className={cn('flex h-5 shrink-0 items-center')}>{sw}</div> : sw;
  return (
    <div className={cn('flex gap-3', description ? 'items-start' : 'items-center', labelPosition === 'start' ? 'justify-between' : 'justify-start', className)}>
      {labelPosition === 'start' ? (
        <>
          {text}
          {swWrap}
        </>
      ) : (
        <>
          {swWrap}
          {text}
        </>
      )}
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
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
  fullWidth?: boolean;
}

export function SegmentedControl<T extends string = string>({ value, onValueChange, options, size = 'sm', className, fullWidth, ...aria }: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={aria['aria-label']}
      className={cn('inline-flex shrink-0 items-stretch gap-0.5 rounded-md bg-seg p-0.5', controlHeight[size], fullWidth && 'flex w-full', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          aria-label={o.ariaLabel}
          title={o.ariaLabel}
          className={cn(
            'inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-md)-2px)] font-medium text-fg-muted outline-none transition-colors duration-75',
            'hover:text-fg focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-seg-on data-[state=on]:text-fg data-[state=on]:shadow-sm disabled:opacity-50',
            '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]',
            size === 'xs' ? 'px-1.5 text-xs' : 'px-2 text-sm',
            o.label ? '' : 'aspect-square px-0',
            fullWidth && 'flex-1',
          )}
        >
          {o.icon}
          {o.label !== undefined && <span className="truncate">{o.label}</span>}
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
