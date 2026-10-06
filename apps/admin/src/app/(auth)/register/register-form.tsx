'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AtriumApiError } from '@atrium/sdk';
import { Banner, Button, Field, Input } from '@atrium/ui';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthFrame } from '@/components/auth/auth-layout';
import { safeNext } from '@/components/auth/auth-redirect';
import { PasswordStrength, passwordSchema } from '@/components/auth/password';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(120),
  email: z.string().trim().email('Enter a valid email'),
  password: passwordSchema,
});
type Values = z.infer<typeof schema>;

export function RegisterForm() {
  const api = useApi();
  const { signIn } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const invited = !!next?.startsWith('/invite/');
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: params.get('email') ?? '', password: '' } });
  const password = form.watch('password');

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api.auth.register(v);
      await signIn(r);
      router.replace(next ? safeNext(next) : '/onboarding');
    } catch (e) {
      if (e instanceof AtriumApiError && e.isConflict) form.setError('email', { message: 'An account with this email already exists' });
      else setError(e instanceof Error ? e.message : 'Registration failed');
    }
  });

  return (
    <AuthFrame
      title="Create your account"
      description={invited ? 'Create an account to accept your invitation.' : 'Start building websites with your team.'}
      footer={
        <>
          Already have an account?{' '}
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-fg hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error && (
          <Banner tone="danger" icon={<AlertCircle />}>
            {error}
          </Banner>
        )}
        <Field label="Full name" error={form.formState.errors.name?.message}>
          <Input autoComplete="name" autoFocus {...form.register('name')} />
        </Field>
        <Field label="Work email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <PasswordStrength value={password} />
        <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthFrame>
  );
}
