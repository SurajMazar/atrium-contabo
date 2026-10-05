'use client';

import { Banner, Button, Spinner } from '@atrium/ui';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthFrame } from '@/components/auth/auth-layout';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

export function AcceptInvite({ token }: { token: string }) {
  const api = useApi();
  const { status, user, reload, setCurrentOrg, signOut } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/invite/${encodeURIComponent(token)}`;

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-fg-muted">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <AuthFrame title="You’ve been invited" description="Sign in or create an account to join the organization.">
        <div className="space-y-2">
          <Button asChild variant="primary" className="w-full">
            <Link href={`/register?next=${encodeURIComponent(here)}`}>Create an account</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>I already have an account</Link>
          </Button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Join organization" description={<>You’re signed in as <span className="font-medium text-fg">{user?.email}</span>.</>}>
      <div className="space-y-4">
        {error && (
          <Banner tone="danger" icon={<AlertCircle />}>
            {error}
          </Banner>
        )}
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const r = await api.organizations.acceptInvitation(token);
              await reload();
              setCurrentOrg(r.organizationId);
              router.replace('/');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'This invitation is invalid or has expired.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Accept invitation
        </Button>
        <p className="text-center text-xs text-fg-muted">
          Wrong account?{' '}
          <button type="button" className="font-medium text-fg hover:underline" onClick={() => void signOut()}>
            Sign out
          </button>
        </p>
      </div>
    </AuthFrame>
  );
}
