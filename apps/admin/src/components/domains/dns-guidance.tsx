'use client';

import type { Domain } from '@atrium/sdk';
import { Badge, Button, CopyButton } from '@atrium/ui';
import { Clock, Plus } from 'lucide-react';
import { formatDateTime, timeAgo } from '@/lib/format';
import { counterpart, isApex } from './domain-utils';

/** Required DNS records for one domain plus apex/www guidance. */
export function DnsGuidance({ domain, hasCounterpart, canManage, onAddCounterpart, adding }: { domain: Domain; hasCounterpart: boolean; canManage: boolean; onAddCounterpart: (host: string) => void; adding: boolean }) {
  const apex = isApex(domain.hostname);
  const other = counterpart(domain.hostname);
  const records = domain.dnsRecords ?? [];
  const verified = !!domain.verifiedAt;

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-fg">DNS records for {domain.hostname}</h4>
        <span className="text-xs text-fg-muted">
          {verified ? <>Verified {timeAgo(domain.verifiedAt)}</> : domain.lastCheckedAt ? <span title={formatDateTime(domain.lastCheckedAt)}>Last checked {timeAgo(domain.lastCheckedAt)}</span> : 'Not checked yet'}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-fg-muted">The provider hasn’t returned any records yet. Verify the domain to refresh them.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2/60 text-left text-xs text-fg-muted">
              <tr>
                <th className="h-8 w-20 px-3 font-medium">Type</th>
                <th className="h-8 px-3 font-medium">Name</th>
                <th className="h-8 px-3 font-medium">Value</th>
                <th className="hidden h-8 px-3 font-medium lg:table-cell">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((r, i) => (
                <tr key={`${r.type}-${r.name}-${i}`}>
                  <td className="px-3 py-2 align-top">
                    <Badge tone="outline" size="xs" className="font-mono">
                      {r.type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="flex items-center gap-1">
                      <span className="break-all font-mono text-xs text-fg">{r.name}</span>
                      <CopyButton value={r.name} label="Copy name" />
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="flex items-center gap-1">
                      <span className="break-all font-mono text-xs text-fg">{r.value}</span>
                      <CopyButton value={r.value} label="Copy value" />
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-muted lg:hidden">{r.reason}</span>
                  </td>
                  <td className="hidden px-3 py-2 align-top text-xs text-fg-muted lg:table-cell">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 text-sm text-fg-muted md:grid-cols-2">
        <div className="space-y-1">
          <p className="font-medium text-fg">{apex ? 'Root domain' : 'Subdomain'}</p>
          {apex ? (
            <p>
              Root domains like <span className="font-mono text-xs text-fg">{domain.hostname}</span> can’t use a CNAME at most DNS hosts. Add the <span className="font-mono text-xs">A</span> record above, or an{' '}
              <span className="font-mono text-xs">ALIAS</span>/<span className="font-mono text-xs">ANAME</span> record if your DNS host supports it.
            </p>
          ) : (
            <p>
              Subdomains such as <span className="font-mono text-xs text-fg">{domain.hostname}</span> point here with a <span className="font-mono text-xs">CNAME</span> record. Remove any existing A or CNAME records for this name first.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <p className="font-medium text-fg">Recommended</p>
          {other ? (
            <>
              <p>
                Add both <span className="font-mono text-xs text-fg">{apex ? domain.hostname : other}</span> and <span className="font-mono text-xs text-fg">{apex ? other : domain.hostname}</span>, then turn on “Redirect to primary” for the one that isn’t primary so visitors always land on a single address.
              </p>
              {!hasCounterpart && canManage && (
                <Button size="xs" className="mt-1" leadingIcon={<Plus />} loading={adding} onClick={() => onAddCounterpart(other)}>
                  Add {other}
                </Button>
              )}
            </>
          ) : (
            <p>Keep one primary domain and redirect the others to it so search engines index a single address.</p>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <Clock className="size-3.5" strokeWidth={1.5} />
        DNS changes can take up to 48 hours to propagate. SSL is issued automatically once the records resolve.
      </p>
    </div>
  );
}
