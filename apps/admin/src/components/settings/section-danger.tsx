'use client';

import { Button, ConfirmDialog, toast } from '@atrium/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequirePermission } from '@/components/common/permission';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useWebsite } from '@/lib/website-context';
import { SectionHeading } from './section-kit';

export function DangerSection({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const { website, organizationId } = useWebsite();
  const [open, setOpen] = useState(false);

  const remove = async () => {
    try {
      await api.websites.remove(websiteId);
    } catch (err) {
      toast.error('Could not delete website', { description: err instanceof Error ? err.message : undefined });
      throw err;
    }
    toast.success(`${website?.name ?? 'Website'} deleted`);
    if (organizationId) await qc.invalidateQueries({ queryKey: qk.websites(organizationId) });
    router.push('/');
    qc.removeQueries({ queryKey: qk.website(websiteId) });
  };

  return (
    <div>
      <SectionHeading title="Danger zone" description="Irreversible actions for this website." />
      <section className="rounded-lg border border-danger/30 bg-surface">
        <div className="flex flex-wrap items-center gap-4 px-4 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-fg">Delete this website</h3>
            <p className="mt-0.5 text-sm text-fg-muted">
              Permanently removes pages, forms, submissions, versions and deployments. Connected domains stop serving the site. This cannot be undone.
            </p>
          </div>
          <RequirePermission permission="website.delete" websiteId={websiteId}>
            <Button variant="danger" size="sm" leadingIcon={<Trash2 />} onClick={() => setOpen(true)} disabled={!website}>
              Delete website
            </Button>
          </RequirePermission>
        </div>
      </section>
      {website && (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          tone="danger"
          title={`Delete ${website.name}?`}
          description="Everything in this website will be deleted, including form submissions. Consider exporting a copy first."
          confirmText={website.slug}
          confirmLabel="Delete website"
          onConfirm={remove}
        />
      )}
    </div>
  );
}
