'use client';

import type { AiGeneration, AiProgressStep, Media, SiteBrief } from '@atrium/sdk';
import { SOCIAL_NETWORKS } from '@atrium/schema';
import {
  Banner,
  Button,
  Checkbox,
  ChoiceChips,
  cn,
  Field,
  FieldGroup,
  IconButton,
  Input,
  Select,
  Spinner,
  TagInput,
  Textarea,
  toast,
} from '@atrium/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Check, ChevronDown, Circle, ImagePlus, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Forbidden } from '@/components/common/permission';
import { MediaField } from '@/components/media/media-field';
import { MediaPicker } from '@/components/media/media-picker';
import { thumbUrl } from '@/components/media/media-parts';
import { authFetch, useApi } from '@/lib/api';
import { formatDuration, formatNumber, formatUsd } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { useSession } from '@/lib/session';

const BUSINESS_TYPES = [
  'Hotel or resort',
  'Restaurant or café',
  'Wedding or event venue',
  'Professional services',
  'Clinic or healthcare',
  'Retail or shop',
  'Agency or studio',
  'Fitness or wellness',
  'Real estate',
  'Education',
  'Nonprofit',
  'Other',
];

const STYLES = [
  { value: 'editorial-warm', label: 'Editorial warm', description: 'Serif headlines, warm neutrals, generous whitespace' },
  { value: 'earthy-eco', label: 'Earthy eco', description: 'Natural greens and textures' },
  { value: 'corporate-modern', label: 'Modern corporate', description: 'Crisp sans-serif, confident blue' },
  { value: 'minimal-mono', label: 'Minimal mono', description: 'Black and white, typographic' },
  { value: 'midnight-luxe', label: 'Luxe dark', description: 'Dark backgrounds, gold accents' },
  { value: 'wedding-blush', label: 'Romantic', description: 'Soft blush tones, elegant script accents' },
  { value: 'bistro-classic', label: 'Bistro classic', description: 'Classic, appetizing, menu-friendly' },
];

const PAGE_OPTIONS = ['About', 'Services', 'Rooms', 'Menu', 'Gallery', 'Events', 'Pricing', 'Team', 'Testimonials', 'FAQ', 'Blog', 'Booking', 'Contact'];

/** Canonical generation steps shown before the server reports its own. */
const CANONICAL_STEPS: Array<{ step: string; label: string; match: RegExp }> = [
  { step: 'understand', label: 'Understanding business', match: /understand|brief|analy/i },
  { step: 'plan', label: 'Planning website', match: /plan|sitemap|structure/i },
  { step: 'design', label: 'Creating design system', match: /design|theme|token|style/i },
  { step: 'homepage', label: 'Creating homepage', match: /home/i },
  { step: 'pages', label: 'Creating pages', match: /pages?\b|page/i },
  { step: 'content', label: 'Adding content', match: /content|copy|image|media/i },
  { step: 'seo', label: 'Configuring SEO', match: /seo|meta/i },
  { step: 'preview', label: 'Preparing preview', match: /preview|final|publish|validat/i },
];

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'REVERTED']);

interface BriefState {
  businessName: string;
  businessType: string;
  description: string;
  location: string;
  services: string[];
  audience: string;
  style: string;
  pages: string[];
  phone: string;
  email: string;
  address: string;
  whatsapp: string;
  social: Array<{ network: string; url: string }>;
  logo: Media | null;
  images: Media[];
  prompt: string;
  model: string;
}

const initialBrief: BriefState = {
  businessName: '',
  businessType: '',
  description: '',
  location: '',
  services: [],
  audience: '',
  style: 'editorial-warm',
  pages: ['About', 'Services', 'Gallery', 'Contact'],
  phone: '',
  email: '',
  address: '',
  whatsapp: '',
  social: [],
  logo: null,
  images: [],
  prompt: '',
  model: 'default',
};

