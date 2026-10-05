'use client';

import type { ProviderRecord, TestResult } from '@atrium/sdk';
import { Button, Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, Field, Input, Spinner } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';
import { providerApi, type KindMeta } from './kinds';
import { TestResultBanner } from './test-result';

/**
 * Sends a test through a configured provider. Email/SMS ask for a recipient;
 * other kinds run immediately when the dialog opens.
 */
export function TestDialog({ orgId, meta, record, onOpenChange }: { orgId: string; meta: KindMeta; record: ProviderRecord | null; onOpenChange: (open: boolean) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useSession();
  const [to, setTo] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const autoRan = useRef<string | null>(null);

  const test = useMutation({
    mutationFn: (vars: { id: string; to?: string }) => providerApi(api, meta).test(vars.id, vars.to),
    onSuccess: (r) => setResult(r),
    onError: (err) => setResult({ ok: false, message: errorMessage(err, 'The test request failed') }),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.providers(orgId, meta.kind) }),
  });

  const open = !!record;
  const { mutate } = test;
  useEffect(() => {
    if (!record) {
      autoRan.current = null;
      return;
    }
    setResult(null);
    setTo(meta.testRecipient === 'email' ? (user?.email ?? '') : '');
    if (!meta.testRecipient && autoRan.current !== record.id) {
      autoRan.current = record.id;
      mutate({ id: record.id });
    }
  }, [record, meta.testRecipient, user?.email, mutate]);

  const recipientInvalid = meta.testRecipient === 'email' ? !/^\S+@\S+\.\S+$/.test(to.trim()) : meta.testRecipient === 'phone' ? !/^\+?[0-9\s().-]{6,}$/.test(to.trim()) : false;

  const run = () => {
    if (!record || recipientInvalid) return;
    setResult(null);
    test.mutate({ id: record.id, to: meta.testRecipient ? to.trim() : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          title={meta.testRecipient === 'email' ? 'Send test email' : meta.testRecipient === 'phone' ? 'Send test SMS' : 'Test connection'}
          description={record ? `Using “${record.name}”` : undefined}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <DialogBody className="space-y-4">
            {meta.testRecipient && (
              <Field
                label={meta.testRecipient === 'email' ? 'Recipient' : 'Phone number'}
                help={meta.testRecipient === 'phone' ? 'International format, e.g. +14155550123. Carrier fees may apply.' : 'A short message confirming the provider works will be sent here.'}
              >
                <Input
                  autoFocus
                  type={meta.testRecipient === 'email' ? 'email' : 'tel'}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={meta.testRecipient === 'email' ? 'you@example.com' : '+14155550123'}
                />
              </Field>
            )}
            {test.isPending && (
              <div className="flex items-center gap-2 text-sm text-fg-muted">
                <Spinner className="size-4" /> {meta.testRecipient ? 'Sending…' : 'Checking credentials…'}
              </div>
            )}
            {result && !test.isPending && <TestResultBanner result={result} />}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" type="button">
                Close
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" variant="primary" leadingIcon={<Send />} loading={test.isPending} disabled={recipientInvalid}>
              {result ? 'Run again' : meta.testRecipient ? 'Send test' : 'Run test'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
