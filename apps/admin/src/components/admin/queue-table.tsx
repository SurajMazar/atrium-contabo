'use client';

import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@atrium/ui';
import { formatNumber } from '@/lib/format';
import { num, rec } from './narrow';

export const QUEUE_COLUMNS = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;

export interface QueueRow {
  queue: string;
  counts: Record<string, unknown>;
}

/** Per-queue BullMQ job counts. */
export function QueueTable({ queues, onSelect }: { queues: QueueRow[]; onSelect?: (queue: string) => void }) {
  return (
    <TableContainer>
      <Table>
        <THead>
          <tr>
            <TH>Queue</TH>
            {QUEUE_COLUMNS.map((c) => (
              <TH key={c} align="right" className="capitalize">
                {c}
              </TH>
            ))}
          </tr>
        </THead>
        <TBody>
          {queues.map((q) => {
            const counts = rec(q.counts);
            const failed = num(counts.failed);
            return (
              <TR key={q.queue} interactive={!!onSelect} onClick={onSelect ? () => onSelect(q.queue) : undefined}>
                <TD mono className="text-fg">
                  {q.queue}
                </TD>
                {QUEUE_COLUMNS.map((c) => {
                  const v = num(counts[c]);
                  return (
                    <TD key={c} align="right" className={c === 'failed' && failed > 0 ? 'font-medium text-danger' : c === 'active' && v > 0 ? 'text-fg' : 'text-fg-muted'}>
                      {formatNumber(v)}
                    </TD>
                  );
                })}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableContainer>
  );
}
