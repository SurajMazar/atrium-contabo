import { WEBHOOK_EVENTS } from '@atrium/schema';

export const ALL_EVENTS: string[] = [...WEBHOOK_EVENTS];

const GROUP_LABELS: Record<string, string> = {
  form: 'Forms',
  page: 'Pages',
  website: 'Websites',
  deployment: 'Deployments',
  media: 'Media',
  user: 'Team',
  domain: 'Domains',
  ai: 'AI',
};

/** Group events by their prefix (`form.submitted` → Forms). */
export function groupedEvents(): Array<{ key: string; label: string; events: string[] }> {
  const groups = new Map<string, string[]>();
  for (const e of ALL_EVENTS) {
    const prefix = e.split('.')[0] ?? e;
    groups.set(prefix, [...(groups.get(prefix) ?? []), e]);
  }
  return [...groups.entries()].map(([key, events]) => ({ key, label: GROUP_LABELS[key] ?? key.replace(/^\w/, (c) => c.toUpperCase()), events }));
}

/** `*` (or every known event) means all events. */
export function isAllEvents(events: string[]): boolean {
  return events.includes('*') || ALL_EVENTS.every((e) => events.includes(e));
}

export function eventsSummary(events: string[]): string {
  if (isAllEvents(events)) return 'All events';
  if (events.length === 1) return events[0]!;
  return `${events.length} events`;
}
