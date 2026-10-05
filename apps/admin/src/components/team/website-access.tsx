'use client';

import type { Member } from '@atrium/sdk';
import { Button, cn, Combobox, Popover, PopoverContent, PopoverTrigger, RadioGroup, Tooltip } from '@atrium/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Globe } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';

/**
 * Website access scoping for a member. An empty `websiteIds` array means the
 * member can access every website in the organization.
 */
export function WebsiteAccess({
  orgId,
  member,
  disabled,
  disabledReason,
  onSave,
}: {
  orgId: string;
  member: Member;
  disabled?: boolean;
  disabledReason?: string;
  onSave: (websiteIds: string[]) => Promise<unknown>;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'all' | 'specific'>(member.websiteIds.length ? 'specific' : 'all');
  const [selected, setSelected] = useState<string[]>(member.websiteIds);
  const [saving, setSaving] = useState(false);

  const websites = useQuery({ queryKey: qk.websites(orgId), queryFn: () => api.websites.list(orgId) });
  const byId = useMemo(() => new Map((websites.data ?? []).map((w) => [w.id, w])), [websites.data]);
  const options = useMemo(() => (websites.data ?? []).map((w) => ({ value: w.id, label: w.name, description: w.primaryDomain ?? w.slug })), [websites.data]);

  useEffect(() => {
    if (!open) {
      setMode(member.websiteIds.length ? 'specific' : 'all');
      setSelected(member.websiteIds);
    }
  }, [open, member.websiteIds]);

  const ids = member.websiteIds;
  const summary =
    ids.length === 0
      ? 'All websites'
      : ids.length === 1
        ? (byId.get(ids[0]!)?.name ?? '1 website')
        : `${ids.length} websites`;

  const next = mode === 'all' ? [] : selected;
  const dirty = next.length !== ids.length || next.some((id) => !ids.includes(id));
  const invalid = mode === 'specific' && selected.length === 0;

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'inline-flex h-7 max-w-full items-center gap-1.5 rounded-md px-2 text-sm text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        disabled ? 'cursor-default text-fg-muted' : 'hover:bg-surface-2 data-[state=open]:bg-surface-2',
      )}
      title={ids.length > 1 ? ids.map((id) => byId.get(id)?.name ?? id).join(', ') : undefined}
    >
      <Globe className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.5} />
      <span className="truncate">{summary}</span>
      {!disabled && <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.5} />}
    </button>
  );

  if (disabled) {
    return (
      <Tooltip content={disabledReason}>
        <span className="inline-flex max-w-full">{trigger}</span>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="space-y-3 p-3">
          <div>
            <p className="text-sm font-medium text-fg">Website access</p>
            <p className="mt-0.5 text-xs text-fg-muted">Their role’s permissions apply only to the websites selected here.</p>
          </div>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as 'all' | 'specific')}
            options={[
              { value: 'all', label: 'All websites', description: 'Including websites created later' },
              { value: 'specific', label: 'Specific websites' },
            ]}
          />
          {mode === 'specific' && (
            <div className="space-y-1">
              <Combobox
                multiple
                aria-label="Websites"
                options={options}
                value={selected}
                onChange={setSelected}
                loading={websites.isPending}
                placeholder="Choose websites"
                searchPlaceholder="Search websites"
                emptyText={websites.isError ? 'Could not load websites' : 'No websites'}
              />
              {invalid && <p className="text-xs text-fg-muted">Select at least one website.</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/50 px-3 py-2">
          <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="xs"
            variant="primary"
            loading={saving}
            disabled={!dirty || invalid}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(next);
                setOpen(false);
              } catch {
                /* toast surfaced by the mutation */
              } finally {
                setSaving(false);
              }
            }}
          >
            Save access
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
