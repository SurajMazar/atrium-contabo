'use client';

import {
  Avatar,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  toast,
} from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

export function OrgSwitcher() {
  const { memberships, currentOrg, setCurrentOrg, websiteScoped, user } = useSession();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-surface-3/60 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-3/60"
          >
            <Avatar name={currentOrg?.name ?? 'Atrium'} size="sm" square />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{currentOrg?.name ?? 'No organization'}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {memberships.map((m) => (
            <DropdownMenuItem
              key={m.organization.id}
              icon={<Avatar name={m.organization.name} size="xs" square />}
              onSelect={() => {
                setCurrentOrg(m.organization.id);
                router.push('/');
              }}
              shortcut={m.organization.id === currentOrg?.id ? <Check className="size-3.5 !text-accent" strokeWidth={2} /> : undefined}
            >
              <span className="truncate">{m.organization.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/* Website-scoped members (e.g. Website Managers) only see their websites. */}
          {currentOrg && !websiteScoped && (
            <DropdownMenuItem icon={<Settings2 />} onSelect={() => router.push(`/org/${currentOrg.id}/settings`)}>
              Organization settings
            </DropdownMenuItem>
          )}
          {/* Only platform administrators create organizations. */}
          {user?.isSuperAdmin && (
            <DropdownMenuItem icon={<Plus />} onSelect={() => setCreateOpen(true)}>
              Create organization
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

export function CreateOrganizationDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (orgId: string) => void }) {
  const api = useApi();
  const { reload, setCurrentOrg } = useSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api.organizations.create(name.trim()),
    onSuccess: async (org) => {
      await reload();
      setCurrentOrg(org.id);
      toast.success(`Created ${org.name}`);
      onOpenChange(false);
      setName('');
      if (onCreated) onCreated(org.id);
      else router.push('/');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <DialogHeader title="Create organization" description="Organizations group websites, members, billing and integrations." />
          <DialogBody>
            <Field label="Name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Studio" maxLength={80} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={create.isPending} disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
