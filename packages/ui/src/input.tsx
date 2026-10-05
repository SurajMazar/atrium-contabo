import { Label as LabelPrimitive } from 'radix-ui';
import { cloneElement, forwardRef, isValidElement, useId, type ComponentPropsWithoutRef, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn, fieldBase } from './utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: 'sm' | 'md';
  /** Icon or text rendered inside the field on the left. */
  prefix?: ReactNode;
  /** Icon, text or button rendered inside the field on the right. */
  suffix?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, size = 'md', prefix, suffix, invalid, ...props }, ref) {
  const h = size === 'sm' ? 'h-7 text-sm' : 'h-8 text-sm';
  if (!prefix && !suffix) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(fieldBase, h, 'px-2.5', className)} {...props} />;
  }
  return (
    <div className={cn('relative flex items-center', className)}>
      {prefix && <span className="pointer-events-none absolute left-2.5 flex items-center text-fg-subtle [&_svg]:size-4 [&_svg]:stroke-[1.5]">{prefix}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, h, prefix ? 'pl-8' : 'pl-2.5', suffix ? 'pr-8' : 'pr-2.5')}
        {...props}
      />
      {suffix && <span className="absolute right-1.5 flex items-center text-fg-subtle [&_svg]:size-4 [&_svg]:stroke-[1.5]">{suffix}</span>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, invalid, mono, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, 'min-h-[60px] resize-y px-2.5 py-1.5 text-sm leading-5', mono && 'font-mono text-xs', className)}
      {...props}
    />
  );
});

export const Label = forwardRef<HTMLLabelElement, ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(function Label({ className, ...props }, ref) {
  return <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium text-fg select-none', className)} {...props} />;
});

export interface FieldProps {
  label?: ReactNode;
  /** Shown under the control in muted text. */
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  /** Right-aligned element next to the label (e.g. a link or counter). */
  hint?: ReactNode;
  htmlFor?: string;
  className?: string;
  /** Horizontal layout: label left, control right (settings rows). */
  inline?: boolean;
  children: ReactNode;
}

/**
 * Label + control + help/error. When `children` is a single element without an
 * `id`, an id is generated and wired to the label and `aria-describedby`.
 */
export function Field({ label, help, error, required, optional, hint, htmlFor, className, inline, children }: FieldProps) {
  const auto = useId();
  let id = htmlFor;
  let control = children;
  const describedBy = error ? `${auto}-error` : help ? `${auto}-help` : undefined;
  if (isValidElement(children)) {
    const el = children as ReactElement<{ id?: string; 'aria-describedby'?: string; invalid?: boolean }>;
    id = id ?? el.props.id ?? auto;
    control = cloneElement(el, {
      id,
      'aria-describedby': [el.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
      ...(error ? { invalid: true } : {}),
    });
  }
  const labelNode = label ? (
    <div className="flex min-h-5 items-center justify-between gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        {optional && <span className="ml-1.5 font-normal text-fg-subtle">Optional</span>}
      </Label>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  ) : null;
  const messages = (
    <>
      {error ? (
        <p id={`${auto}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : help ? (
        <p id={`${auto}-help`} className="text-xs text-fg-muted">
          {help}
        </p>
      ) : null}
    </>
  );
  if (inline) {
    return (
      <div className={cn('grid gap-x-6 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-start', className)}>
        <div className="space-y-0.5 pt-1">
          {labelNode}
          {help && !error && <p className="text-xs text-fg-muted">{help}</p>}
        </div>
        <div className="space-y-1.5">
          {control}
          {error && <p id={`${auto}-error`} className="text-xs text-danger">{error}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {labelNode}
      {control}
      {messages}
    </div>
  );
}

/** Groups related fields under a heading, settings-page style. */
export function FieldGroup({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-fg">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}
