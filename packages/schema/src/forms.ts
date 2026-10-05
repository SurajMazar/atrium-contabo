import { z } from 'zod';
import { ConditionGroupSchema, type Condition, type ConditionGroup } from './node';

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
      pattern: z.string().optional(),
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
  z.object({ type: z.literal('webhook'), webhookId: z.string().optional(), url: z.string().url().optional() }),
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
  redirectUrl: z.string().optional(),
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
      try {
        return new RegExp(String(expected)).test(String(actual ?? ''));
      } catch {
        return false;
      }
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

/** Server/client shared submission validation that respects conditional visibility. */
export function validateSubmission(form: Pick<FormDefinition, 'fields'>, data: Record<string, unknown>): { valid: boolean; errors: FieldError[]; values: Record<string, unknown> } {
  const errors: FieldError[] = [];
  const values: Record<string, unknown> = {};
  for (const field of form.fields) {
    if (field.type === 'heading' || field.type === 'paragraph') continue;
    if (field.showIf && !evaluateConditionGroup(field.showIf, data)) continue;
    let value = data[field.name];
    if (typeof value === 'string') value = value.trim();
    const empty = isEmpty(value) || (field.type === 'consent' && value !== true && value !== 'true' && value !== 'on');
    if (empty) {
      if (field.required) errors.push({ field: field.name, message: `${field.label} is required` });
      continue;
    }
    const v = field.validation ?? {};
    const str = String(value);
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
      try {
        if (!new RegExp(v.pattern).test(str)) errors.push({ field: field.name, message: v.patternMessage ?? 'Invalid format' });
      } catch {
        /* invalid admin regex is reported by form validation, not to visitors */
      }
    }
    if ((field.type === 'select' || field.type === 'radio') && field.options && !field.options.some((o) => o.value === str)) {
      errors.push({ field: field.name, message: 'Choose a valid option' });
    }
    if (field.type === 'multiselect' || (field.type === 'checkbox' && field.options?.length)) {
      const arr = Array.isArray(value) ? value.map(String) : [str];
      if (field.options && arr.some((x) => !field.options!.some((o) => o.value === x))) errors.push({ field: field.name, message: 'Choose valid options' });
      value = arr;
    }
    if (field.type === 'consent') value = true;
    values[field.name] = value;
  }
  return { valid: errors.length === 0, errors, values };
}
