'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, Input } from '@atrium/ui';
import { KeyRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PasswordStrength, passwordSchema } from '@/components/auth/password';
import { errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter the password you were given'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords don’t match' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a password different from the one you were given' });

type Values = z.infer<typeof schema>;

/**
 * Accounts created by an admin start with a password the admin knows. Until the person chooses
 * their own, the API refuses everything but /auth/* (PASSWORD_CHANGE_REQUIRED), so this screen
 * replaces the app.
 */
export function PasswordChangeGate({ children }: { children: ReactNode }) {
  const { user, reload, signOut } = useSession();
  if (!user?.passwordChangeRequired) return <>{children}</>;
  return <ChoosePassword email={user.email} onDone={reload} onSignOut={signOut} />;
}

function ChoosePassword({ email, onDone, onSignOut }: { email: string; onDone: () => Promise<unknown>; onSignOut: () => Promise<void> }) {
  const api = useApi();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });
  const { register, handleSubmit, formState, watch, setError } = form;
  const onSubmit = handleSubmit(async (v) => {
    try {
      await api.auth.changePassword(v.currentPassword, v.newPassword);
      await onDone();
    } catch (err) {
      setError('currentPassword', { message: errorMessage(err, 'That password is incorrect') });
    }
  });
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <form onSubmit={onSubmit} noValidate className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <span className="mb-4 flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent">
          <KeyRound className="size-4" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight text-fg">Choose your password</h1>
        <p className="mt-1 text-sm text-fg-muted">Your account was set up for you. Pick a password only you know to continue.</p>
        <div className="mt-5 space-y-4">
          <input type="text" autoComplete="username" value={email} hidden readOnly />
          <Field label="Password you were given" error={formState.errors.currentPassword?.message}>
            <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
          </Field>
          <Field label="New password" error={formState.errors.newPassword?.message}>
            <Input type="password" autoComplete="new-password" {...register('newPassword')} />
          </Field>
          <PasswordStrength value={watch('newPassword')} />
          <Field label="Confirm new password" error={formState.errors.confirmPassword?.message}>
            <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </Field>
        </div>
        <div className="mt-6 flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => void onSignOut()}>
            Sign out
          </Button>
          <Button type="submit" size="sm" variant="primary" loading={formState.isSubmitting}>
            Save and continue
          </Button>
        </div>
      </form>
    </div>
  );
}
