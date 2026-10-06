'use client';

import { Banner, Button, CopyField, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, RadioGroup, Select, toast } from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Result {
  name: string;
  owner: { email: string; created: boolean; invited?: boolean; password?: string } | null;
}

/** Super admin: create an organization, optionally for a client who becomes its owner. */
export function CreateOrganizationAdminDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const plans = useQuery({ queryKey: qk.admin('plans'), queryFn: () => api.admin.plans(), staleTime: 5 * 60_000, enabled: open });
  const [name, setName] = useState('');
  const [planKey, setPlanKey] = useState<string | undefined>();
  const [ownerMode, setOwnerMode] = useState<'client' | 'me'>('client');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPlanKey(undefined);
    setOwnerMode('client');
    setOwnerName('');
    setOwnerEmail('');
    setSubmitted(false);
    setResult(null);
  }, [open]);

  const create = useMutation({
    mutationFn: () => api.admin.createOrganization({ name: name.trim(), planKey, ...(ownerMode === 'client' ? { owner: { name: ownerName.trim(), email: ownerEmail.trim().toLowerCase() } } : {}) }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.admin('organizations') });
      void qc.invalidateQueries({ queryKey: ['admin'] });
      setResult({ name: r.name, owner: r.owner });
      toast.success(`Created ${r.name}`);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not create the organization')),
  });

  const ownerNameError = submitted && ownerMode === 'client' && !ownerName.trim() ? 'Enter their name' : undefined;
  const ownerEmailError = submitted && ownerMode === 'client' && !EMAIL.test(ownerEmail.trim()) ? 'Enter a valid email address' : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;
    if (ownerMode === 'client' && (!ownerName.trim() || !EMAIL.test(ownerEmail.trim()))) return;
    create.mutate();
  };
  const signInUrl = typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`;

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent
        size="md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        {result ? (
          <>
            <DialogHeader
              title={`${result.name} is ready`}
              description={result.owner?.invited ? `${result.owner.email} is invited as owner.` : result.owner ? `${result.owner.email} owns it and can manage its websites and team.` : 'You are its owner.'}
            />
            <DialogBody className="space-y-4">
              {result.owner?.created && result.owner.password ? (
                <>
                  <Field label="Sign-in page">
                    <CopyField value={signInUrl} label="Sign-in page" />
                  </Field>
                  <Field label="Email">
                    <CopyField value={result.owner.email} label="Email" />
                  </Field>
                  <Field label="Password">
                    <CopyField value={result.owner.password} label="Password" />
                  </Field>
                  <Banner tone="warning">This password is shown only once. Share it securely and ask them to change it after signing in.</Banner>
                </>
              ) : result.owner?.invited ? (
                <p className="text-sm text-fg-muted">
                  {result.owner.email} already has an account, so they get an owner invitation by email instead of being added directly — they become owner once they accept it while signed in with that (verified) address. You can manage the organization from Super admin until then.
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="primary" leadingIcon={<Check />} onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogHeader title="New organization" description="Organizations hold websites, members, billing and integrations. Only super admins create them." />
            <DialogBody className="space-y-4">
              <Field label="Organization name" required error={submitted && !name.trim() ? 'Enter a name' : undefined}>
                <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Leela Garden" />
              </Field>
              <Field label="Plan">
                <Select
                  value={planKey ?? 'starter'}
                  onValueChange={setPlanKey}
                  disabled={plans.isPending}
                  options={(plans.data ?? [{ key: 'starter', name: 'Starter' }]).map((p) => ({ value: p.key, label: p.name }))}
                />
              </Field>
              <Field label="Owner">
                <RadioGroup
                  value={ownerMode}
                  onValueChange={(v) => setOwnerMode(v as 'client' | 'me')}
                  options={[
                    { value: 'client', label: 'A client or colleague', description: 'They own it; you are not added as a member' },
                    { value: 'me', label: 'Me' },
                  ]}
                />
              </Field>
              {ownerMode === 'client' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Owner name" required error={ownerNameError}>
                    <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={120} autoComplete="off" />
                  </Field>
                  <Field label="Owner email" required error={ownerEmailError} help="A new account gets a generated password.">
                    <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} maxLength={254} autoComplete="off" placeholder="owner@client.com" />
                  </Field>
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="primary" loading={create.isPending}>
                Create organization
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
