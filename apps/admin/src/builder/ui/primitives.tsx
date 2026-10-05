'use client';

import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import { Dialog as D, DropdownMenu as M, Popover as P, Slider as S, Switch as SW, Tooltip as T } from 'radix-ui';
import {
  forwardRef, memo, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

/* ───────────── icon ───────────── */

const ICON_SET = new Set<string>(iconNames);
export function isIconName(name: string | undefined | null): name is IconName {
  return !!name && ICON_SET.has(name);
}

export const Icon = memo(function Icon({ name, className, size = 16, strokeWidth = 1.5 }: { name: string | undefined; className?: string; size?: number; strokeWidth?: number }) {
  if (!isIconName(name)) return <span className={cn('inline-block shrink-0', className)} style={{ width: size, height: size }} />;
  return <DynamicIcon name={name} size={size} strokeWidth={strokeWidth} className={cn('shrink-0', className)} />;
});

/* ───────────── button ───────────── */

type Variant = 'ghost' | 'secondary' | 'primary' | 'danger' | 'subtle';
const variants: Record<Variant, string> = {
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-3',
  subtle: 'bg-surface-2 text-fg hover:bg-surface-3',
  secondary: 'border border-border bg-surface text-fg hover:bg-surface-2',
  primary: 'bg-accent text-accent-fg hover:bg-accent/90',
  danger: 'text-danger hover:bg-danger-soft',
};

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'xs' | 'sm' | 'md';
  active?: boolean;
  icon?: ReactNode;
}

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn({ variant = 'ghost', size = 'sm', active, icon, className, children, type, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
        size === 'xs' ? 'h-6 px-1.5 text-xs' : size === 'sm' ? 'h-7 px-2' : 'h-8 px-3',
        variants[variant],
        active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconBtnProps extends Omit<BtnProps, 'icon'> {
  label: string;
  shortcut?: string;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export const IconBtn = forwardRef<HTMLButtonElement, IconBtnProps>(function IconBtn({ label, shortcut, tooltipSide = 'bottom', className, size = 'sm', children, ...props }, ref) {
  return (
    <Tip content={label} shortcut={shortcut} side={tooltipSide}>
      <Btn ref={ref} aria-label={label} size={size} className={cn(size === 'xs' ? 'w-6 px-0' : size === 'sm' ? 'w-7 px-0' : 'w-8 px-0', className)} {...props}>
        {children}
      </Btn>
    </Tip>
  );
});

/* ───────────── tooltip ───────────── */

export const TipProvider = T.Provider;

export function Tip({ content, shortcut, side = 'bottom', children, disabled }: { content: ReactNode; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactNode; disabled?: boolean }) {
  if (disabled || !content) return <>{children}</>;
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[70] flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs text-bg shadow-popover animate-fade-in">
          {content}
          {shortcut && <span className="font-mono text-[11px] opacity-60">{shortcut}</span>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/* ───────────── inputs ───────────── */

const field =
  'w-full min-w-0 rounded-md border border-border bg-surface px-2 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-ring disabled:opacity-50';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; suffix?: ReactNode }>(function TextInput({ className, mono, suffix, ...props }, ref) {
  if (suffix) {
    return (
      <div className={cn('relative flex items-center', className)}>
        <input ref={ref} className={cn(field, 'h-7 pr-7', mono && 'font-mono text-xs')} {...props} />
        <span className="pointer-events-none absolute right-2 text-xs text-fg-subtle">{suffix}</span>
      </div>
    );
  }
  return <input ref={ref} className={cn(field, 'h-7', mono && 'font-mono text-xs', className)} {...props} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }>(function TextArea({ className, mono, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(field, 'resize-y py-1.5 leading-5', mono && 'font-mono text-xs', className)} {...props} />;
});

/**
 * Text field that keeps a local draft and commits after a short pause or on
 * blur, so typing never waits on the document store / canvas re-render.
 */
export function useDraftValue<T>(value: T, commit: (v: T) => void, delay = 160) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(commit);
  latest.current = commit;
  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (dirty.current) {
      dirty.current = false;
      latest.current(draftRef.current);
    }
  };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const change = (v: T) => {
    dirty.current = true;
    setDraft(v);
    draftRef.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { draft, change, flush };
}

export function CommitInput({ value, onCommit, multiline, rows, mono, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void; multiline?: boolean; rows?: number; mono?: boolean }) {
  const { draft, change, flush } = useDraftValue(value, onCommit);
  if (multiline) {
    return <TextArea value={draft} rows={rows} mono={mono} placeholder={props.placeholder} disabled={props.disabled} onChange={(e) => change(e.target.value)} onBlur={flush} className={props.className} />;
  }
  return <TextInput {...props} mono={mono} value={draft} onChange={(e) => change(e.target.value)} onBlur={flush} onKeyDown={(e) => { if (e.key === 'Enter') flush(); props.onKeyDown?.(e); }} />;
}

export function NumberInput({ value, onCommit, min, max, step = 1, unit, placeholder, disabled, className }: { value: number | undefined; onCommit: (v: number | undefined) => void; min?: number; max?: number; step?: number; unit?: string; placeholder?: string; disabled?: boolean; className?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    setText(value === undefined ? '' : String(value));
  }, [value]);
  const commit = (t: string) => {
    if (t.trim() === '') return onCommit(undefined);
    let n = Number(t);
    if (Number.isNaN(n)) return setText(value === undefined ? '' : String(value));
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onCommit(n);
  };
  return (
    <TextInput
      className={className}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      suffix={unit}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const base = Number(text) || 0;
          const mult = e.shiftKey ? 10 : 1;
          const next = Math.round((base + (e.key === 'ArrowUp' ? step : -step) * mult) * 1000) / 1000;
          setText(String(next));
          commit(String(next));
        }
      }}
    />
  );
}

