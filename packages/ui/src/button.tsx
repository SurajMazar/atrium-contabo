import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn, controlHeight, controlSize } from './utils';
import { Spinner } from './feedback';

export const buttonVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow] duration-75 ' +
    'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg shadow-xs hover:bg-accent/90 active:bg-accent/85 disabled:bg-surface-3 disabled:text-fg-muted disabled:opacity-100 disabled:shadow-none',
        secondary: 'border border-border bg-surface text-fg shadow-xs hover:border-border-strong hover:bg-surface-2 active:bg-surface-3',
        outline: 'border border-border-strong bg-transparent text-fg hover:bg-surface-2',
        ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-3',
        danger: 'bg-danger text-white shadow-xs hover:bg-danger/90 active:bg-danger/85',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'h-auto px-0 text-accent underline-offset-2 hover:underline',
      },
      size: {
        xs: `${controlHeight.xs} px-2 text-xs [&_svg]:size-3.5`,
        sm: `${controlHeight.sm} px-2.5 text-sm [&_svg]:size-3.5`,
        md: `${controlHeight.md} px-3 text-sm`,
        lg: `${controlHeight.lg} px-4 text-base`,
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, asChild, leadingIcon, trailingIcon, children, disabled, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  if (asChild) {
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {leadingIcon}
        <Slot.Slottable>{children}</Slot.Slottable>
        {trailingIcon}
      </Comp>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});

const iconSizes = controlSize;

export interface IconButtonProps extends Omit<ButtonProps, 'leadingIcon' | 'trailingIcon'> {
  /** Accessible label (also used as the native tooltip). */
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, size = 'sm', variant = 'ghost', children, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      className={cn('px-0', iconSizes[size ?? 'sm'], className)}
      {...props}
    >
      {children}
    </Button>
  );
});
