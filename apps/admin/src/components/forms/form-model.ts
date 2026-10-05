import type { FormDto } from '@atrium/sdk';
import {
  createId,
  FormDefinitionSchema,
  slugify,
  type ConditionGroup,
  type FormAction,
  type FormDefinition,
  type FormField,
  type FormFieldType,
  type FormRule,
} from '@atrium/schema';
import {
  AlignLeft,
  Calendar,
  CalendarClock,
  CircleDot,
  Clock,
  EyeOff,
  Hash,
  Heading,
  Link,
  ListChecks,
  Mail,
  Paperclip,
  Phone,
  Pilcrow,
  Puzzle,
  ShieldCheck,
  SquareCheck,
  SquareChevronDown,
  Star,
  Type,
  type LucideIcon,
} from 'lucide-react';

/* -------------------------------------------------------------- Field types */

export type FieldGroupKey = 'basic' | 'choice' | 'datetime' | 'advanced' | 'layout';

export const FIELD_GROUPS: Array<{ key: FieldGroupKey; label: string }> = [
  { key: 'basic', label: 'Basic' },
  { key: 'choice', label: 'Choice' },
  { key: 'datetime', label: 'Date & time' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'layout', label: 'Layout' },
];

export interface FieldTypeMeta {
  label: string;
  icon: LucideIcon;
  group: FieldGroupKey;
  description: string;
}

export const FIELD_TYPE_META: Record<FormFieldType, FieldTypeMeta> = {
  text: { label: 'Short text', icon: Type, group: 'basic', description: 'Single-line answer' },
  email: { label: 'Email', icon: Mail, group: 'basic', description: 'Validated email address' },
  phone: { label: 'Phone', icon: Phone, group: 'basic', description: 'Phone number' },
  number: { label: 'Number', icon: Hash, group: 'basic', description: 'Numeric value with min/max' },
  textarea: { label: 'Long text', icon: AlignLeft, group: 'basic', description: 'Multi-line answer' },
  url: { label: 'URL', icon: Link, group: 'basic', description: 'Web address' },
  select: { label: 'Dropdown', icon: SquareChevronDown, group: 'choice', description: 'Pick one from a list' },
  multiselect: { label: 'Multi-select', icon: ListChecks, group: 'choice', description: 'Pick several from a list' },
  radio: { label: 'Radio', icon: CircleDot, group: 'choice', description: 'Pick one, all visible' },
  checkbox: { label: 'Checkboxes', icon: SquareCheck, group: 'choice', description: 'Tick any that apply' },
  consent: { label: 'Consent', icon: ShieldCheck, group: 'choice', description: 'Single agreement checkbox' },
  rating: { label: 'Rating', icon: Star, group: 'choice', description: 'Star rating' },
  date: { label: 'Date', icon: Calendar, group: 'datetime', description: 'Calendar date' },
  time: { label: 'Time', icon: Clock, group: 'datetime', description: 'Time of day' },
  datetime: { label: 'Date & time', icon: CalendarClock, group: 'datetime', description: 'Date with time' },
  file: { label: 'File upload', icon: Paperclip, group: 'advanced', description: 'Attachments' },
  hidden: { label: 'Hidden', icon: EyeOff, group: 'advanced', description: 'Submitted, never shown' },
  custom: { label: 'Custom', icon: Puzzle, group: 'advanced', description: 'Registered custom renderer' },
  heading: { label: 'Heading', icon: Heading, group: 'layout', description: 'Section title' },
  paragraph: { label: 'Paragraph', icon: Pilcrow, group: 'layout', description: 'Supporting text' },
};

export const CHOICE_TYPES = new Set<FormFieldType>(['select', 'multiselect', 'radio', 'checkbox']);
export const LAYOUT_TYPES = new Set<FormFieldType>(['heading', 'paragraph']);
export const TEXT_LENGTH_TYPES = new Set<FormFieldType>(['text', 'textarea', 'email', 'phone', 'url']);
export const PATTERN_TYPES = new Set<FormFieldType>(['text', 'textarea', 'phone']);
export const NUMERIC_TYPES = new Set<FormFieldType>(['number', 'rating']);

export function isInputField(f: Pick<FormField, 'type'>): boolean {
  return !LAYOUT_TYPES.has(f.type);
}

