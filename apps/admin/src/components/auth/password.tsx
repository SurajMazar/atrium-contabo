import { cn } from '@atrium/ui';
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9\W_]/.test(v), 'Include letters and at least one number or symbol');

export function passwordScore(v: string): number {
  let s = 0;
  if (v.length >= 10) s++;
  if (v.length >= 14) s++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return Math.min(4, s);
}

const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const score = passwordScore(value);
  return (
    <div className="-mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < score ? (score <= 1 ? 'bg-danger' : score === 2 ? 'bg-warning' : 'bg-success') : 'bg-surface-3')} />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-fg-muted">{labels[score]}</span>
    </div>
  );
}
