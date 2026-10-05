'use client';

import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { flushSaves } from '../persistence/autosave';
import { useSaveStore } from '../persistence/autosave';
import { cn } from '../lib/cn';
import { Tip } from '../ui/primitives';

function ago(ts: number | null, now: number): string {
  if (!ts) return '';
  const s = Math.round((now - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Always-visible persistence state, so nobody wonders whether work is saved. */
export function SaveIndicator() {
  const { status, lastSavedAt, error, dirtyCount } = useSaveStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setNow(Date.now());
  }, [lastSavedAt]);

  let icon = <Check className="size-3.5" />;
  let text = lastSavedAt ? `Saved · ${ago(lastSavedAt, now)}` : 'All changes saved';
  let tone = 'text-fg-subtle';
  let tip = 'Changes save automatically.';
  if (status === 'pending') {
    icon = <span className="size-1.5 rounded-full bg-fg-subtle" />;
    text = 'Unsaved changes';
    tip = `${dirtyCount} unit${dirtyCount === 1 ? '' : 's'} waiting to save`;
  } else if (status === 'saving') {
    icon = <Loader2 className="size-3.5 animate-spin" />;
    text = 'Saving…';
  } else if (status === 'offline') {
    icon = <CloudOff className="size-3.5" />;
    text = 'Offline · changes kept';
    tone = 'text-warning';
    tip = 'You are offline. Changes are kept in this tab and will save when the connection returns.';
  } else if (status === 'error') {
    icon = <RefreshCw className="size-3.5" />;
    text = 'Save failed — retry';
    tone = 'text-danger';
    tip = error ?? 'Saving failed. Click to retry.';
  } else if (status === 'conflict') {
    icon = <AlertTriangle className="size-3.5" />;
    text = 'Conflict';
    tone = 'text-warning';
    tip = 'Someone else saved a newer version. Resolve it in the banner below the toolbar.';
  }
  const clickable = status === 'error' || status === 'offline' || status === 'pending';
  return (
    <Tip content={tip}>
      <button
        type="button"
        onClick={() => clickable && void flushSaves()}
        className={cn('flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs', tone, clickable && 'hover:bg-surface-2')}
        aria-live="polite"
      >
        {icon}
        {text}
      </button>
    </Tip>
  );
}
