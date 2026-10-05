'use client';

import { Button, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Page } from '@/components/common/page';
import { RequirePermission } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { InvitationsTable } from './invitations-table';
import { InviteDialog } from './invite-dialog';
import { MembersTable } from './members-table';

export function TeamScreen({ orgId }: { orgId: string }) {
  const api = useApi();
  const { memberships, can } = useSession();
  const org = memberships.find((m) => m.organization.id === orgId)?.organization;
  const [tab, setTab] = useState<'members' | 'invitations'>('members');
  const [inviteOpen, setInviteOpen] = useState(false);

  const members = useQuery({ queryKey: qk.members(orgId), queryFn: () => api.organizations.members(orgId) });
  const invitations = useQuery({ queryKey: qk.invitations(orgId), queryFn: () => api.organizations.invitations(orgId) });
  const roles = useQuery({ queryKey: qk.roles(orgId), queryFn: () => api.organizations.roles(orgId) });

  const pending = (invitations.data ?? []).filter((i) => !i.acceptedAt);

  return (
    <Page>
      <PageHeader
        title="Team"
        description={org ? `People with access to ${org.name} and what they can do.` : 'People with access to this organization.'}
        actions={
          <RequirePermission permission="user.invite">
            <Button size="sm" variant="primary" leadingIcon={<UserPlus />} onClick={() => setInviteOpen(true)} disabled={!can('user.invite')}>
              Invite members
            </Button>
          </RequirePermission>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'members' | 'invitations')}>
        <TabsList className="mb-4">
          <TabsTrigger value="members" count={members.data?.length}>
            Members
          </TabsTrigger>
          <TabsTrigger value="invitations" count={invitations.data ? pending.length : undefined}>
            Invitations
          </TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="outline-none">
          <MembersTable orgId={orgId} query={members} roles={roles.data ?? []} onInvite={() => setInviteOpen(true)} />
        </TabsContent>
        <TabsContent value="invitations" className="outline-none">
          <InvitationsTable orgId={orgId} query={invitations} onInvite={() => setInviteOpen(true)} />
        </TabsContent>
      </Tabs>
      <InviteDialog
        orgId={orgId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles.data ?? []}
        rolesLoading={roles.isPending}
        existingEmails={[...(members.data ?? []).map((m) => m.user.email), ...pending.map((i) => i.email)]}
        onInvited={() => setTab('invitations')}
      />
    </Page>
  );
}
