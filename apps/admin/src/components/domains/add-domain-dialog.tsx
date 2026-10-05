'use client';

import type { Domain } from '@atrium/sdk';
import { Button, Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, Field, Input, toast } from '@atrium/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { hostnameError, isApex, normalizeHostname } from './domain-utils';

export function AddDomainDialog({ open, onOpenChange, websiteId, existing, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; websiteId: string; existing: string[]; onAdded: (d: Domain) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [raw, setRaw] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setRaw('');
      setTouched(false);
    }
  }, [open]);

  const host = normalizeHostname(raw);
  const error = hostnameError(host) ?? (existing.includes(host) ? 'This domain is already connected to this website' : null);

  const add = useMutation({
    mutationFn: () => api.domains.add(websiteId, host),
    onSuccess: (d) => {
      qc.setQueryData<Domain[]>(qk.domains(websiteId), (list) => [...(list ?? []), d]);
      void qc.invalidateQueries({ queryKey: qk.domains(websiteId) });
      void qc.invalidateQueries({ queryKey: qk.website(websiteId), exact: true });
      toast.success(`Added ${d.hostname}`, { description: 'Add the DNS records shown, then verify.' });
      onAdded(d);
      onOpenChange(false);
    },
    onError: (err) => toast.error('Could not add domain', { description: errorMessage(err) }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!error) add.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="contents" noValidate>
          <DialogHeader title="Add domain" description="Connect a domain you own. You’ll add DNS records at your registrar next." />
          <DialogBody>
            <Field
              label="Domain"
              error={touched && raw ? error : touched ? 'Enter a domain' : null}
              help={!error && host ? (isApex(host) ? `Root domain — you’ll add an A record for ${host}.` : `Subdomain — you’ll add a CNAME record for ${host}.`) : 'e.g. example.com or www.example.com'}
            >
              <Input
                autoFocus
                prefix={<Globe />}
                value={raw}
                placeholder="example.com"
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                onChange={(e) => setRaw(e.target.value)}
                onBlur={() => raw && setTouched(true)}
              />
            </Field>
            {host && host !== raw.trim() && !error && (
              <p className="mt-2 text-xs text-fg-muted">
                Will add <span className="font-mono text-fg">{host}</span>
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" variant="primary" type="submit" loading={add.isPending}>
              Add domain
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
