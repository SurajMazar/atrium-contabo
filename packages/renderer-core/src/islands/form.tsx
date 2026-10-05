'use client';

import { evaluateConditionGroup, validateSubmission, type FormDefinition, type FormField } from '@atrium/schema';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { mountCaptcha, type CaptchaConfig, type CaptchaHandle } from './captcha';

export interface FormIslandProps {
  form: Pick<FormDefinition, 'id' | 'fields' | 'settings'>;
  formId: string;
  apiBaseUrl?: string;
  mode: 'live' | 'preview' | 'editor';
  locale: string;
  captcha?: CaptchaConfig | null;
  submitLabel?: string;
  /** grid: respects field widths; stacked: one per row; inline: single row (newsletter). */
  layout?: 'grid' | 'stacked' | 'inline';
  placeholder?: string;
  className?: string;
}

type Values = Record<string, unknown>;
type Status = { kind: 'idle' | 'submitting' | 'success' | 'error'; message?: string };

const INPUT_TYPE: Partial<Record<FormField['type'], string>> = {
  text: 'text', email: 'email', phone: 'tel', number: 'number', url: 'url', date: 'date', time: 'time', datetime: 'datetime-local', custom: 'text',
};
const AUTOCOMPLETE: Record<string, string> = {
  name: 'name', fullName: 'name', firstName: 'given-name', lastName: 'family-name', email: 'email', phone: 'tel', company: 'organization', organisation: 'organization',
};

function initialValues(fields: FormField[]): Values {
  const v: Values = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) v[f.name] = f.defaultValue;
    else if (f.type === 'multiselect' || (f.type === 'checkbox' && f.options?.length)) v[f.name] = [];
    else if (f.type === 'checkbox' || f.type === 'consent') v[f.name] = false;
    else v[f.name] = '';
  }
  return v;
}