export function NativeSelect({ value, onChange, options, placeholder, disabled, className }: { value: string | undefined; onChange: (v: string) => void; options: Array<{ label: string; value: string }>; placeholder?: string; disabled?: boolean; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(field, 'h-7 appearance-none pr-6', !value && 'text-fg-subtle')}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1.5 size-4 text-fg-subtle" />
    </div>
  );
}

export function Segmented<T extends string | number | boolean>({ value, onChange, options, disabled, className, size = 'sm' }: { value: T | undefined; onChange: (v: T) => void; options: Array<{ label: ReactNode; value: T; title?: string; icon?: string }>; disabled?: boolean; className?: string; size?: 'xs' | 'sm' }) {
  return (
    <div role="radiogroup" className={cn('flex w-full rounded-md bg-surface-2 p-0.5', disabled && 'opacity-50', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title ?? (typeof o.label === 'string' ? o.label : undefined)}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-[5px] px-1.5 font-medium transition-colors',
              size === 'xs' ? 'h-5 text-[11px]' : 'h-6 text-xs',
              on ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            {o.icon && isIconName(o.icon) ? <Icon name={o.icon} size={14} /> : o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <SW.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full bg-surface-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=checked]:bg-accent"
    >
      <SW.Thumb className="block size-3 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[14px]" />
    </SW.Root>
  );
}

export function RangeSlider({ value, onChange, onCommit, min = 0, max = 100, step = 1, disabled }: { value: number; onChange: (v: number) => void; onCommit?: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return (
    <S.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(v) => onChange(v[0]!)}
      onValueCommit={(v) => onCommit?.(v[0]!)}
    >
      <S.Track className="relative h-1 grow rounded-full bg-surface-3">
        <S.Range className="absolute h-full rounded-full bg-accent" />
      </S.Track>
      <S.Thumb className="block size-3.5 rounded-full border border-border-strong bg-surface shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </S.Root>
  );
}

/* ───────────── layout bits ───────────── */

export function Row({ label, children, indicator, actions, className, stacked, htmlFor, help }: { label: ReactNode; children: ReactNode; indicator?: ReactNode; actions?: ReactNode; className?: string; stacked?: boolean; htmlFor?: string; help?: string }) {
  if (stacked) {
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex h-5 items-center gap-1.5">
          <label htmlFor={htmlFor} className="min-w-0 flex-1 truncate text-xs text-fg-muted" title={help}>
            {label}
          </label>
          {indicator}
          {actions}
        </div>
        {children}
        {help && <p className="text-[11px] leading-4 text-fg-subtle">{help}</p>}
      </div>
    );
  }
  return (
    <div className={cn('grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2', className)}>
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={htmlFor} className="truncate text-xs text-fg-muted" title={help ?? (typeof label === 'string' ? label : undefined)}>
          {label}
        </label>
        {indicator}
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        {actions}
      </div>
    </div>
  );
}