/* ------------------------------------------------------------------- Naming */

export const FIELD_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** "Guest count (adults)" → "guestCountAdults". */
export function toCamelCase(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'field';
  let out = words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  if (/^[0-9]/.test(out)) out = `field${out}`;
  return out.slice(0, 40);
}

export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const b = base || 'form';
  if (!set.has(b)) return b;
  let i = 2;
  while (set.has(`${b}-${i}`)) i++;
  return `${b}-${i}`;
}

export function optionValue(label: string): string {
  return slugify(label) || 'option';
}

/* ----------------------------------------------------------------- Defaults */

export const DEFAULT_SETTINGS: FormDefinition['settings'] = {
  submitLabel: 'Send',
  successMessage: 'Thank you — we will be in touch shortly.',
  storeSubmissions: true,
  honeypot: true,
  captcha: { provider: 'none', minScore: 0.5, action: 'submit' },
  rateLimitPerMinute: 5,
  layout: 'grid',
};

export function defaultFields(): FormField[] {
  return [
    { id: createId('fld'), type: 'text', name: 'name', label: 'Name', placeholder: 'Jane Smith', required: true, width: 'half' },
    { id: createId('fld'), type: 'email', name: 'email', label: 'Email', placeholder: 'jane@example.com', required: true, width: 'half' },
    { id: createId('fld'), type: 'textarea', name: 'message', label: 'Message', placeholder: 'How can we help?', required: true, width: 'full', validation: { maxLength: 5000 } },
  ];
}

const sampleOptions = () => [
  { label: 'Option 1', value: 'option-1' },
  { label: 'Option 2', value: 'option-2' },
  { label: 'Option 3', value: 'option-3' },
];

export function createField(type: FormFieldType, takenNames: Iterable<string>): FormField {
  const base: Omit<FormField, 'name' | 'label'> = { id: createId('fld'), type, required: false, width: 'full' };
  const presets: Record<FormFieldType, Partial<FormField> & { label: string }> = {
    text: { label: 'Short answer' },
    email: { label: 'Email', placeholder: 'name@example.com' },
    phone: { label: 'Phone', placeholder: '+1 555 000 0000' },
    number: { label: 'Number' },
    textarea: { label: 'Long answer' },
    url: { label: 'Website', placeholder: 'https://' },
    select: { label: 'Dropdown', placeholder: 'Select an option', options: sampleOptions() },
    multiselect: { label: 'Multi-select', options: sampleOptions() },
    radio: { label: 'Single choice', options: sampleOptions() },
    checkbox: { label: 'Checkboxes', options: sampleOptions() },
    consent: { label: 'I agree to the privacy policy', required: true },
    rating: { label: 'Rating', validation: { min: 1, max: 5 } },
    date: { label: 'Date', width: 'half' },
    time: { label: 'Time', width: 'half' },
    datetime: { label: 'Date and time' },
    file: { label: 'Attachment', validation: { maxFileSizeMb: 10, maxFiles: 1 } },
    hidden: { label: 'Source', defaultValue: '' },
    custom: { label: 'Custom field', component: '' },
    heading: { label: 'Section heading' },
    paragraph: { label: 'Paragraph', helpText: 'Add supporting text for this part of the form.' },
  };
  const p = presets[type];
  const nameBase = LAYOUT_TYPES.has(type) ? type : toCamelCase(p.label);
  return { ...base, ...p, name: uniqueName(nameBase, takenNames) } as FormField;
}

export function duplicateField(f: FormField, takenNames: Iterable<string>): FormField {
  return { ...structuredClone(f), id: createId('fld'), name: uniqueName(f.name.replace(/\d+$/, '') || 'field', takenNames), label: LAYOUT_TYPES.has(f.type) ? f.label : `${f.label} copy` };
}

export function createRule(name = 'New rule'): FormRule {
  return { id: createId('rule'), name, enabled: true, then: [], otherwise: [], stopProcessing: false };
}

