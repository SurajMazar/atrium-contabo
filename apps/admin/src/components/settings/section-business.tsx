'use client';

import type { BusinessInfo, WebsiteDefinition } from '@atrium/schema';
import { Banner, Field, FieldGroup, Input, Select, Textarea } from '@atrium/ui';
import { Braces } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { DAYS, hoursErrors, OpeningHoursEditor, type Day, type HoursRow } from './opening-hours-editor';
import { SaveBar, useReportDirty } from './save-bar';
import { BindingHint, ReadOnlyBanner, SectionHeading, SectionState } from './section-kit';
import { isEmail, isUrl, opt, useSettingsForm, type FormErrors, type SettingsForm } from './use-settings-form';

interface BusinessForm {
  name: string;
  legalName: string;
  type: string;
  tagline: string;
  description: string;
  phone: string;
  mobile: string;
  whatsapp: string;
  email: string;
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
  formatted: string;
  lat: string;
  lng: string;
  mapsUrl: string;
  openingHours: HoursRow[];
  contactPerson: string;
  priceRange: string;
  foundedYear: string;
}

function read(def: WebsiteDefinition): BusinessForm {
  const b = (def.settings?.business ?? {}) as Partial<BusinessInfo>;
  const a = b.address ?? {};
  return {
    name: b.name ?? '',
    legalName: b.legalName ?? '',
    type: b.type ?? '',
    tagline: b.tagline ?? '',
    description: b.description ?? '',
    phone: b.phone ?? '',
    mobile: b.mobile ?? '',
    whatsapp: b.whatsapp ?? '',
    email: b.email ?? '',
    street: a.street ?? '',
    locality: a.locality ?? '',
    region: a.region ?? '',
    postalCode: a.postalCode ?? '',
    country: a.country ?? '',
    formatted: a.formatted ?? '',
    lat: b.geo ? String(b.geo.lat) : '',
    lng: b.geo ? String(b.geo.lng) : '',
    mapsUrl: b.mapsUrl ?? '',
    openingHours: (b.openingHours ?? []).map((h, i) => ({ key: `h${i}`, days: DAYS.filter((d) => h.days.includes(d)), opens: h.opens, closes: h.closes, label: h.label ?? '' })),
    contactPerson: b.contactPerson ?? '',
    priceRange: b.priceRange ?? '',
    foundedYear: b.foundedYear ? String(b.foundedYear) : '',
  };
}

function write(def: WebsiteDefinition, f: BusinessForm) {
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  const business: BusinessInfo = {
    ...(def.settings.business ?? {}),
    name: f.name.trim(),
    legalName: opt(f.legalName),
    type: opt(f.type),
    tagline: opt(f.tagline),
    description: opt(f.description),
    phone: opt(f.phone),
    mobile: opt(f.mobile),
    whatsapp: opt(f.whatsapp),
    email: opt(f.email),
    address: { street: opt(f.street), locality: opt(f.locality), region: opt(f.region), postalCode: opt(f.postalCode), country: opt(f.country), formatted: opt(f.formatted) },
    geo: f.lat.trim() && f.lng.trim() && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
    mapsUrl: opt(f.mapsUrl),
    openingHours: f.openingHours.map((h) => ({ days: h.days as Day[], opens: h.opens, closes: h.closes, ...(h.label.trim() ? { label: h.label.trim() } : {}) })),
    contactPerson: opt(f.contactPerson),
    priceRange: opt(f.priceRange),
    foundedYear: f.foundedYear.trim() ? Math.trunc(Number(f.foundedYear)) : undefined,
  };
  return { settings: { ...def.settings, business } };
}

function validate(f: BusinessForm): FormErrors {
  const e: FormErrors = {};
  if (!f.name.trim()) e.name = 'Business name is required';
  if (f.email.trim() && !isEmail(f.email)) e.email = 'Enter a valid email address';
  if (f.mapsUrl.trim() && !isUrl(f.mapsUrl)) e.mapsUrl = 'Enter a full URL';
  const latN = Number(f.lat);
  const lngN = Number(f.lng);
  if (f.lat.trim() && (!Number.isFinite(latN) || latN < -90 || latN > 90)) e.lat = 'Between -90 and 90';
  if (f.lng.trim() && (!Number.isFinite(lngN) || lngN < -180 || lngN > 180)) e.lng = 'Between -180 and 180';
  if (!!f.lat.trim() !== !!f.lng.trim()) e[f.lat.trim() ? 'lng' : 'lat'] = 'Set both coordinates';
  const y = Number(f.foundedYear);
  if (f.foundedYear.trim() && (!Number.isInteger(y) || y < 1000 || y > new Date().getFullYear())) e.foundedYear = 'Enter a four-digit year';
  if (Object.keys(hoursErrors(f.openingHours)).length) e.openingHours = 'Complete or remove the highlighted opening hours';
  return e;
}

const PRICE = ['$', '$$', '$$$', '$$$$'];

export function BusinessSection({ websiteId }: { websiteId: string }) {
  const f = useSettingsForm({ websiteId, read, write, validate, successMessage: 'Business details saved' });
  return (
    <SectionState isPending={f.isPending} isError={f.isError} error={f.error} onRetry={f.refetch} groups={3}>
      {() => <BusinessFields websiteId={websiteId} f={f} />}
    </SectionState>
  );
}