export function Group({ title, children, defaultOpen = true, actions, className, id }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; actions?: ReactNode; className?: string; id?: string }) {
  const key = id ? `atrium.builder.group.${id}` : null;
  const [open, setOpen] = useState(() => {
    if (!key || typeof window === 'undefined') return defaultOpen;
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      if (key) {
        try {
          window.localStorage.setItem(key, o ? '0' : '1');
        } catch {
          /* ignore */
        }
      }
      return !o;
    });
  };
  return (
    <section className={cn('border-b border-border', className)}>
      <div className="flex h-9 items-center gap-1 px-3">
        <button type="button" onClick={toggle} className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-semibold text-fg outline-none">
          {open ? <ChevronDown className="size-3.5 text-fg-subtle" /> : <ChevronRight className="size-3.5 text-fg-subtle" />}
          <span className="truncate">{title}</span>
        </button>
        {actions}
      </div>
      {open && <div className="space-y-2.5 px-3 pb-3">{children}</div>}
    </section>
  );
}

export function PanelHeader({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex h-10 items-center gap-1 px-3">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[11px] text-fg-muted">{children}</kbd>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <div className="text-fg-subtle">{icon}</div>}
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {children && <div className="text-xs leading-5 text-fg-muted">{children}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-fg-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };
  return <span className={cn('inline-flex h-[18px] items-center rounded px-1.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

/* ───────────── overlays ───────────── */

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;
export const PopoverContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof P.Content>>(function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }, ref) {
  return (
    <P.Portal>
      <P.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn('z-[60] w-64 rounded-lg border border-border bg-surface p-3 text-[13px] text-fg shadow-popover outline-none animate-fade-in', className)}
        {...props}
      />
    </P.Portal>
  );
});

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof M.Content>>(function MenuContent({ className, sideOffset = 4, align = 'start', ...props }, ref) {
  return (
    <M.Portal>
      <M.Content ref={ref} sideOffset={sideOffset} align={align} collisionPadding={8} className={cn('z-[60] min-w-44 rounded-lg border border-border bg-surface p-1 text-[13px] shadow-popover animate-fade-in', className)} {...props} />
    </M.Portal>
  );
});
export function MenuItem({ icon, shortcut, danger, className, children, ...props }: ComponentPropsWithoutRef<typeof M.Item> & { icon?: ReactNode; shortcut?: string; danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex h-7 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-fg-muted',
        danger && 'text-danger [&_svg]:text-danger',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="font-mono text-[11px] text-fg-subtle">{shortcut}</span>}
    </M.Item>
  );
}
export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}
export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{children}</M.Label>;
}
export const MenuSub = M.Sub;
export function MenuSubTrigger({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <M.SubTrigger className="flex h-7 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] outline-none data-[highlighted]:bg-surface-2 data-[state=open]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-fg-muted">
      {icon}
      <span className="flex-1">{children}</span>
      <ChevronRight />
    </M.SubTrigger>
  );
}
export function MenuSubContent({ children }: { children: ReactNode }) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} className="z-[61] min-w-40 rounded-lg border border-border bg-surface p-1 shadow-popover animate-fade-in">
        {children}
      </M.SubContent>
    </M.Portal>
  );
}

export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md' }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[80] bg-black/30 animate-fade-in" />
        <D.Content
          className={cn(
            'fixed left-1/2 top-[12vh] z-[81] flex max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-dialog outline-none animate-slide-up',
            size === 'sm' ? 'max-w-sm' : size === 'md' ? 'max-w-lg' : 'max-w-2xl',
          )}
        >
          <div className="flex items-start gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <D.Title className="text-[14px] font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-xs text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 text-fg-muted hover:bg-surface-2" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Drawer({ open, onOpenChange, title, children, width = 360 }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; children: ReactNode; width?: number }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[80] bg-black/20 animate-fade-in" />
        <D.Content style={{ width }} className="fixed inset-y-0 right-0 z-[81] flex max-w-[100vw] flex-col border-l border-border bg-surface text-fg shadow-dialog outline-none animate-fade-in">
          <div className="flex h-11 items-center gap-2 border-b border-border px-4">
            <D.Title className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</D.Title>
            <D.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</D.Description>
            <D.Close className="rounded-md p-1 text-fg-muted hover:bg-surface-2" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search', autoFocus, className }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Icon name="search" size={14} className="pointer-events-none absolute left-2 top-[7px] text-fg-subtle" />
      <TextInput value={value} autoFocus={autoFocus} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="pl-7" onKeyDown={(e) => e.key === 'Escape' && value && (e.stopPropagation(), onChange(''))} />
    </div>
  );
}
