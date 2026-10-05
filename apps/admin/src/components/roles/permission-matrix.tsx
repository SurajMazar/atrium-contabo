'use client';

import { Button, Checkbox, cn, EmptyState, Input, Table, TableContainer, TBody, TD, TH, THead, TR, Tooltip } from '@atrium/ui';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PermissionGroup } from './permission-groups';

export function PermissionMatrix({
  groups,
  value,
  onChange,
  readOnly,
}: {
  groups: PermissionGroup[];
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const total = useMemo(() => groups.reduce((n, g) => n + g.permissions.length, 0), [groups]);
  const selectedCount = useMemo(() => groups.reduce((n, g) => n + g.permissions.filter((p) => selected.has(p.key)).length, 0), [groups, selected]);

  const visible = useMemo(() => {
    const f = search.trim().toLowerCase();
    if (!f) return groups;
    return groups
      .map((g) => {
        if (g.label.toLowerCase().includes(f) || g.resource.includes(f)) return g;
        return { ...g, permissions: g.permissions.filter((p) => p.key.toLowerCase().includes(f) || p.description.toLowerCase().includes(f)) };
      })
      .filter((g) => g.permissions.length > 0);
  }, [groups, search]);

  const setMany = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    // Preserve catalog order for stable diffs.
    const order = groups.flatMap((g) => g.permissions.map((p) => p.key));
    const extra = value.filter((k) => !order.includes(k));
    onChange([...order.filter((k) => next.has(k)), ...extra]);
  };

  const visibleKeys = visible.flatMap((g) => g.permissions.map((p) => p.key));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input size="sm" prefix={<Search />} placeholder="Filter permissions" value={search} onChange={(e) => setSearch(e.target.value)} className="w-60" aria-label="Filter permissions" />
        <span className="text-xs text-fg-muted tabular-nums" aria-live="polite">
          {selectedCount} of {total} selected
        </span>
        <div className="flex-1" />
        {!readOnly && (
          <>
            <Button size="xs" variant="ghost" onClick={() => setMany(visibleKeys, true)} disabled={visibleKeys.every((k) => selected.has(k))}>
              Select {search ? 'shown' : 'all'}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setMany(visibleKeys, false)} disabled={!visibleKeys.some((k) => selected.has(k))}>
              Clear {search ? 'shown' : 'all'}
            </Button>
          </>
        )}
      </div>
      {visible.length === 0 ? (
        <EmptyState compact title="No permissions match" description="Try a different filter." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <TH className="w-48">Resource</TH>
                <TH>Permissions</TH>
                <TH align="right" className="w-16">
                  Granted
                </TH>
              </tr>
            </THead>
            <TBody>
              {visible.map((g) => {
                const keys = g.permissions.map((p) => p.key);
                const on = keys.filter((k) => selected.has(k)).length;
                const state = on === 0 ? false : on === keys.length ? true : 'indeterminate';
                return (
                  <TR key={g.resource} className="align-top">
                    <TD className="h-auto py-2.5 align-top">
                      <Checkbox
                        checked={state}
                        disabled={readOnly}
                        onCheckedChange={() => setMany(keys, state !== true)}
                        label={<span className="font-medium">{g.label}</span>}
                        aria-label={`All ${g.label} permissions`}
                      />
                    </TD>
                    <TD className="h-auto py-2.5">
                      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                        {g.permissions.map((p) => (
                          <Tooltip key={p.key} content={<span className="font-mono">{p.key}</span>} side="top" align="start" delayDuration={400}>
                            <span className="inline-flex min-w-0">
                              <Checkbox
                                checked={selected.has(p.key)}
                                disabled={readOnly}
                                onCheckedChange={(v) => setMany([p.key], v === true)}
                                label={
                                  <span className={cn(!selected.has(p.key) && 'text-fg-muted')}>
                                    {p.description}
                                    <span className="ml-1.5 font-mono text-2xs text-fg-subtle">{p.action}</span>
                                  </span>
                                }
                              />
                            </span>
                          </Tooltip>
                        ))}
                      </div>
                    </TD>
                    <TD align="right" muted className="h-auto py-2.5 text-xs">
                      {on}/{keys.length}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
