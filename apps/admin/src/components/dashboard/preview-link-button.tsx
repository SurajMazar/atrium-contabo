'use client';

import { Button, copyToClipboard, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Copy, Eye, ExternalLink, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

/** Creates a 24h draft preview link and opens or copies it. */
export function PreviewLinkButton({ websiteId }: { websiteId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const create = useMutation({
    mutationFn: () => api.websites.createPreviewToken(websiteId, { expiresInHours: 24, label: 'Dashboard preview' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.previewTokens(websiteId) }),
  });

  const open = async () => {
    // Open synchronously so popup blockers allow it, then point it at the new link.
    const win = window.open('about:blank', '_blank');
    try {
      const t = await create.mutateAsync();
      if (win) {
        win.opener = null;
        win.location.href = t.url;
      } else window.location.href = t.url;
    } catch (err) {
      win?.close();
      toast.error('Could not create a preview link', { description: errorMessage(err) });
    }
  };

  const copy = async () => {
    try {
      const t = await create.mutateAsync();
      const ok = await copyToClipboard(t.url);
      if (ok) toast.success('Preview link copied', { description: 'Valid for 24 hours.' });
      else toast.message('Preview link', { description: t.url });
    } catch (err) {
      toast.error('Could not create a preview link', { description: errorMessage(err) });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" leadingIcon={<Eye />} trailingIcon={<ChevronDown />} loading={create.isPending}>
          Preview
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Draft preview · 24 hours</DropdownMenuLabel>
        <DropdownMenuItem icon={<ExternalLink />} onSelect={() => void open()}>
          Open preview
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Copy />} onSelect={() => void copy()}>
          Copy preview link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Settings2 />} onSelect={() => router.push(`/w/${websiteId}/versions#preview-links`)}>
          Manage preview links
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