export function FormIsland({ form, formId, apiBaseUrl, mode, locale, captcha, submitLabel, layout = 'grid', placeholder, className }: FormIslandProps) {
  const uid = useId().replace(/:/g, '');
  const settings = form.settings ?? ({} as FormDefinition['settings']);
  const [values, setValues] = useState<Values>(() => initialValues(form.fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const formRef = useRef<HTMLFormElement>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const captchaHandle = useRef<CaptchaHandle | null>(null);
  const hpRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<Record<string, File[]>>({});
  const editor = mode === 'editor';

  const visible = useMemo(() => form.fields.filter((f) => !f.showIf || evaluateConditionGroup(f.showIf, values)), [form.fields, values]);

  // Lazy captcha: mount when the form nears the viewport or receives focus.
  useEffect(() => {
    const el = formRef.current;
    if (!el || !captcha?.siteKey || editor) return;
    const win = el.ownerDocument.defaultView ?? window;
    let started = false;
    const start = () => {
      if (started || !captchaRef.current) return;
      started = true;
      mountCaptcha(captchaRef.current, captcha).then((h) => (captchaHandle.current = h)).catch(() => undefined);
    };
    const io = new win.IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && start(), { rootMargin: '300px' });
    io.observe(el);
    el.addEventListener('focusin', start, { once: true });
    return () => {
      io.disconnect();
      el.removeEventListener('focusin', start);
    };
  }, [captcha, editor]);

  const set = useCallback((name: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      if (submitted) {
        const res = validateSubmission(form, next);
        setErrors(Object.fromEntries(res.errors.map((e) => [e.field, e.message])));
      }
      return next;
    });
  }, [form, submitted]);

  const focusFirstError = (errs: Record<string, string>) => {
    const first = form.fields.find((f) => errs[f.name]);
    if (!first) return;
    const doc = formRef.current?.ownerDocument;
    const el = doc?.getElementById(`${uid}-${first.name}`) ?? doc?.querySelector<HTMLElement>(`[name="${first.name}"]`);
    el?.focus();
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === 'submitting') return;
    setSubmitted(true);
    const res = validateSubmission(form, values);
    const errs = Object.fromEntries(res.errors.map((x) => [x.field, x.message]));
    setErrors(errs);
    if (!res.valid) {
      setStatus({ kind: 'error', message: 'Please check the highlighted fields.' });
      focusFirstError(errs);
      return;
    }
    if (editor) {
      setStatus({ kind: 'error', message: 'Form submissions are disabled while editing.' });
      return;
    }
    if (!apiBaseUrl) {
      setStatus({ kind: 'error', message: 'This form is not connected yet.' });
      return;
    }
    setStatus({ kind: 'submitting' });
    let captchaToken: string | null = null;
    if (captcha?.siteKey) {
      captchaToken = (await captchaHandle.current?.getToken().catch(() => null)) ?? null;
      if (!captchaToken) {
        setStatus({ kind: 'error', message: 'Please complete the verification.' });
        return;
      }
    }
    const win = formRef.current?.ownerDocument.defaultView ?? window;
    try {
      const payload = { values: res.values, captchaToken, _hp: hpRef.current?.value ?? '', pageUrl: win.location.href, locale };
      const files = Object.entries(filesRef.current).filter(([name, list]) => list.length && res.values[name] !== undefined);
      let init: RequestInit;
      if (files.length) {
        // Uploads go as multipart: `values` is JSON, files are appended under their field name.
        const fd = new FormData();
        fd.set('values', JSON.stringify(payload.values));
        if (captchaToken) fd.set('captchaToken', captchaToken);
        fd.set('_hp', payload._hp);
        fd.set('pageUrl', payload.pageUrl);
        fd.set('locale', locale);
        for (const [name, list] of files) for (const file of list) fd.append(name, file, file.name);
        init = { method: 'POST', body: fd };
      } else {
        init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) };
      }
      const response = await fetch(`${apiBaseUrl}/public/forms/${encodeURIComponent(formId)}/submit`, init);
      if (response.ok) {
        setStatus({ kind: 'success', message: settings.successMessage });
        if (settings.redirectUrl) win.location.assign(settings.redirectUrl);
        else win.requestAnimationFrame(() => successRef.current?.focus());
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; details?: Array<{ field: string; message: string }> } };
      if (response.status === 422 && body.error?.details?.length) {
        const serverErrs = Object.fromEntries(body.error.details.map((d) => [d.field, d.message]));
        setErrors(serverErrs);
        setStatus({ kind: 'error', message: 'Please check the highlighted fields.' });
        focusFirstError(serverErrs);
      } else if (response.status === 429) {
        setStatus({ kind: 'error', message: 'Too many attempts — please wait a minute and try again.' });
      } else {
        setStatus({ kind: 'error', message: body.error?.message ?? 'Something went wrong. Please try again.' });
      }
      captchaHandle.current?.reset();
    } catch {
      setStatus({ kind: 'error', message: 'Network error — please check your connection and try again.' });
    }
  }

  if (status.kind === 'success' && !settings.redirectUrl) {
    return (
      <div ref={successRef} tabIndex={-1} className="a-fm__success" role="status">
        <p className="a-fm__success-title">Thank you</p>
        <p>{status.message}</p>
      </div>
    );
  }

  const label = submitLabel ?? settings.submitLabel ?? 'Send';
  return (
    <form ref={formRef} className={['a-fm', `a-fm--${layout}`, className].filter(Boolean).join(' ')} noValidate onSubmit={onSubmit} aria-describedby={status.message ? `${uid}-status` : undefined}>
      <div className="a-fm__fields">
        {visible.map((f) => (
          <Field key={f.id} field={f} uid={uid} value={values[f.name]} error={errors[f.name]} onChange={set} onFiles={(name, list) => (filesRef.current[name] = list)} hideLabel={layout === 'inline'} placeholder={layout === 'inline' ? placeholder : undefined} consentText={settings.consentText} />
        ))}
        {settings.honeypot !== false ? (
          <div className="a-fm__hp" aria-hidden="true">
            <label>
              Leave this field empty
              <input ref={hpRef} type="text" name="_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>
        ) : null}
        {layout === 'inline' ? <SubmitButton label={label} busy={status.kind === 'submitting'} /> : null}
      </div>
      {captcha?.siteKey && !editor ? <div ref={captchaRef} className="a-fm__captcha" /> : null}
      {layout !== 'inline' ? <SubmitButton label={label} busy={status.kind === 'submitting'} /> : null}
      <p id={`${uid}-status`} className={`a-fm__status${status.kind === 'error' ? ' is-error' : ''}`} role={status.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
        {status.kind === 'submitting' ? 'Sending…' : status.message ?? ''}
      </p>
    </form>
  );
}

function SubmitButton({ label, busy }: { label: string; busy: boolean }) {
  return (
    <div className="a-fm__submit">
      <button type="submit" className="a-btn a-btn--primary" disabled={busy} aria-busy={busy || undefined}>
        <span className="a-btn__label">{busy ? 'Sending…' : label}</span>
      </button>
    </div>
  );
}

interface FieldProps {
  field: FormField;
  uid: string;
  value: unknown;
  error?: string;
  onChange: (name: string, value: unknown) => void;
  onFiles?: (name: string, files: File[]) => void;
  hideLabel?: boolean;
  placeholder?: string;
  consentText?: string;
}

