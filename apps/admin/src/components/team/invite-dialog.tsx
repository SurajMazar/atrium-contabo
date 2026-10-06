'use client';

import type { Invitation, Role } from '@atrium/sdk';
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Select, TagInput, toast } from '@atrium/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { WebsiteAccessField, type WebsiteAccessMode } from './website-access-field';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PREFERRED_DEFAULT = ['editor', 'viewer'];

export function InviteDialog({
  orgId,
  open,
  onOpenChange,
  roles,
  rolesLoading,
  existingEmails,
  onInvited,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  rolesLoading?: boolean;
  existingEmails: string[];
  onInvited?: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [roleId, setRoleId] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [access, setAccess] = useState<WebsiteAccessMode>('all');
  const [websiteIds, setWebsiteIds] = useState<string[]>([]);

  const defaultRoleId = useMemo(() => {
    for (const key of PREFERRED_DEFAULT) {
      const r = roles.find((x) => x.key === key);
      if (r) return r.id;
    }
    return roles.find((r) => r.key !== 'owner')?.id ?? roles[0]?.id;
  }, [roles]);

  useEffect(() => {
    if (open) {
      setEmails([]);
      setSubmitted(false);
      setFailures({});
      setRoleId(defaultRoleId);
      setAccess('all');
      setWebsiteIds([]);
    }
  }, [open, defaultRoleId]);

  const existing = useMemo(() => new Set(existingEmails.map((e) => e.toLowerCase())), [existingEmails]);
  const invalid = emails.filter((e) => !EMAIL.test(e));
  const duplicates = emails.filter((e) => EMAIL.test(e) && existing.has(e));

  const emailError = !submitted
    ? undefined
    : emails.length === 0
      ? 'Add at least one email address'
      : invalid.length
        ? `Not a valid email: ${invalid.join(', ')}`
        : duplicates.length
          ? `Already a member or invited: ${duplicates.join(', ')}`
          : Object.keys(failures).length
            ? Object.entries(failures)
                .map(([e, msg]) => `${e}: ${msg}`)
                .join(' · ')
            : undefined;

  const role = roles.find((r) => r.id === roleId);
  const isOwner = role?.key === 'owner';
  const scoped = !isOwner && access === 'specific';
  const pickRole = (id: string) => {
    setRoleId(id);
    // A Website Manager is meant for specific websites.
    if (roles.find((r) => r.id === id)?.key === 'website_manager') setAccess('specific');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFailures({});
    if (!emails.length || invalid.length || duplicates.length || !roleId) return;
    if (scoped && websiteIds.length === 0) return;
    setBusy(true);
    const results = await Promise.allSettled(emails.map((email) => api.organizations.invite(orgId, { email, roleId, websiteIds: scoped ? websiteIds : [] })));
    setBusy(false);
    const ok: Invitation[] = [];
    const failed: Record<string, string> = {};
    results.forEach((r, i) => {
      const email = emails[i]!;
      if (r.status === 'fulfilled') ok.push(r.value);
      else failed[email] = errorMessage(r.reason, 'Failed');
    });
    if (ok.length) {
      void qc.invalidateQueries({ queryKey: qk.invitations(orgId) });
      toast.success(ok.length === 1 ? `Invitation sent to ${ok[0]!.email}` : `${ok.length} invitations sent`);
    }
    if (Object.keys(failed).length) {
      setEmails(Object.keys(failed));
      setFailures(failed);
      if (!ok.length) toast.error('Could not send invitations');
      return;
    }
    onOpenChange(false);
    onInvited?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title="Invite members" description="Each person receives an email with a link to join this organization." />
          <DialogBody className="space-y-4">
            <Field label="Email addresses" required error={emailError} help="Separate multiple addresses with a comma or Enter.">
              <TagInput
                ref={inputRef}
                value={emails}
                onChange={(v) => {
                  setEmails(v);
                  setFailures({});
                }}
                transform={(t) => t.trim().toLowerCase()}
                placeholder="name@company.com, …"
                max={50}
              />
            </Field>
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
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!roleId}>
              {emails.length > 1 ? `Send ${emails.length} invitations` : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