function BusinessFields({ websiteId, f }: { websiteId: string; f: SettingsForm<BusinessForm> }) {
  const { can } = useSession();
  const canEdit = can('website.update', websiteId);
  useReportDirty(f.dirty);
  const v = f.form!;
  const e = f.errors;
  const dis = !canEdit;
  const text = (key: keyof BusinessForm, label: string, opts: { binding?: string; placeholder?: string; type?: string; help?: ReactNode; required?: boolean; mono?: boolean; className?: string } = {}) => (
    <Field label={label} required={opts.required} error={e[key]} help={opts.help} hint={opts.binding ? <BindingHint path={opts.binding} /> : undefined} className={opts.className}>
      <Input value={v[key] as string} onChange={(ev) => f.patch({ [key]: ev.target.value } as Partial<BusinessForm>)} disabled={dis} placeholder={opts.placeholder} type={opts.type} className={opts.mono ? 'font-mono' : undefined} />
    </Field>
  );

  return (
    <div>
      <SectionHeading title="Business & contact" description="Company details used across the site, in contact blocks and in structured data." />
      {!canEdit && <ReadOnlyBanner permission="website.update" />}
      <Banner tone="info" icon={<Braces />} className="mb-4">
        These details feed <code className="font-mono text-xs">{'{{business.*}}'}</code> bindings in the builder, e.g. <code className="font-mono text-xs">{'{{business.phone}}'}</code>. Click a binding next to a field to copy it.
      </Banner>
      <div className="space-y-4">
        <FieldGroup title="Company">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('name', 'Company name', { binding: 'business.name', required: true })}
            {text('legalName', 'Legal name', { binding: 'business.legalName', placeholder: 'Harbor House Hospitality Ltd.' })}
            {text('type', 'Business type', { binding: 'business.type', placeholder: 'Boutique hotel', help: 'Used for structured data, e.g. Hotel or Restaurant.' })}
            {text('tagline', 'Tagline', { binding: 'business.tagline', placeholder: 'Rooms by the sea since 1962' })}
            <Field label="Description" hint={<BindingHint path="business.description" />} className="sm:col-span-2">
              <Textarea value={v.description} onChange={(ev) => f.patch({ description: ev.target.value })} disabled={dis} rows={3} />
            </Field>
            <Field label="Price range" hint={<BindingHint path="business.priceRange" />}>
              <Select value={v.priceRange || 'none'} onValueChange={(p) => f.patch({ priceRange: p === 'none' ? '' : p })} disabled={dis} options={[{ value: 'none', label: 'Not specified' }, ...PRICE.map((p) => ({ value: p, label: p })), ...(v.priceRange && !PRICE.includes(v.priceRange) ? [{ value: v.priceRange, label: v.priceRange }] : [])]} />
            </Field>
            {text('foundedYear', 'Founded', { binding: 'business.foundedYear', placeholder: '1962', type: 'number' })}
            {text('contactPerson', 'Contact person', { binding: 'business.contactPerson', placeholder: 'Maya Lindqvist' })}
          </div>
        </FieldGroup>

        <FieldGroup title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('phone', 'Phone', { binding: 'business.phone', type: 'tel', placeholder: '+1 555 010 0199' })}
            {text('mobile', 'Mobile', { binding: 'business.mobile', type: 'tel' })}
            {text('whatsapp', 'WhatsApp', { binding: 'business.whatsapp', type: 'tel', help: 'International format, digits only works best.' })}
            {text('email', 'Email', { binding: 'business.email', type: 'email', placeholder: 'hello@example.com' })}
          </div>
        </FieldGroup>

        <FieldGroup title="Address and map">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('street', 'Street', { binding: 'business.address.street', className: 'sm:col-span-2' })}
            {text('locality', 'City', { binding: 'business.address.locality' })}
            {text('region', 'Region / state', { binding: 'business.address.region' })}
            {text('postalCode', 'Postal code', { binding: 'business.address.postalCode' })}
            {text('country', 'Country', { binding: 'business.address.country' })}
            <Field label="Formatted address" optional hint={<BindingHint path="business.address.formatted" />} help="Shown where a single line is needed. Leave empty to build it from the fields above." className="sm:col-span-2">
              <Input value={v.formatted} onChange={(ev) => f.patch({ formatted: ev.target.value })} disabled={dis} />
            </Field>
            {text('lat', 'Latitude', { placeholder: '59.3293', mono: true })}
            {text('lng', 'Longitude', { placeholder: '18.0686', mono: true })}
            {text('mapsUrl', 'Google Maps URL', { binding: 'business.mapsUrl', placeholder: 'https://maps.google.com/…', mono: true, className: 'sm:col-span-2' })}
          </div>
        </FieldGroup>

        <FieldGroup title="Opening hours" description="Group days that share the same hours. Add several rows for split shifts.">
          <OpeningHoursEditor value={v.openingHours} onChange={(openingHours) => f.patch({ openingHours })} disabled={dis} />
        </FieldGroup>
      </div>
      <SaveBar dirty={f.dirty} saving={f.saving} disabled={dis} onSave={() => void f.save()} onDiscard={f.discard} />
    </div>
  );
}
