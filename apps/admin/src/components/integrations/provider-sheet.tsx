'use client';

import type { DriverInfo, ProviderInput, ProviderRecord, WebsiteSummary } from '@atrium/sdk';
import {
  Banner,
  Button,
  cn,
  EmptyState,
  ErrorState,
  Field,
  Input,
  JsonSchemaForm,
  Select,
  Sheet,
  SheetContent,
  Skeleton,
  Switch,
  applySchemaDefaults,
  toast,
  validateAgainstSchema,
  type JsonSchema,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Send } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { maskedStrings, providerApi, typedSecrets, type KindMeta } from './kinds';

const ALL = '__all__';

function hasFields(schema: unknown): boolean {
  const p = (schema as JsonSchema | undefined)?.properties;
  return !!p && Object.values(p).some((x) => !x['x-hidden']);
}

export interface ProviderSheetProps {
  orgId: string;
  meta: KindMeta;
  /** null = closed, 'new' = create, record = edit */
  target: ProviderRecord | 'new' | null;
  onOpenChange: (open: boolean) => void;
  onTest: (record: ProviderRecord) => void;
  existingCount: number;
}

export function ProviderSheet({ orgId, meta, target, onOpenChange, onTest, existingCount }: ProviderSheetProps) {
  const open = target !== null;
  const record = target && target !== 'new' ? target : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {open && <ProviderSheetBody key={record?.id ?? 'new'} orgId={orgId} meta={meta} record={record} onClose={() => onOpenChange(false)} onTest={onTest} existingCount={existingCount} />}
    </Sheet>
  );
}

