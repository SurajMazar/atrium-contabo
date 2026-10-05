'use client';

import { CopyButton } from '@atrium/ui';

const SNIPPET = `import crypto from 'node:crypto';

// Use the raw request body (before JSON parsing).
export function verifyAtriumWebhook(rawBody, headers, secret) {
  const timestamp = headers['x-atrium-timestamp'];
  const signature = headers['x-atrium-signature'] ?? '';

  // Reject stale deliveries (5 minute tolerance) to prevent replays.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest('hex');
  const received = signature.replace(/^sha256=/, '');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const HEADERS: Array<[string, string]> = [
  ['X-Atrium-Event', 'Event name, e.g. form.submitted (ping for tests)'],
  ['X-Atrium-Delivery', 'Unique delivery id — use it to deduplicate retries'],
  ['X-Atrium-Timestamp', 'Unix seconds when the request was signed'],
  ['X-Atrium-Signature', 'sha256=<hex HMAC of "{timestamp}.{body}">'],
];

/** How to verify Atrium webhook signatures, with a copyable Node.js snippet. */
export function SignatureCard() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">Verify signatures</h3>
        <p className="mt-0.5 text-xs text-fg-muted">
          Every request is signed with your webhook’s secret. Compute an HMAC-SHA256 over the timestamp and raw body, then compare it in constant time.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2/60">
            <tr>
              <th className="h-8 px-3 text-left text-xs font-medium text-fg-muted">Header</th>
              <th className="h-8 px-3 text-left text-xs font-medium text-fg-muted">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {HEADERS.map(([h, d]) => (
              <tr key={h}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fg">{h}</td>
                <td className="px-3 py-2 text-xs text-fg-muted">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface-2/40">
        <div className="flex h-9 items-center justify-between border-b border-border pl-3 pr-1">
          <span className="text-xs font-medium text-fg-muted">Node.js</span>
          <CopyButton value={SNIPPET} label="Copy snippet" />
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-fg">{SNIPPET}</pre>
      </div>
    </div>
  );
}
