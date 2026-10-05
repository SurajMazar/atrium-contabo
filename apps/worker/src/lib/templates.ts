import { escapeHtml, interpolate, type TemplateScope } from '@atrium/schema';

/** A stored file reference inside a submission value (`private/submissions/...`). */
export interface SubmissionFile {
  key: string;
  filename: string;
  size?: number;
  mimeType?: string;
  /** Signed download link (filled in when the storage provider supports it). */
  url?: string;
}

export interface SubmissionValueRow {
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  value: string | null;
  valueJson: unknown;
}

export interface SubmissionScopeInput {
  submission: { id: string; createdAt: Date; status: string; pageUrl: string | null; referrer: string | null; locale: string | null; tags: string[] };
  form: { id: string; name: string; slug: string };
  website: { id: string; name: string; slug: string; url?: string };
  values: SubmissionValueRow[];
}

export interface DisplayField {
  name: string;
  label: string;
  type: string;
  display: string;
  files: SubmissionFile[];
}

function isFileList(v: unknown): v is SubmissionFile[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && typeof (x as SubmissionFile).key === 'string' && typeof (x as SubmissionFile).filename === 'string');
}

/** Raw value for rule evaluation (numbers stay numbers, arrays stay arrays). */
export function rawValue(row: SubmissionValueRow): unknown {
  if (row.valueJson !== null && row.valueJson !== undefined) return row.valueJson;
  if (row.value === null) return undefined;
  if (row.fieldType === 'number' || row.fieldType === 'rating') {
    const n = Number(row.value);
    return Number.isNaN(n) ? row.value : n;
  }
  if (row.fieldType === 'consent' || row.fieldType === 'checkbox') {
    if (row.value === 'true') return true;
    if (row.value === 'false') return false;
  }
  return row.value;
}

export function displayValue(row: SubmissionValueRow): DisplayField {
  const raw = rawValue(row);
  let display: string;
  let files: SubmissionFile[] = [];
  if (isFileList(raw)) {
    files = raw;
    display = raw.map((f) => f.filename).join(', ');
  } else if (Array.isArray(raw)) display = raw.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  else if (typeof raw === 'boolean') display = raw ? 'Yes' : 'No';
  else if (raw && typeof raw === 'object') display = JSON.stringify(raw);
  else display = raw === undefined ? '' : String(raw);
  return { name: row.fieldName, label: row.fieldLabel, type: row.fieldType, display, files };
}

/** Values keyed by field name, used by `planFormRules` conditions. */
export function ruleData(values: SubmissionValueRow[]): Record<string, unknown> {
  return Object.fromEntries(values.map((v) => [v.fieldName, rawValue(v)]));
}

/**
 * Template scope for form notifications:
 *   {{fieldName}}            display value of a field (arrays joined, files → names)
 *   {{submission.id}} {{submission.createdAt}} {{submission.pageUrl}} …
 *   {{website.name}} {{website.url}}   {{form.name}} {{form.slug}}
 *   {{fields}}               (not interpolated — use the default template for a full listing)
 */
export function buildSubmissionScope(input: SubmissionScopeInput): TemplateScope & { fieldList: DisplayField[] } {
  const fieldList = input.values.map(displayValue);
  const byName = Object.fromEntries(fieldList.map((f) => [f.name, f.display]));
  return {
    ...byName,
    values: byName,
    submission: {
      id: input.submission.id,
      createdAt: input.submission.createdAt.toISOString(),
      date: input.submission.createdAt.toUTCString(),
      status: input.submission.status.toLowerCase(),
      pageUrl: input.submission.pageUrl ?? '',
      referrer: input.submission.referrer ?? '',
      locale: input.submission.locale ?? '',
      tags: input.submission.tags.join(', '),
    },
    form: input.form,
    website: { ...input.website, url: input.website.url ?? '' },
    fieldList,
  };
}

export function renderText(template: string, scope: TemplateScope): string {
  return interpolate(template, scope);
}

/** HTML template rendering: interpolated values are HTML-escaped (templates themselves are trusted admin input). */
export function renderHtml(template: string, scope: TemplateScope): string {
  return interpolate(template, scope, escapeHtml);
}

/** Plain text → minimal HTML paragraphs (escaped). */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Default notification email listing every submitted field (used when an email action has no html). */
export function defaultSubmissionHtml(scope: ReturnType<typeof buildSubmissionScope>, opts: { intro?: string; adminUrl?: string } = {}): string {
  const form = scope.form as { name: string };
  const website = scope.website as { name: string; url: string };
  const submission = scope.submission as { id: string; date: string; pageUrl: string };
  const files = scope.fieldList.flatMap((f) => f.files);
  const rows = scope.fieldList
    .filter((f) => f.files.length === 0)
    .map(
      (f) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;vertical-align:top;white-space:nowrap">${escapeHtml(f.label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(f.display) || '<span style="color:#aaa">—</span>'}</td></tr>`,
    )
    .join('');
  const fileBlock = files.length
    ? `<p style="margin:16px 0 4px"><strong>${files.length} file${files.length === 1 ? '' : 's'} attached</strong></p><ul style="margin:0;padding-left:18px">${files
        .map((f) => `<li>${f.url ? `<a href="${escapeHtml(f.url)}">${escapeHtml(f.filename)}</a>` : escapeHtml(f.filename)}${f.size ? ` <span style="color:#888">(${Math.max(1, Math.round(f.size / 1024))} KB)</span>` : ''}</li>`)
        .join('')}</ul>${files.some((f) => f.url) ? '<p style="color:#888;font-size:12px;margin:4px 0 0">Download links expire in 7 days.</p>' : ''}`
    : '';
  const admin = opts.adminUrl ? `<p style="margin:20px 0 0"><a href="${escapeHtml(opts.adminUrl)}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">View submission</a></p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:10px;padding:24px">
<h2 style="margin:0 0 4px;font-size:20px">New ${escapeHtml(form.name)} submission</h2>
<p style="margin:0 0 16px;color:#666;font-size:13px">${escapeHtml(website.name)} · ${escapeHtml(submission.date)}${submission.pageUrl ? ` · <a href="${escapeHtml(submission.pageUrl)}" style="color:#666">${escapeHtml(submission.pageUrl)}</a>` : ''}</p>
${opts.intro ? `<div style="margin:0 0 16px">${opts.intro}</div>` : ''}
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
${fileBlock}${admin}
<p style="margin:24px 0 0;color:#aaa;font-size:11px">Submission ${escapeHtml(submission.id)}</p>
</div></body></html>`;
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Render recipient templates (`{{email}}`, comma-separated lists, "Name <a@b.c>") into valid addresses. */
export function renderRecipients(templates: string[] | undefined, scope: TemplateScope): Array<{ email: string; name?: string }> {
  const out = new Map<string, { email: string; name?: string }>();
  for (const t of templates ?? []) {
    for (const part of renderText(t, scope).split(/[,;\n]/)) {
      const s = part.trim();
      if (!s) continue;
      const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
      const email = (m ? m[2]! : s).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) continue;
      const name = m?.[1]?.trim();
      if (name) out.set(email, { email, name });
      else if (!out.has(email)) out.set(email, { email });
    }
  }
  return [...out.values()];
}