function ProviderSheetBody({ orgId, meta, record, onClose, onTest, existingCount }: { orgId: string; meta: KindMeta; record: ProviderRecord | null; onClose: () => void; onTest: (r: ProviderRecord) => void; existingCount: number }) {
  const api = useApi();
  const qc = useQueryClient();
  const isNew = !record;

  const drivers = useQuery({ queryKey: qk.drivers(meta.kind), queryFn: () => api.providers.drivers(meta.kind), staleTime: 5 * 60_000 });
  const websites = useQuery({ queryKey: qk.websites(orgId), queryFn: () => api.websites.list(orgId), enabled: meta.scoped, staleTime: 60_000 });

  const [driverId, setDriverId] = useState<string | null>(record?.driver ?? null);
  const [name, setName] = useState(record?.name ?? '');
  const [config, setConfig] = useState<Record<string, unknown>>(record?.config ?? {});
  const [secrets, setSecrets] = useState<Record<string, unknown>>({});
  const [fromEmail, setFromEmail] = useState(record?.fromEmail ?? '');
  const [fromName, setFromName] = useState(record?.fromName ?? '');
  const [isDefault, setIsDefault] = useState(record?.isDefault ?? existingCount === 0);
  const [websiteId, setWebsiteId] = useState<string>(record?.websiteId ?? ALL);
  const [errors, setErrors] = useState<{ name?: string; fromEmail?: string; config: Record<string, string>; secrets: Record<string, string> }>({ config: {}, secrets: {} });
  const [dirty, setDirty] = useState(false);

  const driver: DriverInfo | undefined = useMemo(() => drivers.data?.find((d) => d.id === driverId), [drivers.data, driverId]);
  const masked = useMemo(() => maskedStrings(record?.secrets), [record?.secrets]);

  // Auto-select when a kind has a single driver.
  useEffect(() => {
    if (isNew && !driverId && drivers.data?.length === 1) pickDriver(drivers.data[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers.data]);

  function pickDriver(d: DriverInfo) {
    if (!isNew) return;
    setDriverId(d.id);
    setConfig(applySchemaDefaults(d.config, {}));
    setSecrets({});
    setErrors({ config: {}, secrets: {} });
    if (!name.trim() || drivers.data?.some((x) => x.name === name)) setName(d.name);
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const typed = typedSecrets(secrets);
      const base: ProviderInput = {
        name: name.trim(),
        driver: driverId!,
        config,
        isDefault,
      };
      if (meta.hasFrom) {
        base.fromEmail = fromEmail.trim();
        if (fromName.trim()) base.fromName = fromName.trim();
      }
      if (isNew) {
        if (meta.scoped && websiteId !== ALL) base.websiteId = websiteId;
        return providerApi(api, meta).create(orgId, { ...base, secrets: typed });
      }
      const patch: Partial<ProviderInput> = { name: base.name, config, isDefault };
      if (meta.hasFrom) {
        patch.fromEmail = base.fromEmail;
        patch.fromName = fromName.trim();
      }
      if (Object.keys(typed).length > 0) patch.secrets = typed;
      return providerApi(api, meta).update(record!.id, patch);
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: qk.providers(orgId, meta.kind) });
      toast.success(isNew ? `${meta.noun} added` : `${meta.noun} saved`);
      setDirty(false);
      setSecrets({});
      onClose();
      // Offer an immediate test of a newly added provider.
      if (isNew) toast(`Test “${saved.name}” now?`, { action: { label: meta.testRecipient ? 'Send test' : 'Run test', onClick: () => onTest(saved) } });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not save provider')),
  });

  const submit = () => {
    if (!driver) {
      toast.error('Choose a driver first');
      return;
    }
    const next: typeof errors = { config: validateAgainstSchema(driver.config, config), secrets: validateAgainstSchema(driver.secrets, typedSecrets(secrets), { masked }) };
    if (!name.trim()) next.name = 'Name is required';
    if (meta.hasFrom) {
      if (!fromEmail.trim()) next.fromEmail = 'From email is required';
      else if (!/^\S+@\S+\.\S+$/.test(fromEmail.trim())) next.fromEmail = 'Enter a valid email address';
    }
    setErrors(next);
    const count = (next.name ? 1 : 0) + (next.fromEmail ? 1 : 0) + Object.keys(next.config).length + Object.keys(next.secrets).length;
    if (count > 0) {
      toast.error(`Fix ${count} ${count === 1 ? 'field' : 'fields'} before saving`);
      return;
    }
    save.mutate();
  };

  const websiteName = (id: string | null) => (id ? (websites.data?.find((w) => w.id === id)?.name ?? 'A specific website') : 'All websites');

  return (
    <SheetContent
      size="lg"
      title={isNew ? `Add ${meta.noun.toLowerCase()}` : record.name}
      description={isNew ? 'Choose a driver, then fill in its settings and credentials.' : (driver?.name ?? record.driver)}
      bodyClassName="p-0"
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" size="sm" leadingIcon={<Send />} className="mr-auto" onClick={() => onTest(record)} disabled={dirty} title={dirty ? 'Save changes before testing' : undefined}>
              {meta.testRecipient ? 'Send test' : 'Test connection'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={save.isPending} disabled={!driver || (!isNew && !dirty)} onClick={submit}>
            {isNew ? 'Add provider' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form
        className="divide-y divide-border"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onChange={() => setDirty(true)}
      >
        {/* Driver */}
        <section className="space-y-3 p-4">
          <SectionLabel>Driver</SectionLabel>
          {drivers.isPending ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : drivers.isError ? (
            <ErrorState className="py-6" description={drivers.error.message} onRetry={() => void drivers.refetch()} />
          ) : drivers.data.length === 0 ? (
            <EmptyState compact title="No drivers available" description={`This Atrium installation has no ${meta.label} drivers enabled.`} />
          ) : isNew ? (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Driver">
              {drivers.data.map((d) => {
                const on = d.id === driverId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickDriver(d)}
                    className={cn(
                      'relative flex min-h-16 flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-accent bg-accent-soft/40' : 'border-border bg-surface hover:border-border-strong',
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-sm font-medium text-fg">
                      {d.name}
                      {on && <Check className="size-4 text-accent" strokeWidth={2} />}
                    </span>
                    <span className="line-clamp-2 text-xs text-fg-muted">{d.description}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-surface-2/50 px-3 py-2.5">
              <div className="text-sm font-medium text-fg">{driver?.name ?? record.driver}</div>
              <div className="text-xs text-fg-muted">{driver?.description ?? 'Driver details unavailable.'}</div>
              <p className="mt-1.5 text-2xs text-fg-subtle">The driver can’t be changed. Add a new provider to switch drivers.</p>
            </div>
          )}
        </section>

        {driver && (
          <>
            <section className="space-y-4 p-4">
              <SectionLabel>General</SectionLabel>
              <Field label="Name" required error={errors.name} help="Shown in pickers and logs.">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={driver.name} autoFocus={!isNew} />
              </Field>
              {meta.hasFrom && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="From email" required error={errors.fromEmail} help="Must be verified with the provider.">
                    <Input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="hello@yourdomain.com" />
                  </Field>
                  <Field label="From name" optional>
                    <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your company" />
                  </Field>
                </div>
              )}
              {meta.scoped && (
                <Field
                  label="Websites"
                  help={isNew ? 'Scope this provider to one website, or make it available to every website in the organization.' : 'Scope is fixed after creation.'}
                >
                  {isNew ? (
                    <Select
                      value={websiteId}
                      onValueChange={(v) => {
                        setWebsiteId(v);
                        setDirty(true);
                      }}
                      disabled={websites.isPending}
                      options={[
                        { value: ALL, label: 'All websites' },
                        ...((websites.data ?? []) as WebsiteSummary[]).map((w) => ({ value: w.id, label: w.name, description: w.primaryDomain ?? w.slug })),
                      ]}
                    />
                  ) : (
                    <Input value={websiteName(record.websiteId)} readOnly disabled />
                  )}
                </Field>
              )}
              <Switch
                label={`Default ${meta.noun.toLowerCase()}`}
                description={meta.scoped && websiteId !== ALL ? 'Used for this website instead of the organization default.' : 'Used by every website that doesn’t have its own provider.'}
                checked={isDefault}
                onCheckedChange={(v) => {
                  setIsDefault(v);
                  setDirty(true);
                }}
              />
            </section>

            <section className="space-y-3 p-4">
              <SectionLabel>Configuration</SectionLabel>
              <JsonSchemaForm
                schema={driver.config}
                value={config}
                onChange={(v) => {
                  setConfig(v);
                  setDirty(true);
                }}
                errors={errors.config}
                presets={driver.presets}
                onPresetApply={(p) => {
                  setConfig((c) => ({ ...c, ...p.config }));
                  setDirty(true);
                  toast.success(`Applied ${p.name} preset`);
                }}
              />
            </section>

            <section className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Credentials</SectionLabel>
                {hasFields(driver.secrets) && (
                  <span className="inline-flex items-center gap-1 text-2xs text-fg-subtle">
                    <KeyRound className="size-3" strokeWidth={1.5} /> Encrypted at rest, never shown again
                  </span>
                )}
              </div>
              {!isNew && Object.keys(masked).length > 0 && <p className="text-xs text-fg-muted">Stored values are kept unless you replace them.</p>}
              <JsonSchemaForm
                schema={driver.secrets}
                value={secrets}
                onChange={(v) => {
                  setSecrets(v);
                  setDirty(true);
                }}
                secret
                masked={masked}
                errors={errors.secrets}
              />
            </section>
            {record?.lastTestOk === false && (
              <div className="p-4">
                <Banner tone="warning">The last test failed {record.lastTestedAt ? `(${new Date(record.lastTestedAt).toLocaleString()})` : ''}. Check the credentials and run a new test after saving.</Banner>
              </div>
            )}
            {/* Enter-to-submit */}
            <button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
          </>
        )}
      </form>
    </SheetContent>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{children}</h3>;
}
