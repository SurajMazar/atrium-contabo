'use client';

import { Banner, Button, Field, Input } from '@atrium/ui';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AuthFrame } from '@/components/auth/auth-layout';
import { PasswordStrength, passwordSchema } from '@/components/auth/password';
import { useApi } from '@/lib/api';

export function ResetForm({ token }: { token: string }) {
  const api = useApi();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthFrame title="Invalid reset link" description="This link is missing its token. Request a new one.">
        <Button asChild variant="primary" className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Choose a new password">
      {done ? (
        <div className="space-y-4">
          <Banner tone="success" icon={<CheckCircle2 />}>
            Your password was updated. Other sessions have been signed out.
          </Banner>
          <Button asChild variant="primary" className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = passwordSchema.safeParse(password);
            if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid password');
            if (password !== confirm) return setError('Passwords don’t match');
            setBusy(true);
            setError(null);
            try {
              await api.auth.resetPassword(token, password);
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'This link is invalid or has expired');
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && (
            <Banner tone="danger" icon={<AlertCircle />}>
              {error}
            </Banner>
          )}
          <Field label="New password">
            <Input type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <PasswordStrength value={password} />
          <Field label="Confirm password">
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Update password
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
