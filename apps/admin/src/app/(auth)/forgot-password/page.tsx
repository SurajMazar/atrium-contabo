'use client';

import { Banner, Button, Field, Input } from '@atrium/ui';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AuthFrame } from '@/components/auth/auth-layout';
import { useApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthFrame
      title="Reset your password"
      description="We’ll email you a link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-fg hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Banner tone="success" icon={<MailCheck />}>
          If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way. The link expires in one hour.
        </Banner>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              setError('Enter a valid email');
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await api.auth.forgotPassword(email.trim());
              setSent(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not send reset email');
            } finally {
              setBusy(false);
            }
          }}
          noValidate
        >
          <Field label="Email" error={error}>
            <Input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
