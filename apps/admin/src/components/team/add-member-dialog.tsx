'use client';

import { AtriumApiError, type Role } from '@atrium/sdk';
import { Banner, Button, copyToClipboard, CopyField, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, RadioGroup, Select, toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { WebsiteAccessField, type WebsiteAccessMode } from './website-access-field';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PREFERRED_DEFAULT = ['editor', 'viewer'];

/** Mirrors the API password policy (10+ characters, three of: lower, upper, digit, symbol). */
function passwordProblem(pw: string): string | undefined {
  if (pw.length < 10) return 'At least 10 characters';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return 'Mix upper and lower case letters, numbers and symbols';
  return undefined;
}

interface Created {
  name: string;
  email: string;
  password?: string;
  /** Super-admin add of an existing account: an invitation was sent instead. */
  invited?: boolean;
}

/**
 * Add someone without an email invitation: their account is created here and they can sign in
 * straight away with the email and password you share with them.
 */
export function AddMemberDialog({ orgId, open, onOpenChange, roles, rolesLoading, platform, orgName }: { orgId: string; open: boolean; onOpenChange: (open: boolean) => void; roles: Role[]; rolesLoading?: boolean; /** Super admin adding to any organization (existing accounts are invited). */ platform?: boolean; orgName?: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<string | undefined>();
  const [access, setAccess] = useState<WebsiteAccessMode>('all');
  const [websiteIds, setWebsiteIds] = useState<string[]>([]);
  const [passwordMode, setPasswordMode] = useState<'generate' | 'set'>('generate');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  const defaultRoleId = useMemo(() => {
    for (const key of PREFERRED_DEFAULT) {
      const r = roles.find((x) => x.key === key);
      if (r) return r.id;
    }
    return roles.find((r) => r.key !== 'owner')?.id ?? roles[0]?.id;
  }, [roles]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setRoleId(defaultRoleId);
    setAccess('all');
    setWebsiteIds([]);
    setPasswordMode('generate');
    setPassword('');
    setShowPassword(false);
    setSubmitted(false);
    setCreated(null);
    setEmailTaken(false);
  }, [open, defaultRoleId]);

  const role = roles.find((r) => r.id === roleId);
  const isOwner = role?.key === 'owner';
  const scoped = !isOwner && access === 'specific';
  const pickRole = (id: string) => {
    setRoleId(id);
    if (roles.find((r) => r.id === id)?.key === 'website_manager') setAccess('specific');
  };

  const nameError = submitted && !name.trim() ? 'Enter their name' : undefined;
  const emailError = emailTaken ? 'This person already has an account — send them an invitation instead' : submitted && !EMAIL.test(email.trim()) ? 'Enter a valid email address' : undefined;
  const pwError = submitted && passwordMode === 'set' ? passwordProblem(password) : undefined;

  const add = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        roleId: roleId!,
        websiteIds: scoped ? websiteIds : [],
        ...(passwordMode === 'set' ? { password } : {}),
      };
      if (platform) {
        const r = await api.admin.addOrganizationMember(orgId, body);
        return { password: r.password, invited: r.mode === 'invited' };
      }
      const r = await api.organizations.addMember(orgId, body);
      return { password: r.password, invited: !!r.invited };
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.members(orgId) });
      void qc.invalidateQueries({ queryKey: qk.invitations(orgId) });
      void qc.invalidateQueries({ queryKey: ['admin'] });
      setCreated({ name: name.trim(), email: email.trim().toLowerCase(), password: res.password, invited: res.invited });
      setPassword('');
    },
    onError: (err) => {
      if (!platform && err instanceof AtriumApiError && (err.details as { reason?: string } | undefined)?.reason === 'ACCOUNT_EXISTS') setEmailTaken(true);
      else toast.error(errorMessage(err, 'Could not add this person'));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !EMAIL.test(email.trim()) || !roleId) return;
    if (scoped && websiteIds.length === 0) return;
    if (passwordMode === 'set' && passwordProblem(password)) return;
    add.mutate();
  };

  const signInUrl = typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`;
  const credentials = created ? [`Sign in: ${signInUrl}`, `Email: ${created.email}`, ...(created.password ? [`Password: ${created.password}`] : [])].join('\n') : '';

  return (
    <Dialog open={open} onOpenChange={(o) => !add.isPending && onOpenChange(o)}>
      <DialogContent
        size="md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameRef.current?.focus();
        }}
      >
        {created?.invited ? (
          <>
            <DialogHeader title={`Invitation sent to ${created.email}`} description="This email already has an account (for example someone removed earlier), so they were invited with the same role and access instead of being added directly." />
            <DialogBody>
              <p className="text-sm text-fg-muted">
                They join {orgName ?? 'the organization'} once they accept the invitation while signed in with that (verified) address. You can see it under the organization’s Team → Invitations.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button size="sm" variant="primary" leadingIcon={<Check />} onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : created ? (
          <>
            <DialogHeader title={`${created.name} can sign in now`} description="Share these details with them securely — for example in person or through a password manager." />
            <DialogBody className="space-y-4">
              <Field label="Sign-in page">
                <CopyField value={signInUrl} label="Sign-in page" />
              </Field>
              <Field label="Email">
                <CopyField value={created.email} label="Email" />
              </Field>
              {created.password ? (
                <>
                  <Field label="Password">
                    <CopyField value={created.password} label="Password" />
                  </Field>
                  <Banner tone="warning">This password is shown only once. Ask them to change it after signing in (Account → Password).</Banner>
                </>
              ) : (
                <p className="text-sm text-fg-muted">They sign in with the password you set. Ask them to change it after signing in (Account → Password).</p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={<Copy />}
                onClick={async () => {
                  if (await copyToClipboard(credentials)) toast.success('Sign-in details copied');
                  else toast.error('Could not copy to clipboard');
                }}
              >
                Copy all
              </Button>
              <Button size="sm" variant="primary" leadingIcon={<Check />} onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogHeader
              title={platform ? `Add member to ${orgName ?? 'organization'}` : 'Add member'}
              description={platform ? 'New emails get an account straight away; emails that already have an account receive an invitation.' : 'Create an account for someone and add them right away — no invitation email is sent.'}
            />
            <DialogBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" required error={nameError}>
                  <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" placeholder="Asha Gurung" />
                </Field>
                <Field label="Email" required error={emailError}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailTaken(false);
                    }}
                    maxLength={254}
                    autoComplete="off"
                    placeholder="name@company.com"
                  />
                </Field>
              </div>
              <Field label="Role" required help={role?.description ?? undefined}>
                <Select
                  value={roleId}
                  onValueChange={pickRole}
                  disabled={rolesLoading || roles.length === 0}
                  placeholder={rolesLoading ? 'Loading roles…' : 'Select a role'}
                  options={roles.map((r) => ({ value: r.id, label: r.name, description: `${r.permissions.length} permissions` }))}
                />
              </Field>
              <WebsiteAccessField orgId={orgId} enabled={open} isOwner={isOwner} mode={access} onModeChange={setAccess} websiteIds={websiteIds} onWebsiteIdsChange={setWebsiteIds} showError={submitted} />
              <Field label="Password" error={pwError}>
                <RadioGroup
                  value={passwordMode}
                  onValueChange={(v) => setPasswordMode(v as 'generate' | 'set')}
                  options={[
                    { value: 'generate', label: 'Generate a strong password', description: 'Shown once after the account is created' },
                    { value: 'set', label: 'Set a password' },
                  ]}
                />
                {passwordMode === 'set' && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      maxLength={200}
                      placeholder="At least 10 characters"
                      className="max-w-xs"
                    />
                    <Button type="button" size="sm" variant="ghost" aria-label={showPassword ? 'Hide password' : 'Show password'} leadingIcon={showPassword ? <EyeOff /> : <Eye />} onClick={() => setShowPassword((v) => !v)} />
                  </div>
                )}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={add.isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={add.isPending} disabled={!roleId}>
                Add member
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
