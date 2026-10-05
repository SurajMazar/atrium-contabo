'use client';

import type { TestResult } from '@atrium/sdk';
import { Banner } from '@atrium/ui';
import { CircleCheck, CircleX } from 'lucide-react';

function show(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Renders a provider TestResult (ok / message / details) as a banner. */
export function TestResultBanner({ result }: { result: TestResult }) {
  const details = result.details && typeof result.details === 'object' ? Object.entries(result.details) : [];
  return (
    <Banner tone={result.ok ? 'success' : 'danger'} icon={result.ok ? <CircleCheck /> : <CircleX />}>
      <p className="font-medium">{result.ok ? 'Test passed' : 'Test failed'}</p>
      {result.message && <p className="mt-0.5 break-words text-fg-muted">{result.message}</p>}
      {details.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {details.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-subtle">{k}</dt>
              <dd className="min-w-0 break-all font-mono text-fg-muted">{show(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Banner>
  );
}
