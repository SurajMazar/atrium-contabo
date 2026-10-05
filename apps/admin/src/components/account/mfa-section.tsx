'use client';

import type { User } from '@atrium/sdk';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  copyToClipboard,
  CopyField,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  FieldGroup,
  Input,
  Skeleton,
  toast,
} from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

const CODE = /^\d{6}$/;
const cleanCode = (v: string) => v.replace(/\D/g, '').slice(0, 6);

export function MfaSection({ user }: { user: User }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const enabled = user.mfaEnabled;

  return (
    <section id="security" className="scroll-mt-6">
      <FieldGroup
        title="Two-factor authentication"
        description="Require a code from an authenticator app in addition to your password when signing in."
        actions={enabled ? <Badge tone="success" dot>Enabled</Badge> : <Badge>Off</Badge>}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted [&_svg]:size-4 [&_svg]:stroke-[1.5]">
              {enabled ? <ShieldCheck /> : <ShieldOff />}
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-medium text-fg">Authenticator app</div>
              <p className="text-xs text-fg-muted">
                {enabled
                  ? 'Your account is protected with time-based one-time codes. Keep your recovery codes somewhere safe.'
                  : 'Use 1Password, Google Authenticator, Authy or any TOTP app.'}
              </p>
            </div>
          </div>
          {enabled ? (
            <Button size="sm" variant="danger-ghost" onClick={() => setDisableOpen(true)}>
              Disable
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setSetupOpen(true)}>
              Set up
            </Button>
          )}
        </div>
      </FieldGroup>
      <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
      <DisableDialog open={disableOpen} onOpenChange={setDisableOpen} />
    </section>
  );
}

function SetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi();
  const { reload } = useSession();
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const setup = useMutation({ mutationFn: () => api.auth.setupMfa() });
  const enable = useMutation({
    mutationFn: (c: string) => api.auth.enableMfa(c),
    onSuccess: (res) => {
      setRecoveryCodes(Array.isArray(res?.recoveryCodes) ? res.recoveryCodes : []);
    },
    onError: (err) => {
      setCodeError(errorMessage(err, 'That code didn’t work. Try the latest one from your app.'));
      setCode('');
      codeRef.current?.focus();
    },
  });

  const showingCodes = recoveryCodes !== null;

  const handleOpenChange = (o: boolean) => {
    if (!o && showingCodes) return; // must acknowledge recovery codes first
    onOpenChange(o);
  };

  // Each time the dialog opens, request a fresh secret + QR code.
  const { mutate: startSetup, reset: resetSetup } = setup;
  useEffect(() => {
    if (!open) return;
    setCode('');
    setCodeError(undefined);
    setRecoveryCodes(null);
    setAcknowledged(false);
    resetSetup();
    startSetup();
  }, [open, startSetup, resetSetup]);

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (!CODE.test(code)) {
      setCodeError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setCodeError(undefined);
    enable.mutate(code);
  };

  const finish = async () => {
    onOpenChange(false);
    await reload();
    toast.success('Two-factor authentication enabled');
  };

  const codesText = (recoveryCodes ?? []).join('\n');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="md"
        hideClose={showingCodes}
        onEscapeKeyDown={(e) => showingCodes && e.preventDefault()}
        onPointerDownOutside={(e) => showingCodes && e.preventDefault()}
        onInteractOutside={(e) => showingCodes && e.preventDefault()}
        onOpenAutoFocus={(e) => {
          if (!showingCodes) {
            e.preventDefault();
            codeRef.current?.focus();
          }
        }}
      >
        {showingCodes ? (
          <>
            <DialogHeader title="Save your recovery codes" description="Each code can be used once to sign in if you lose access to your authenticator app." />
            <DialogBody className="space-y-4">
              <Banner tone="warning">These codes won’t be shown again. Store them in a password manager or another safe place.</Banner>
              {recoveryCodes.length > 0 ? (
                <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md border border-border bg-surface-2 p-4 font-mono text-sm text-fg sm:grid-cols-2">
                  {recoveryCodes.map((c, i) => (
                    <li key={c} className="flex items-center gap-2 tabular-nums">
                      <span className="w-4 text-right text-2xs text-fg-subtle">{i + 1}</span>
                      <span className="select-all">{c}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-fg-muted">The server didn’t return recovery codes. You can still sign in with your authenticator app.</p>
              )}
              {recoveryCodes.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    leadingIcon={<Copy />}
                    onClick={async () => {
                      const ok = await copyToClipboard(codesText);
                      if (ok) toast.success('Recovery codes copied');
                      else toast.error('Could not copy to clipboard');
                    }}
                  >
                    Copy all
                  </Button>
                  <Button
                    size="sm"
                    leadingIcon={<Download />}
                    onClick={() => {
                      const blob = new Blob([`Atrium recovery codes\nGenerated ${new Date().toISOString()}\n\n${codesText}\n`], { type: 'text/plain' });
                      const href = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = href;
                      a.download = 'atrium-recovery-codes.txt';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      setTimeout(() => URL.revokeObjectURL(href), 1000);
                    }}
                  >
                    Download .txt
                  </Button>
                </div>
              )}
              <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} label="I’ve saved these recovery codes" />
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="primary" leadingIcon={<Check />} disabled={!acknowledged} onClick={() => void finish()}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={verify} className="flex min-h-0 flex-col">
            <DialogHeader title="Set up two-factor authentication" description="Scan the QR code with your authenticator app, then enter the code it shows." />
            <DialogBody className="space-y-5">
              {setup.isError ? (
                <Banner
                  tone="danger"
                  action={
                    <Button size="xs" onClick={() => setup.mutate()}>
                      Retry
                    </Button>
                  }
                >
                  {errorMessage(setup.error, 'Could not start setup')}
                </Banner>
              ) : (
                <div className="flex flex-col gap-5 sm:flex-row">
                  <div className="flex size-44 shrink-0 items-center justify-center self-center rounded-md border border-border bg-surface p-2 sm:self-start">
                    {setup.data?.qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={setup.data.qrDataUrl} alt="QR code for your authenticator app" className="size-full object-contain [image-rendering:pixelated]" />
                    ) : (
                      <Skeleton className="size-full" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-4">
                    <Field label="Can’t scan? Enter this key manually" help="Choose time-based (TOTP), 6 digits, 30 seconds.">
                      {setup.data?.secret ? <CopyField value={setup.data.secret} label="Setup key" /> : <Skeleton className="h-8 w-full" />}
                    </Field>
                    <Field label="Verification code" error={codeError}>
                      <Input
                        ref={codeRef}
                        value={code}
                        onChange={(e) => {
                          setCode(cleanCode(e.target.value));
                          setCodeError(undefined);
                        }}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        maxLength={6}
                        className="w-36 font-mono tracking-[0.3em]"
                        disabled={!setup.data}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="primary" loading={enable.isPending} disabled={!setup.data || code.length !== 6}>
                Verify and enable
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi();
  const { reload } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(undefined);
    }
  }, [open]);

  const disable = useMutation({
    mutationFn: (c: string) => api.auth.disableMfa(c),
    onSuccess: async () => {
      onOpenChange(false);
      await reload();
      toast.success('Two-factor authentication disabled');
    },
    onError: (err) => {
      setError(errorMessage(err, 'That code didn’t work'));
      ref.current?.focus();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    if (!c) return setError('Enter a code');
    disable.mutate(c);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          ref.current?.focus();
        }}
      >
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title="Disable two-factor authentication?" description="Your account will be protected by your password only." />
          <DialogBody>
            <Field label="Authentication code" error={error} help="Enter the current code from your authenticator app.">
              <Input
                ref={ref}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\s/g, '').slice(0, 32));
                  setError(undefined);
                }}
                autoComplete="one-time-code"
                placeholder="123456"
                className="font-mono"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="danger" loading={disable.isPending} disabled={!code.trim()}>
              Disable two-factor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