export function createAction(type: FormAction['type'], fields: FormField[]): FormAction {
  const emailField = fields.find((f) => f.type === 'email')?.name ?? 'email';
  const nameField = fields.find((f) => f.name.toLowerCase().includes('name'))?.name;
  switch (type) {
    case 'email':
      return { type, to: [], subject: 'New submission: {{form.name}}', html: '' };
    case 'autoresponder':
      return {
        type,
        emailField,
        subject: 'Thanks for getting in touch',
        html: `<p>Hi${nameField ? ` {{${nameField}}}` : ''},</p><p>Thanks for your message. We received it and will reply shortly.</p>`,
      };
    case 'sms':
      return { type, to: [], body: `New enquiry${nameField ? ` from {{${nameField}}}` : ''} via {{form.name}}` };
    case 'webhook':
      return { type };
    case 'tag':
      return { type, tags: [] };
    case 'assign':
      return { type, userId: '' };
    case 'status':
      return { type, status: 'contacted' };
  }
}

export const ACTION_META: Record<FormAction['type'], { label: string; description: string }> = {
  email: { label: 'Send email', description: 'Notify your team' },
  autoresponder: { label: 'Autoresponder', description: 'Reply to the person who submitted' },
  sms: { label: 'Send SMS', description: 'Text message alert' },
  webhook: { label: 'Call webhook', description: 'POST the submission to a URL' },
  tag: { label: 'Add tags', description: 'Label the submission' },
  assign: { label: 'Assign', description: 'Give it to a teammate' },
  status: { label: 'Set status', description: 'Move it through your pipeline' },
};

/* ------------------------------------------------------------ Normalization */

/** Fill schema defaults the server may have omitted, and drop DTO-only keys. */
export function normalizeForm(dto: FormDto | FormDefinition): FormDefinition {
  const s = (dto.settings ?? {}) as Partial<FormDefinition['settings']>;
  return {
    id: dto.id,
    name: dto.name ?? '',
    slug: dto.slug ?? '',
    fields: (dto.fields ?? []).map((f) => ({ ...f, required: f.required ?? false, width: f.width ?? 'full' })),
    settings: {
      ...DEFAULT_SETTINGS,
      ...s,
      captcha: { ...DEFAULT_SETTINGS.captcha, ...(s.captcha ?? {}) },
    },
    rules: (dto.rules ?? []).map((r) => ({
      ...r,
      enabled: r.enabled ?? true,
      then: r.then ?? [],
      otherwise: r.otherwise ?? [],
      stopProcessing: r.stopProcessing ?? false,
    })),
  };
}

/** Copy a definition with fresh field/rule ids (for duplication). */
export function cloneDefinition(def: FormDefinition, name: string, slug: string): Omit<FormDefinition, 'id'> {
  const copy = structuredClone(def);
  return {
    name,
    slug,
    fields: copy.fields.map((f) => ({ ...f, id: createId('fld') })),
    settings: copy.settings,
    rules: copy.rules.map((r) => ({ ...r, id: createId('rule') })),
  };
}

/* --------------------------------------------------------------- Conditions */

export function countConditions(g: ConditionGroup | undefined): number {
  if (!g) return 0;
  return g.conditions.reduce((n, c) => n + ('match' in c ? countConditions(c) : 1), 0);
}

/* ------------------------------------------------------------------- Issues */

export type IssueTarget = { tab: 'build'; fieldId: string } | { tab: 'settings' } | { tab: 'workflows'; ruleId?: string };

export interface FormIssue {
  key: string;
  message: string;
  target: IssueTarget;
}

function friendly(path: PropertyKey[], code: string, message: string): string {
  const last = String(path[path.length - 1] ?? '');
  if (last === 'name' && path[0] === 'fields') return 'Name must start with a letter and use only letters, numbers and underscores';
  if (last === 'to' && code === 'too_small') return 'Add at least one recipient';
  if (last === 'tags' && code === 'too_small') return 'Add at least one tag';
  if (last === 'url') return 'Enter a valid URL';
  if (last === 'slug') return 'Slug can only contain lowercase letters, numbers and dashes';
  if (last === 'name' && path.length === 1) return 'Form name is required';
  if (last === 'label') return 'Label is too long';
  if (last === 'body' && code === 'too_big') return 'SMS body is limited to 1600 characters';
  return message;
}