function Field({ field: f, uid, value, error, onChange, onFiles, hideLabel, placeholder, consentText }: FieldProps): ReactNode {
  const id = `${uid}-${f.name}`;
  const helpId = f.helpText ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [helpId, errId].filter(Boolean).join(' ') || undefined;
  const width = `a-field--${f.width ?? 'full'}`;
  const common = { id, name: f.name, required: f.required, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as const;
  const labelEl = (
    <label htmlFor={id} className={hideLabel ? 'a-sr' : 'a-field__label'}>
      {f.label}
      {f.required ? <span className="a-field__req" aria-hidden="true"> *</span> : null}
    </label>
  );
  const meta = (
    <>
      {f.helpText ? <p id={helpId} className="a-field__help">{f.helpText}</p> : null}
      {error ? <p id={errId} className="a-field__error">{error}</p> : null}
    </>
  );

  if (f.type === 'heading') return <h3 className="a-fm__heading a-field--full">{f.label}</h3>;
  if (f.type === 'paragraph') return <p className="a-fm__para a-field--full">{f.helpText ?? f.label}</p>;
  if (f.type === 'hidden') return <input type="hidden" name={f.name} value={String(value ?? '')} />;

  if (f.type === 'textarea') {
    return (
      <div className={`a-field ${width}${error ? ' is-invalid' : ''}`}>
        {labelEl}
        <textarea {...common} rows={5} placeholder={f.placeholder} value={String(value ?? '')} maxLength={f.validation?.maxLength} onChange={(e) => onChange(f.name, e.target.value)} />
        {meta}
      </div>
    );
  }
  if (f.type === 'select') {
    return (
      <div className={`a-field ${width}${error ? ' is-invalid' : ''}`}>
        {labelEl}
        <div className="a-select">
          <select {...common} value={String(value ?? '')} onChange={(e) => onChange(f.name, e.target.value)}>
            <option value="">{f.placeholder ?? 'Select…'}</option>
            {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {meta}
      </div>
    );
  }
  if (f.type === 'radio' || f.type === 'multiselect' || f.type === 'rating' || (f.type === 'checkbox' && f.options?.length)) {
    const multi = f.type !== 'radio' && f.type !== 'rating';
    const options = f.type === 'rating' ? Array.from({ length: f.validation?.max ?? 5 }, (_, i) => ({ label: `${i + 1}`, value: String(i + 1) })) : (f.options ?? []);
    const arr = Array.isArray(value) ? value.map(String) : [];
    return (
      <fieldset className={`a-field a-field--choices ${width}${error ? ' is-invalid' : ''}${f.type === 'rating' ? ' a-field--rating' : ''}`} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
        <legend className="a-field__label">{f.label}{f.required ? <span className="a-field__req" aria-hidden="true"> *</span> : null}</legend>
        <div className="a-choices">
          {options.map((o, i) => {
            const oid = i === 0 ? id : `${id}-${i}`;
            const checked = multi ? arr.includes(o.value) : String(value ?? '') === o.value;
            return (
              <label key={o.value} htmlFor={oid} className="a-choice">
                <input
                  id={oid}
                  type={multi ? 'checkbox' : 'radio'}
                  name={f.name}
                  value={o.value}
                  checked={checked}
                  onChange={(e) => onChange(f.name, multi ? (e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value)) : o.value)}
                />
                <span>{f.type === 'rating' ? `${o.label} ★` : o.label}</span>
              </label>
            );
          })}
        </div>
        {meta}
      </fieldset>
    );
  }
  if (f.type === 'checkbox' || f.type === 'consent') {
    return (
      <div className={`a-field a-field--check ${width}${error ? ' is-invalid' : ''}`}>
        <label htmlFor={id} className="a-choice">
          <input {...common} type="checkbox" checked={value === true} onChange={(e) => onChange(f.name, e.target.checked)} />
          <span>{f.type === 'consent' && consentText ? consentText : f.label}{f.required ? <span className="a-field__req" aria-hidden="true"> *</span> : null}</span>
        </label>
        {meta}
      </div>
    );
  }
  if (f.type === 'file') {
    return (
      <div className={`a-field ${width}${error ? ' is-invalid' : ''}`}>
        {labelEl}
        <input {...common} type="file" multiple={(f.validation?.maxFiles ?? 1) > 1} accept={f.validation?.accept?.join(',')} onChange={(e) => { const list = Array.from(e.target.files ?? []); onFiles?.(f.name, list); onChange(f.name, list.map((file) => file.name).join(', ')); }} />
        {meta}
      </div>
    );
  }
  return (
    <div className={`a-field ${width}${error ? ' is-invalid' : ''}`}>
      {labelEl}
      <input
        {...common}
        type={INPUT_TYPE[f.type] ?? 'text'}
        placeholder={placeholder ?? f.placeholder}
        value={String(value ?? '')}
        min={f.validation?.min}
        max={f.validation?.max}
        minLength={f.validation?.minLength}
        maxLength={f.validation?.maxLength}
        autoComplete={AUTOCOMPLETE[f.name] ?? (f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : undefined)}
        inputMode={f.type === 'number' ? 'numeric' : undefined}
        onChange={(e) => onChange(f.name, e.target.value)}
      />
      {meta}
    </div>
  );
}
