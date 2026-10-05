'use client';

import type { User } from '@atrium/sdk';
import { Avatar, Button, Field, FieldGroup, Input, Select, toast } from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'sv', label: 'Svenska' },
  { value: 'pl', label: 'Polski' },
  { value: 'ja', label: '日本語' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'hi', label: 'हिन्दी' },
];

function validUrl(v: string) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function ProfileSection({ user }: { user: User }) {
  const api = useApi();
  const { reload } = useSession();
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '');
  const [locale, setLocale] = useState(user.locale || 'en');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setName(user.name);
    setAvatarUrl(user.avatarUrl ?? '');
    setLocale(user.locale || 'en');
  }, [user.name, user.avatarUrl, user.locale]);

  const dirty = name.trim() !== user.name || avatarUrl.trim() !== (user.avatarUrl ?? '') || locale !== (user.locale || 'en');
  const nameError = submitted && !name.trim() ? 'Name is required' : undefined;
  const urlError = avatarUrl.trim() && !validUrl(avatarUrl.trim()) ? 'Enter a full URL starting with https://' : undefined;
  const localeOptions = LOCALES.some((l) => l.value === locale) ? LOCALES : [{ value: locale, label: locale }, ...LOCALES];

  const save = useMutation({
    mutationFn: () => api.auth.updateMe({ name: name.trim(), avatarUrl: avatarUrl.trim() || null, locale }),
    onSuccess: async () => {
      await reload();
      toast.success('Profile updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not update profile')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || urlError) return;
    save.mutate();
  };

  return (
    <section id="profile" className="scroll-mt-6">
      <form onSubmit={submit}>
        <FieldGroup title="Profile" description="How you appear to teammates in comments, activity and the audit log.">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar src={!urlError ? avatarUrl.trim() || null : null} name={name || user.email} size="lg" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{name || 'Your name'}</div>
                <div className="truncate text-xs text-fg-muted">{user.email}</div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required error={nameError}>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
              </Field>
              <Field label="Email" help="Contact support to change your sign-in email.">
                <Input value={user.email} readOnly disabled />
              </Field>
              <Field label="Avatar URL" optional error={urlError} help={!urlError ? 'Link to a square image, at least 128×128.' : undefined} className="sm:col-span-2">
                <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" inputMode="url" spellCheck={false} />
              </Field>
              <Field label="Language" help="Used for emails and date formatting.">
                <Select value={locale} onValueChange={setLocale} options={localeOptions} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              {dirty && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setName(user.name);
                    setAvatarUrl(user.avatarUrl ?? '');
                    setLocale(user.locale || 'en');
                    setSubmitted(false);
                  }}
                >
                  Discard
                </Button>
              )}
              <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!dirty || !!urlError}>
                Save profile
              </Button>
            </div>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