export function AiCreate({ generationId: initialGen, websiteId: initialSite }: { generationId: string | null; websiteId: string | null }) {
  const { currentOrg, can } = useSession();
  const router = useRouter();
  const [generation, setGeneration] = useState<{ id: string; websiteId: string | null } | null>(initialGen ? { id: initialGen, websiteId: initialSite } : null);
  const [brief, setBrief] = useState<BriefState>(initialBrief);

  if (!currentOrg) return null;
  if (!can('ai.use') || !can('website.create')) return <div className="py-16"><Forbidden permission="ai.use" /></div>;

  if (generation) {
    return (
      <GenerationProgress
        generationId={generation.id}
        websiteId={generation.websiteId}
        onRetry={() => {
          setGeneration(null);
          router.replace('/w/new/ai');
        }}
      />
    );
  }

  return (
    <BriefForm
      orgId={currentOrg.id}
      brief={brief}
      setBrief={setBrief}
      onStarted={(g) => {
        setGeneration({ id: g.generationId, websiteId: g.websiteId });
        router.replace(`/w/new/ai?generation=${encodeURIComponent(g.generationId)}&website=${encodeURIComponent(g.websiteId)}`);
      }}
    />
  );
}

/* ------------------------------------------------------------------ Brief */

function BriefForm({ orgId, brief, setBrief, onStarted }: { orgId: string; brief: BriefState; setBrief: (b: BriefState | ((p: BriefState) => BriefState)) => void; onStarted: (g: { generationId: string; websiteId: string }) => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Partial<Record<keyof BriefState, string>>>({});
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const models = useQuery({ queryKey: qk.aiModels(), queryFn: () => api.ai.models(), staleTime: 5 * 60_000 });
  const set = <K extends keyof BriefState>(k: K, v: BriefState[K]) => setBrief((p) => ({ ...p, [k]: v }));

  const configured = models.data?.filter((p) => p.configured) ?? [];
  const modelOptions = [
    { value: 'default', label: 'Recommended model' },
    ...configured.flatMap((p) => p.models.map((m) => ({ value: `${p.provider}::${m.id}`, label: `${m.label}`, description: p.provider }))),
  ];

  const generate = useMutation({
    mutationFn: () => {
      const social = Object.fromEntries(brief.social.filter((s) => s.url.trim()).map((s) => [s.network, s.url.trim()]));
      const contact = { phone: brief.phone || undefined, email: brief.email || undefined, address: brief.address || undefined, whatsapp: brief.whatsapp || undefined };
      const payload: SiteBrief = {
        businessName: brief.businessName.trim(),
        businessType: brief.businessType,
        description: brief.description.trim(),
        location: brief.location.trim() || undefined,
        services: brief.services.length ? brief.services : undefined,
        audience: brief.audience.trim() || undefined,
        style: brief.style || undefined,
        pages: ['Home', ...brief.pages],
        contact: Object.values(contact).some(Boolean) ? contact : undefined,
        social: Object.keys(social).length ? social : undefined,
        logoUrl: brief.logo?.url,
        imageUrls: brief.images.length ? brief.images.map((m) => m.url) : undefined,
      };
      const [provider, model] = brief.model !== 'default' ? brief.model.split('::') : [undefined, undefined];
      return api.ai.generateSite(orgId, { brief: payload, prompt: brief.prompt.trim() || undefined, provider, model });
    },
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: qk.websites(orgId) });
      onStarted(g);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not start generation'),
  });

  const submit = () => {
    const errs: typeof errors = {};
    if (!brief.businessName.trim()) errs.businessName = 'Enter your business name';
    if (!brief.businessType) errs.businessType = 'Choose a business type';
    if (brief.description.trim().length < 20) errs.description = 'Describe your business in a sentence or two (20+ characters)';
    if (brief.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brief.email)) errs.email = 'Enter a valid email';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Fill in the required details');
      return;
    }
    generate.mutate();
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Tell us about your business</h1>
        <p className="mt-1 text-sm text-fg-muted">The more specific you are, the better the first draft. Everything stays editable in the builder.</p>
      </div>
      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div className="space-y-4">
          <FieldGroup title="Business">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name" required error={errors.businessName}>
                <Input autoFocus value={brief.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Lakeside Retreat" maxLength={120} />
              </Field>
              <Field label="Business type" required error={errors.businessType}>
                <Select value={brief.businessType || undefined} onValueChange={(v) => set('businessType', v)} placeholder="Choose a type" options={BUSINESS_TYPES.map((t) => ({ value: t, label: t }))} invalid={!!errors.businessType} />
              </Field>
              <Field label="What do you do?" required className="sm:col-span-2" error={errors.description} hint={`${brief.description.length}/1000`}>
                <Textarea rows={4} maxLength={1000} value={brief.description} onChange={(e) => set('description', e.target.value)} placeholder="A 12-room boutique hotel on the lake shore with a farm-to-table restaurant, spa and private event space for weddings up to 120 guests." />
              </Field>
              <Field label="Location" optional>
                <Input value={brief.location} onChange={(e) => set('location', e.target.value)} placeholder="Lake Bled, Slovenia" />
              </Field>
              <Field label="Target audience" optional>
                <Input value={brief.audience} onChange={(e) => set('audience', e.target.value)} placeholder="Couples, wedding planners, wellness travellers" />
              </Field>
              <Field label="Services or offerings" optional className="sm:col-span-2" help="Press Enter after each one.">
                <TagInput value={brief.services} onChange={(v) => set('services', v)} placeholder="Lake-view suites, Spa, Weddings…" max={20} />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Style" description="Sets the starting design system — colors, typography and spacing.">
            <ChoiceChips options={STYLES} value={brief.style} onChange={(v) => set('style', v as string)} />
            <p className="mt-2 text-xs text-fg-muted">{STYLES.find((s) => s.value === brief.style)?.description}</p>
          </FieldGroup>

          <FieldGroup title="Pages" description="A homepage is always included.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Checkbox checked disabled label="Home" />
              {PAGE_OPTIONS.map((p) => (
                <Checkbox key={p} label={p} checked={brief.pages.includes(p)} onCheckedChange={(v) => set('pages', v === true ? [...brief.pages, p] : brief.pages.filter((x) => x !== p))} />
              ))}
            </div>
          </FieldGroup>

          <div className="rounded-lg border border-border bg-surface">
            <button
              type="button"
              onClick={() => setOptionalOpen((o) => !o)}
              aria-expanded={optionalOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span>
                <span className="block text-sm font-semibold text-fg">Contact, social and brand assets</span>
                <span className="mt-0.5 block text-xs text-fg-muted">Optional. Used for the contact page, footer and imagery.</span>
              </span>
              <ChevronDown className={cn('size-4 text-fg-subtle transition-transform', optionalOpen && 'rotate-180')} strokeWidth={1.5} />
            </button>
            {optionalOpen && (
              <div className="space-y-5 border-t border-border px-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Phone">
                    <Input type="tel" value={brief.phone} onChange={(e) => set('phone', e.target.value)} />
                  </Field>
                  <Field label="Email" error={errors.email}>
                    <Input type="email" value={brief.email} onChange={(e) => set('email', e.target.value)} />
                  </Field>
                  <Field label="WhatsApp">
                    <Input type="tel" value={brief.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
                  </Field>
                  <Field label="Address">
                    <Input value={brief.address} onChange={(e) => set('address', e.target.value)} />
                  </Field>
                </div>
                <div>
                  <div className="mb-1.5 text-sm font-medium text-fg">Social profiles</div>
                  <div className="space-y-2">
                    {brief.social.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Select
                          size="sm"
                          className="w-36"
                          aria-label="Network"
                          value={s.network}
                          onValueChange={(v) => set('social', brief.social.map((x, j) => (j === i ? { ...x, network: v } : x)))}
                          options={SOCIAL_NETWORKS.filter((n) => n !== 'custom').map((n) => ({ value: n, label: n === 'x' ? 'X (Twitter)' : n.charAt(0).toUpperCase() + n.slice(1) }))}
                        />
                        <Input size="sm" aria-label="Profile URL" placeholder="https://" value={s.url} onChange={(e) => set('social', brief.social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                        <IconButton label="Remove" size="sm" onClick={() => set('social', brief.social.filter((_, j) => j !== i))}>
                          <X />
                        </IconButton>
                      </div>
                    ))}
                    <Button size="xs" variant="ghost" leadingIcon={<Plus />} onClick={() => set('social', [...brief.social, { network: 'instagram', url: '' }])}>
                      Add profile
                    </Button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Logo">
                    <MediaField organizationId={orgId} value={brief.logo?.url} aspect="square" placeholder="Upload logo" onChange={(_, m) => set('logo', m)} />
                  </Field>
                  <Field label="Photos" help="AI places these in hero sections and galleries.">
                    <div className="flex flex-wrap items-center gap-2">
                      {brief.images.map((m) => (
                        <div key={m.id} className="group relative size-12 overflow-hidden rounded-md border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumbUrl(m, 96)} alt={m.alt ?? ''} className="size-full object-cover" />
                          <button
                            type="button"
                            aria-label={`Remove ${m.filename}`}
                            onClick={() => set('images', brief.images.filter((x) => x.id !== m.id))}
                            className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setImagesOpen(true)}
                        className="flex size-12 items-center justify-center rounded-md border border-dashed border-border-strong text-fg-subtle outline-none hover:bg-surface-2 hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Add photos"
                      >
                        <ImagePlus className="size-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </Field>
                </div>
              </div>
            )}
          </div>
          <MediaPicker
            open={imagesOpen}
            onOpenChange={setImagesOpen}
            organizationId={orgId}
            kind="image"
            multiple
            onSelect={(ms) => set('images', [...brief.images, ...ms.filter((m) => !brief.images.some((x) => x.id === m.id))])}
          />
        </div>

        <aside className="lg:sticky lg:top-16 lg:self-start">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-semibold text-fg">Generate</div>
            <p className="mt-1 text-xs text-fg-muted">
              Creates {1 + brief.pages.length} pages with copy, a theme, navigation, a contact form and SEO metadata. Usually takes 1–3 minutes.
            </p>
            <Field label="Additional instructions" optional className="mt-4">
              <Textarea rows={3} value={brief.prompt} onChange={(e) => set('prompt', e.target.value)} placeholder="Emphasise sustainability; avoid stock-photo clichés." />
            </Field>
            {configured.length > 0 && (
              <Field label="Model" className="mt-3">
                <Select size="sm" value={brief.model} onValueChange={(v) => set('model', v)} options={modelOptions} />
              </Field>
            )}
            {models.isSuccess && configured.length === 0 && (
              <Banner tone="warning" icon={<AlertCircle />} className="mt-3 text-xs">
                No AI provider is configured for this organization. The platform default will be used if available.{' '}
                <Link href={`/org/${orgId}/integrations?tab=ai`} className="font-medium underline">
                  Add one
                </Link>
              </Banner>
            )}
            <Button type="submit" variant="primary" className="mt-4 w-full" leadingIcon={<Sparkles />} loading={generate.isPending}>
              Generate website
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
}

/* --------------------------------------------------------------- Progress */

type SseState = 'connecting' | 'open' | 'closed' | 'failed';

function mergeSteps(server: AiProgressStep[]): Array<AiProgressStep & { canonical?: boolean }> {
  if (!server.length) return CANONICAL_STEPS.map((c) => ({ step: c.step, label: c.label, status: 'pending' as const, canonical: true }));
  // Map each server step to a canonical index; append canonical steps that come after the furthest matched one.
  let maxIdx = -1;
  for (const s of server) {
    const idx = CANONICAL_STEPS.findIndex((c) => c.step === s.step || c.match.test(s.step) || c.match.test(s.label));
    if (idx > maxIdx) maxIdx = idx;
  }
  const rest = maxIdx >= 0 ? CANONICAL_STEPS.slice(maxIdx + 1).filter((c) => !server.some((s) => c.match.test(s.label) || c.step === s.step)) : [];
  return [...server, ...rest.map((c) => ({ step: c.step, label: c.label, status: 'pending' as const, canonical: true }))];
}

function applyEvent(prev: AiGeneration | undefined, data: unknown): AiGeneration | undefined {
  if (!data || typeof data !== 'object') return prev;
  const d = data as Partial<AiGeneration> & Partial<AiProgressStep> & { type?: string; usage?: { inputTokens?: number; outputTokens?: number }; generation?: AiGeneration };
  if (d.generation) return { ...(prev ?? ({} as AiGeneration)), ...d.generation };
  const base: AiGeneration = prev ?? ({ id: '', kind: 'site', prompt: '', provider: '', model: '', status: 'RUNNING', inputTokens: 0, outputTokens: 0, costUsd: 0, createdAt: new Date().toISOString(), progress: [], result: null, error: null, websiteId: null } as AiGeneration);
  let next: AiGeneration = { ...base };
  if (Array.isArray(d.progress)) next.progress = d.progress;
  else if (typeof d.step === 'string' && typeof d.status === 'string' && ['pending', 'running', 'done', 'failed'].includes(d.status)) {
    const step: AiProgressStep = { step: d.step, label: d.label ?? d.step, status: d.status as AiProgressStep['status'], at: d.at ?? new Date().toISOString(), detail: d.detail };
    const exists = next.progress.some((p) => p.step === step.step);
    next.progress = exists ? next.progress.map((p) => (p.step === step.step ? { ...p, ...step } : p)) : [...next.progress, step];
  }
  if (typeof d.status === 'string' && ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REVERTED'].includes(d.status)) next.status = d.status as AiGeneration['status'];
  if (typeof d.inputTokens === 'number') next.inputTokens = d.inputTokens;
  if (typeof d.outputTokens === 'number') next.outputTokens = d.outputTokens;
  if (d.usage) next = { ...next, inputTokens: d.usage.inputTokens ?? next.inputTokens, outputTokens: d.usage.outputTokens ?? next.outputTokens };
  if (typeof d.costUsd === 'number') next.costUsd = d.costUsd;
  if (typeof d.error === 'string') next.error = d.error;
  if (typeof d.websiteId === 'string') next.websiteId = d.websiteId;
  return next;
}

function GenerationProgress({ generationId, websiteId, onRetry }: { generationId: string; websiteId: string | null; onRetry: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const [sse, setSse] = useState<SseState>('connecting');
  const [now, setNow] = useState(() => Date.now());
  const runningSince = useRef(new Map<string, number>());
  const finishedAt = useRef(new Map<string, number>());
  const key = qk.aiGeneration(generationId);

  const q = useQuery({
    queryKey: key,
    queryFn: () => api.ai.generation(generationId),
    // Poll only when the event stream is unavailable.
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s && TERMINAL.has(s)) return false;
      return sse === 'open' ? false : 2000;
    },
  });

  // SSE stream (fetch-based so the bearer token is sent).
  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(api.ai.eventsUrl(generationId), { headers: { Accept: 'text/event-stream' }, signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
        setSse('open');
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLines = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart());
            if (!dataLines.length) continue;
            const raw = dataLines.join('\n');
            try {
              const parsed: unknown = JSON.parse(raw);
              qc.setQueryData<AiGeneration>(key, (prev) => applyEvent(prev, parsed));
            } catch {
              /* non-JSON keepalive */
            }
          }
        }
        if (!cancelled) {
          setSse('closed');
          void qc.invalidateQueries({ queryKey: key });
        }
      } catch {
        if (!cancelled) setSse('failed');
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationId]);

  const gen = q.data;
  const status = gen?.status ?? 'PENDING';
  const done = status === 'SUCCEEDED';
  const failed = status === 'FAILED' || status === 'REVERTED';
  const terminal = TERMINAL.has(status);
  const targetSite = gen?.websiteId ?? websiteId;

  useEffect(() => {
    if (terminal) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [terminal]);

  // Track per-step timings client-side (server `at` preferred when available).
  const steps = useMemo(() => mergeSteps(gen?.progress ?? []), [gen?.progress]);
  for (const s of steps) {
    if (s.status === 'running' && !runningSince.current.has(s.step)) runningSince.current.set(s.step, s.at ? new Date(s.at).getTime() : Date.now());
    if ((s.status === 'done' || s.status === 'failed') && !finishedAt.current.has(s.step)) finishedAt.current.set(s.step, s.at ? new Date(s.at).getTime() : Date.now());
  }

  const startedAt = gen?.createdAt ? new Date(gen.createdAt).getTime() : null;
  const lastFinish = Math.max(0, ...Array.from(finishedAt.current.values()));
  const totalMs = startedAt ? (terminal ? (lastFinish || now) : now) - startedAt : null;

  const openEditor = useCallback(() => {
    if (targetSite) router.push(`/w/${targetSite}/editor`);
  }, [router, targetSite]);

  // Auto-open the builder shortly after success.
  useEffect(() => {
    if (!done || !targetSite) return;
    void qc.invalidateQueries({ queryKey: ['org'] });
    const t = setTimeout(openEditor, 1800);
    return () => clearTimeout(t);
  }, [done, targetSite, openEditor, qc]);

  const completed = steps.filter((s) => s.status === 'done').length;
  const tokens = (gen?.inputTokens ?? 0) + (gen?.outputTokens ?? 0);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">{done ? 'Your website is ready' : failed ? 'Generation stopped' : 'Building your website'}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {done ? 'Opening the editor…' : failed ? 'Nothing was published. You can adjust the brief and try again.' : 'You can leave this page — generation continues in the background.'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm tabular-nums text-fg">{formatDuration(totalMs)}</div>
          <div className="text-2xs text-fg-subtle">{sse === 'open' ? 'Live' : sse === 'connecting' ? 'Connecting…' : terminal ? 'Finished' : 'Polling'}</div>
        </div>
      </div>

      {q.isError && !gen && (
        <Banner tone="danger" icon={<AlertCircle />} className="mt-6" action={<Button size="xs" onClick={() => void q.refetch()}>Retry</Button>}>
          Could not load generation status: {q.error.message}
        </Banner>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-fg-muted">
          <span>
            Step <span className="tabular-nums text-fg">{Math.min(completed + (terminal ? 0 : 1), steps.length)}</span> of <span className="tabular-nums">{steps.length}</span>
          </span>
          <span className="flex items-center gap-3 tabular-nums">
            <span title={`${formatNumber(gen?.inputTokens)} input · ${formatNumber(gen?.outputTokens)} output`}>{tokens ? `${formatNumber(tokens)} tokens` : '— tokens'}</span>
            <span>{gen?.costUsd ? formatUsd(gen.costUsd) : '$—'}</span>
            {gen?.model && <span className="hidden font-mono text-2xs text-fg-subtle sm:inline">{gen.model}</span>}
          </span>
        </div>
        <ol className="divide-y divide-border" aria-live="polite">
          {steps.map((s) => {
            const st = s.status;
            const start = runningSince.current.get(s.step);
            const end = finishedAt.current.get(s.step);
            const elapsed = st === 'running' && start ? now - start : start && end ? end - start : null;
            return (
              <li key={s.step} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                  {st === 'done' ? (
                    <Check className="size-4 text-success" strokeWidth={2} aria-label="Done" />
                  ) : st === 'running' ? (
                    <Spinner className="size-3.5 text-accent" label="In progress" />
                  ) : st === 'failed' ? (
                    <X className="size-4 text-danger" strokeWidth={2} aria-label="Failed" />
                  ) : (
                    <Circle className="size-2.5 text-border-strong" strokeWidth={3} aria-label="Pending" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('text-sm', st === 'pending' ? 'text-fg-subtle' : 'text-fg', st === 'running' && 'font-medium')}>{s.label}</div>
                  {s.detail && <div className="mt-0.5 truncate text-xs text-fg-muted">{s.detail}</div>}
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-fg-subtle">{elapsed !== null ? formatDuration(elapsed) : ''}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {failed && gen?.error && (
        <Banner tone="danger" icon={<AlertCircle />} className="mt-4">
          {gen.error}
        </Banner>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        {failed && (
          <Button size="sm" leadingIcon={<RotateCcw />} onClick={onRetry}>
            Edit brief and retry
          </Button>
        )}
        {targetSite && !done && (
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/w/${targetSite}`}>Go to website dashboard</Link>
          </Button>
        )}
        {done && targetSite && (
          <Button size="sm" variant="primary" trailingIcon={<ArrowRight />} onClick={openEditor}>
            Open in editor
          </Button>
        )}
      </div>
    </div>
  );
}
