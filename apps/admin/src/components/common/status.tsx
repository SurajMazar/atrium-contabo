import type { Deployment, PageSummary, SubmissionStatus, WebsiteStatus } from '@atrium/sdk';
import { Badge, StatusDot, type BadgeTone } from '@atrium/ui';

export function WebsiteStatusBadge({ status }: { status: WebsiteStatus }) {
  const map: Record<WebsiteStatus, { tone: BadgeTone; label: string }> = {
    DRAFT: { tone: 'neutral', label: 'Draft' },
    PUBLISHED: { tone: 'success', label: 'Published' },
    SUSPENDED: { tone: 'danger', label: 'Suspended' },
    ARCHIVED: { tone: 'outline', label: 'Archived' },
  };
  const m = map[status] ?? { tone: 'neutral' as const, label: status };
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function PageStatusBadge({ status }: { status: PageSummary['status'] | string }) {
  const s = String(status).toUpperCase();
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    DRAFT: { tone: 'neutral', label: 'Draft' },
    PUBLISHED: { tone: 'success', label: 'Published' },
    SCHEDULED: { tone: 'accent', label: 'Scheduled' },
    ARCHIVED: { tone: 'outline', label: 'Archived' },
  };
  const m = map[s] ?? { tone: 'neutral' as const, label: s.toLowerCase() };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const depMap: Record<Deployment['status'], { tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; label: string; pulse?: boolean }> = {
  QUEUED: { tone: 'neutral', label: 'Queued', pulse: true },
  BUILDING: { tone: 'warning', label: 'Building', pulse: true },
  READY: { tone: 'success', label: 'Ready' },
  FAILED: { tone: 'danger', label: 'Failed' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};

export function DeploymentStatus({ status }: { status: Deployment['status'] }) {
  const m = depMap[status] ?? { tone: 'neutral' as const, label: status };
  return <StatusDot tone={m.tone} pulse={m.pulse} label={m.label} />;
}

export const SUBMISSION_STATUS_META: Record<SubmissionStatus, { label: string; tone: BadgeTone }> = {
  NEW: { label: 'New', tone: 'accent' },
  CONTACTED: { label: 'Contacted', tone: 'neutral' },
  QUALIFIED: { label: 'Qualified', tone: 'warning' },
  CONVERTED: { label: 'Converted', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'outline' },
  SPAM: { label: 'Spam', tone: 'danger' },
  ARCHIVED: { label: 'Archived', tone: 'outline' },
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const m = SUBMISSION_STATUS_META[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** Generic status (domains, SSL, DNS, providers…). */
export function GenericStatus({ value }: { value: string | null | undefined }) {
  const v = String(value ?? 'unknown').toLowerCase();
  const tone: BadgeTone = /(active|verified|valid|ready|issued|ok|success|configured|connected)/.test(v)
    ? 'success'
    : /(pending|verifying|provisioning|queued|building|retrying)/.test(v)
      ? 'warning'
      : /(fail|error|invalid|misconfigured|expired)/.test(v)
        ? 'danger'
        : 'neutral';
  return (
    <Badge tone={tone} dot>
      {v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
