'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AtriumApiError } from '@atrium/sdk';
import { Banner, Button, Field, Input } from '@atrium/ui';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthFrame } from '@/components/auth/auth-layout';
import { safeNext } from '@/components/auth/auth-redirect';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const api = useApi();
  const { signIn } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api.auth.login(v);
      if ('mfaRequired' in r) {
        setChallenge(r.challengeToken);
        return;
      }
      await signIn(r);
      router.replace(next);
    } catch (e) {
      setError(e instanceof AtriumApiError && e.status === 401 ? 'Incorrect email or password.' : e instanceof AtriumApiError && e.status === 429 ? 'Too many attempts. Wait a minute and try again.' : e instanceof Error ? e.message : 'Sign in failed');
    }
  });

  const verify = async () => {
    if (!challenge) return;
    setVerifying(true);
    setError(null);
    try {
      const r = await api.auth.verifyMfa({ challengeToken: challenge, code: code.replace(/\s/g, '') });
      await signIn(r);
      router.replace(next);
    } catch (e) {
      setError(e instanceof AtriumApiError && (e.status === 401 || e.isValidation) ? 'That code didn’t work. Check your authenticator and try again.' : e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  if (challenge) {
    return (
      <AuthFrame title="Two-factor authentication" description="Enter the 6-digit code from your authenticator app, or a recovery code.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          {error && (
            <Banner tone="danger" icon={<AlertCircle />}>
              {error}
            </Banner>
          )}
          <Field label="Authentication code">
            <Input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123 456"
              className="font-mono tracking-widest"
              maxLength={24}
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={verifying} disabled={code.replace(/\s/g, '').length < 6}>
            Verify
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<ArrowLeft />}
            onClick={() => {
              setChallenge(null);
              setCode('');
              setError(null);
            }}
          >
            Back to sign in
          </Button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Sign in to Atrium"
      footer={
        <>
          New to Atrium?{' '}
          <Link href={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-fg hover:underline">
            Create an account
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
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </Field>
        <Field
          label="Password"
          error={form.formState.errors.password?.message}
          hint={
            <Link href="/forgot-password" className="text-fg-muted hover:text-fg">
              Forgot password?
            </Link>
          }
        >
          <Input type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthFrame>
  );
}
