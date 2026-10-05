import { z } from 'zod';
import { ConditionGroupSchema, type Condition, type ConditionGroup } from './node';
import { safeUrlSchema } from './safe-url';
import { isSafeRegexPattern, MAX_REGEX_INPUT_LENGTH, MAX_REGEX_PATTERN_LENGTH, safeRegexTest } from './security';

export const FORM_FIELD_TYPES = [
  'text', 'email', 'phone', 'number', 'textarea', 'select', 'multiselect', 'radio', 'checkbox', 'date', 'time',
  'datetime', 'file', 'hidden', 'consent', 'rating', 'url', 'heading', 'paragraph', 'custom',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FormFieldOptionSchema = z.object({ label: z.string(), value: z.string() });

export const FormFieldSchema = z.object({
  id: z.string(),
  type: z.enum(FORM_FIELD_TYPES),
  /** Machine key used in submissions and templates ({{guestCount}}). */
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().max(200),
  placeholder: z.string().max(200).optional(),
  helpText: z.string().max(500).optional(),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  options: z.array(FormFieldOptionSchema).optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      minLength: z.number().int().optional(),
      maxLength: z.number().int().optional(),
      /**
       * Runs against public submissions: bounded length and no nested quantifiers/backreferences
       * (ReDoS). Unsafe patterns in stored data are dropped.
       */
      pattern: z
        .string()
        .transform((v) => (v.length <= MAX_REGEX_PATTERN_LENGTH && isSafeRegexPattern(v) ? v : undefined))
        .optional(),
      patternMessage: z.string().optional(),
      accept: z.array(z.string()).optional(),
      maxFileSizeMb: z.number().optional(),
      maxFiles: z.number().int().optional(),
    })
    .optional(),
  /** Field is shown (and validated) only when the condition group matches. */
  showIf: ConditionGroupSchema.optional(),
  width: z.enum(['full', 'half', 'third']).default('full'),
  /** Custom field renderer key for `custom` type. */
  component: z.string().optional(),
});
export type FormField = z.infer<typeof FormFieldSchema>;

export const FormActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    to: z.array(z.string()).min(1),
    cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(),
    replyTo: z.string().optional(),
    subject: z.string(),
    body: z.string().optional(),
    html: z.string().optional(),
    providerId: z.string().optional(),
  }),
  z.object({ type: z.literal('autoresponder'), subject: z.string(), html: z.string(), emailField: z.string().default('email'), providerId: z.string().optional() }),
  z.object({ type: z.literal('sms'), to: z.array(z.string()).min(1), body: z.string().max(1600), providerId: z.string().optional() }),
  z.object({
    type: z.literal('webhook'),
    webhookId: z.string().optional(),
    url: z
      .string()
      .url()
      .transform((v) => (/^https?:\/\//i.test(v) ? v : undefined))
      .optional(),
  }),
  z.object({ type: z.literal('tag'), tags: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('assign'), userId: z.string() }),
  z.object({ type: z.literal('status'), status: z.string() }),
]);
export type FormAction = z.infer<typeof FormActionSchema>;

export const FormRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  /** Empty/omitted conditions = always run. */
  when: ConditionGroupSchema.optional(),
  then: z.array(FormActionSchema),
  otherwise: z.array(FormActionSchema).default([]),
  stopProcessing: z.boolean().default(false),
});
export type FormRule = z.infer<typeof FormRuleSchema>;

export const CaptchaSettingsSchema = z.object({
  provider: z.enum(['none', 'recaptcha-v2', 'recaptcha-v3', 'turnstile', 'hcaptcha']).default('none'),
  /** Integration id holding site key/secret; falls back to the website default captcha integration. */
  integrationId: z.string().optional(),
  minScore: z.number().min(0).max(1).default(0.5),
  action: z.string().default('submit'),
});

export const FormSettingsSchema = z.object({
  submitLabel: z.string().default('Send'),
  successMessage: z.string().default('Thank you — we will be in touch shortly.'),
  /** Where the browser goes after a successful submission (http(s) or relative only). */
  redirectUrl: safeUrlSchema('navigation').optional(),
  storeSubmissions: z.boolean().default(true),
  honeypot: z.boolean().default(true),
  captcha: CaptchaSettingsSchema.default({ provider: 'none', minScore: 0.5, action: 'submit' }),
  rateLimitPerMinute: z.number().int().min(1).max(120).default(5),
  layout: z.enum(['stacked', 'grid']).default('grid'),
  consentText: z.string().optional(),
});

export const FormDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  fields: z.array(FormFieldSchema),
  settings: FormSettingsSchema.default({
    submitLabel: 'Send',
    successMessage: 'Thank you — we will be in touch shortly.',
    storeSubmissions: true,
    honeypot: true,
    captcha: { provider: 'none', minScore: 0.5, action: 'submit' },
    rateLimitPerMinute: 5,
    layout: 'grid',
  }),
  rules: z.array(FormRuleSchema).default([]),
});
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;
export type FormDefinitionInput = z.input<typeof FormDefinitionSchema>;

