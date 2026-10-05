'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, FieldGroup, Input, toast } from '@atrium/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PasswordStrength, passwordSchema } from '@/components/auth/password';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords don’t match' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a password different from your current one' });

type Values = z.infer<typeof schema>;

export function PasswordSection() {
  const api = useApi();
  const qc = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });
  const { register, handleSubmit, formState, watch, reset, setError } = form;
  const newPassword = watch('newPassword');

  const onSubmit = handleSubmit(async (v) => {
    try {
      await api.auth.changePassword(v.currentPassword, v.newPassword);
      reset();
      void qc.invalidateQueries({ queryKey: qk.sessions() });
      toast.success('Password changed');
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403 || status === 422 || status === 400) {
        setError('currentPassword', { message: errorMessage(err, 'Current password is incorrect') });
      } else {
        toast.error(errorMessage(err, 'Could not change password'));
      }
    }
  });

  return (
    <section id="password" className="scroll-mt-6">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup title="Password" description="Use at least 10 characters with a mix of letters, numbers or symbols.">
          <div className="space-y-4">
            {/* Hidden username helps password managers associate the new password. */}
            <input type="text" autoComplete="username" hidden readOnly />
            <Field label="Current password" error={formState.errors.currentPassword?.message} className="sm:max-w-sm">
              <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <Field label="New password" error={formState.errors.newPassword?.message}>
                  <Input type="password" autoComplete="new-password" {...register('newPassword')} />
                </Field>
                <div className="pt-2">
                  <PasswordStrength value={newPassword} />
                </div>
              </div>
              <Field label="Confirm new password" error={formState.errors.confirmPassword?.message}>
                <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
              </Field>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" variant="primary" size="sm" loading={formState.isSubmitting} disabled={!formState.isDirty}>
                Change password
              </Button>
            </div>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