/** Client-side checks mirroring the server schema plus builder-specific rules. */
export function collectIssues(def: FormDefinition): FormIssue[] {
  const issues: FormIssue[] = [];
  const fieldLabel = (i: number) => def.fields[i]?.label || def.fields[i]?.name || `Field ${i + 1}`;
  const ruleLabel = (i: number) => def.rules[i]?.name || `Rule ${i + 1}`;

  const parsed = FormDefinitionSchema.safeParse(def);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const p = iss.path;
      const key = p.map(String).join('.');
      if (p[0] === 'fields' && typeof p[1] === 'number') {
        const f = def.fields[p[1]];
        issues.push({ key, message: `${fieldLabel(p[1])}: ${friendly(p, iss.code, iss.message)}`, target: { tab: 'build', fieldId: f?.id ?? '' } });
      } else if (p[0] === 'rules' && typeof p[1] === 'number') {
        const r = def.rules[p[1]];
        const branch = p[2] === 'then' ? 'then' : p[2] === 'otherwise' ? 'else' : null;
        const actionIdx = typeof p[3] === 'number' ? p[3] + 1 : null;
        const where = branch && actionIdx ? ` (${branch} action ${actionIdx})` : '';
        issues.push({ key, message: `${ruleLabel(p[1])}${where}: ${friendly(p, iss.code, iss.message)}`, target: { tab: 'workflows', ruleId: r?.id } });
      } else {
        issues.push({ key, message: `Settings: ${friendly(p, iss.code, iss.message)}`, target: { tab: 'settings' } });
      }
    }
  }

  const seen = new Map<string, number>();
  def.fields.forEach((f, i) => {
    if (seen.has(f.name)) issues.push({ key: `dup.${f.id}`, message: `${fieldLabel(i)}: name “${f.name}” is already used`, target: { tab: 'build', fieldId: f.id } });
    else seen.set(f.name, i);
    if (CHOICE_TYPES.has(f.type)) {
      const opts = f.options ?? [];
      if (!opts.length) issues.push({ key: `opts.${f.id}`, message: `${fieldLabel(i)}: add at least one option`, target: { tab: 'build', fieldId: f.id } });
      const values = opts.map((o) => o.value.trim());
      if (values.some((v) => !v) || new Set(values).size !== values.length)
        issues.push({ key: `optv.${f.id}`, message: `${fieldLabel(i)}: option values must be unique and not empty`, target: { tab: 'build', fieldId: f.id } });
    }
    if (f.validation?.pattern) {
      try {
        new RegExp(f.validation.pattern);
      } catch {
        issues.push({ key: `re.${f.id}`, message: `${fieldLabel(i)}: pattern is not a valid regular expression`, target: { tab: 'build', fieldId: f.id } });
      }
    }
  });

  def.rules.forEach((r, i) => {
    [...r.then, ...r.otherwise].forEach((a, j) => {
      if (a.type === 'assign' && !a.userId) issues.push({ key: `as.${r.id}.${j}`, message: `${ruleLabel(i)}: choose a teammate to assign`, target: { tab: 'workflows', ruleId: r.id } });
      if (a.type === 'webhook' && !a.webhookId && !a.url) issues.push({ key: `wh.${r.id}.${j}`, message: `${ruleLabel(i)}: choose a webhook or enter a URL`, target: { tab: 'workflows', ruleId: r.id } });
    });
  });

  // De-duplicate identical messages (zod can report the same path twice).
  const uniq = new Map<string, FormIssue>();
  for (const i of issues) if (!uniq.has(i.message)) uniq.set(i.message, i);
  return [...uniq.values()];
}

/** Normalize API 422 `details` into readable lines. */
export function describeValidationDetails(details: unknown): string[] {
  if (!details) return [];
  if (Array.isArray(details)) {
    return details
      .map((d) => {
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          const o = d as Record<string, unknown>;
          const path = Array.isArray(o.path) ? o.path.join('.') : (o.path ?? o.field ?? '');
          const msg = o.message ?? o.msg ?? JSON.stringify(o);
          return path ? `${String(path)}: ${String(msg)}` : String(msg);
        }
        return String(d);
      })
      .filter(Boolean);
  }
  if (typeof details === 'object') {
    const o = details as Record<string, unknown>;
    if (o.fieldErrors && typeof o.fieldErrors === 'object') return describeValidationDetails(Object.entries(o.fieldErrors as Record<string, unknown>).map(([k, v]) => ({ path: k, message: Array.isArray(v) ? v.join(', ') : v })));
    if (Array.isArray(o.issues)) return describeValidationDetails(o.issues);
    return Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  return [String(details)];
}