export const SUBMISSION_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'rejected', 'spam', 'archived'] as const;

// ---------------------------------------------------------------------------
// Condition evaluation (shared by form visibility, rule engine and CMS filters)
// ---------------------------------------------------------------------------

function getPath(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), data);
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

export function evaluateCondition(c: Condition, data: Record<string, unknown>): boolean {
  const actual = getPath(data, c.field);
  const expected = c.value;
  switch (c.op) {
    case 'eq':
      return Array.isArray(actual) ? actual.map(String).includes(String(expected)) : String(actual ?? '') === String(expected ?? '');
    case 'neq':
      return String(actual ?? '') !== String(expected ?? '');
    case 'gt':
      return toNum(actual) > toNum(expected);
    case 'gte':
      return toNum(actual) >= toNum(expected);
    case 'lt':
      return toNum(actual) < toNum(expected);
    case 'lte':
      return toNum(actual) <= toNum(expected);
    case 'contains':
      return Array.isArray(actual) ? actual.map(String).includes(String(expected)) : String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'notContains':
      return !evaluateCondition({ ...c, op: 'contains' }, data);
    case 'in':
      return Array.isArray(expected) && expected.map(String).includes(String(actual));
    case 'notIn':
      return Array.isArray(expected) && !expected.map(String).includes(String(actual));
    case 'empty':
      return isEmpty(actual);
    case 'notEmpty':
      return !isEmpty(actual);
    case 'matches':
      // Admin-authored pattern vs. visitor data: ReDoS-guarded (unsafe patterns never match).
      return safeRegexTest(String(expected), String(actual ?? ''));
  }
}

export function evaluateConditionGroup(group: ConditionGroup | undefined, data: Record<string, unknown>): boolean {
  if (!group || group.conditions.length === 0) return true;
  const results = group.conditions.map((c) => ('match' in c ? evaluateConditionGroup(c, data) : evaluateCondition(c, data)));
  return group.match === 'all' ? results.every(Boolean) : results.some(Boolean);
}

export interface PlannedRuleActions {
  ruleId: string;
  branch: 'then' | 'otherwise';
  actions: FormAction[];
}

/** Decide which actions run for a submission. Pure — execution happens in the worker. */
export function planFormRules(rules: FormRule[], data: Record<string, unknown>): PlannedRuleActions[] {
  const planned: PlannedRuleActions[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const matched = evaluateConditionGroup(rule.when, data);
    const actions = matched ? rule.then : rule.otherwise;
    if (actions.length) planned.push({ ruleId: rule.id, branch: matched ? 'then' : 'otherwise', actions });
    if (matched && rule.stopProcessing) break;
  }
  return planned;
}

export interface FieldError {
  field: string;
  message: string;
}

/** Server-generated upload descriptor stored on a submission (never a visitor-supplied URL). */
export interface UploadedFileDescriptor {
  key: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface ValidateSubmissionOptions {
  /**
   * `server` (default): file fields only accept server-generated upload descriptors
   * (`{ key, filename, size, mimeType }`); anything else is treated as empty.
   * `client`: browser-side validation where file fields carry the chosen file names.
   */
  mode?: 'server' | 'client';
  /** Server mode: descriptor keys must start with this prefix (e.g. `private/submissions/<websiteId>/`). */
  fileKeyPrefix?: string;
}

/** Hard limits for public submissions (independent of field configuration). */
export const SUBMISSION_LIMITS = { maxStringLength: 10_000, maxArrayItems: 100, maxFiles: 20 } as const;

const FILE_KEY = /^[A-Za-z0-9/_.-]{1,512}$/;
const MIME = /^[\w.+-]{1,100}\/[\w.+-]{1,100}$/;

function toFileDescriptors(value: unknown, prefix: string | undefined, maxFiles: number): UploadedFileDescriptor[] | null {
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0 || list.length > maxFiles) return null;
  const out: UploadedFileDescriptor[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const { key, filename, size, mimeType } = item as Record<string, unknown>;
    if (typeof key !== 'string' || !FILE_KEY.test(key) || key.split('/').includes('..')) return null;
    if (prefix !== undefined && !key.startsWith(prefix)) return null;
    if (typeof filename !== 'string' || filename.length === 0 || filename.length > 255) return null;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return null;
    if (typeof mimeType !== 'string' || !MIME.test(mimeType)) return null;
    out.push({ key, filename, size, mimeType });
  }
  return out;
}

/** Server/client shared submission validation that respects conditional visibility. */
export function validateSubmission(
  form: Pick<FormDefinition, 'fields'>,
  data: Record<string, unknown>,
  opts: ValidateSubmissionOptions = {},
): { valid: boolean; errors: FieldError[]; values: Record<string, unknown> } {
  const errors: FieldError[] = [];
  const values: Record<string, unknown> = {};
  const mode = opts.mode ?? 'server';
  const own = (k: string) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : undefined);
  for (const field of form.fields) {
    if (field.type === 'heading' || field.type === 'paragraph') continue;
    if (field.showIf && !evaluateConditionGroup(field.showIf, data)) continue;
    let value = own(field.name);
    const v = field.validation ?? {};

    if (field.type === 'file') {
      const maxFiles = Math.min(Math.max(v.maxFiles ?? 1, 1), SUBMISSION_LIMITS.maxFiles);
      if (mode === 'server') {
        const files = value === undefined || value === null || value === '' ? null : toFileDescriptors(value, opts.fileKeyPrefix, maxFiles);
        if (!files) {
          if (field.required) errors.push({ field: field.name, message: `${field.label} is required` });
          continue;
        }
        values[field.name] = files;
        continue;
      }
      // client: the value is a display string of chosen file names
      if (typeof value !== 'string' || !value.trim()) {
        if (field.required) errors.push({ field: field.name, message: `${field.label} is required` });
        continue;
      }
      values[field.name] = value.slice(0, SUBMISSION_LIMITS.maxStringLength);
      continue;
    }

    // Only scalars (and arrays of scalars for multi-value fields) are accepted from visitors.
    if (Array.isArray(value)) {
      if (value.length > SUBMISSION_LIMITS.maxArrayItems || value.some((x) => x !== null && typeof x === 'object')) {
        errors.push({ field: field.name, message: 'Invalid value' });
        continue;
      }
    } else if (value !== null && typeof value === 'object') {
      errors.push({ field: field.name, message: 'Invalid value' });
      continue;
    }
    if (typeof value === 'string') value = value.trim();
    const empty = isEmpty(value) || (field.type === 'consent' && value !== true && value !== 'true' && value !== 'on');
    if (empty) {
      if (field.required) errors.push({ field: field.name, message: `${field.label} is required` });
      continue;
    }
    const str = Array.isArray(value) ? value.map(String).join(',') : String(value);
    const maxLen = Math.min(v.maxLength ?? SUBMISSION_LIMITS.maxStringLength, SUBMISSION_LIMITS.maxStringLength);
    if (str.length > SUBMISSION_LIMITS.maxStringLength) {
      errors.push({ field: field.name, message: `At most ${maxLen} characters` });
      continue;
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) errors.push({ field: field.name, message: 'Enter a valid email address' });
    if (field.type === 'url' && !/^https?:\/\/\S+$/.test(str)) errors.push({ field: field.name, message: 'Enter a valid URL' });
    if (field.type === 'phone' && !/^[+()\d\s.-]{5,25}$/.test(str)) errors.push({ field: field.name, message: 'Enter a valid phone number' });
    if (field.type === 'number' || field.type === 'rating') {
      const n = Number(value);
      if (Number.isNaN(n)) errors.push({ field: field.name, message: 'Enter a number' });
      if (v.min !== undefined && n < v.min) errors.push({ field: field.name, message: `Minimum is ${v.min}` });
      if (v.max !== undefined && n > v.max) errors.push({ field: field.name, message: `Maximum is ${v.max}` });
      value = n;
    }
    if (v.minLength !== undefined && str.length < v.minLength) errors.push({ field: field.name, message: `At least ${v.minLength} characters` });
    if (v.maxLength !== undefined && str.length > v.maxLength) errors.push({ field: field.name, message: `At most ${v.maxLength} characters` });
    if (v.pattern) {
      // ReDoS guards: unsafe patterns are skipped (reported by publish validation); long values never hit the regex.
      if (isSafeRegexPattern(v.pattern)) {
        if (str.length > MAX_REGEX_INPUT_LENGTH || !safeRegexTest(v.pattern, str)) errors.push({ field: field.name, message: v.patternMessage ?? 'Invalid format' });
      }
    }
    if ((field.type === 'select' || field.type === 'radio') && field.options && !field.options.some((o) => o.value === str)) {
      errors.push({ field: field.name, message: 'Choose a valid option' });
    }
    if (field.type === 'multiselect' || (field.type === 'checkbox' && field.options?.length)) {
      const arr = Array.isArray(value) ? value.map(String) : [str];
      if (field.options && arr.some((x) => !field.options!.some((o) => o.value === x))) errors.push({ field: field.name, message: 'Choose valid options' });
      value = arr;
    } else if (Array.isArray(value)) {
      value = str;
    }
    if (field.type === 'consent') value = true;
    values[field.name] = value;
  }
  return { valid: errors.length === 0, errors, values };
}
