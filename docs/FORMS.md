# Forms, rules & submissions

Forms are part of the website schema (`FormDefinition` in `@atrium/schema`). They are built in the
visual builder (or by the AI agent), rendered by the `form` component on published sites, submitted
to the public API, stored as submissions, and processed by the **rule engine** in the worker
(`form.process`), which sends emails and SMS, calls webhooks and tags, assigns or re-statuses
submissions.

```
visitor ─► POST /v1/public/forms/:formId/submit
             rate limit → honeypot → captcha → validateSubmission → spam score → store
             └─ not spam ─► queue form.process { submissionId }
worker: form.process ─► planFormRules ─► email.send · sms.send · webhook.dispatch · tag · assign · status
                       └─► webhook.dispatch  form.submitted
```

## Form definition

```ts
{
  id: 'frm_wedding',
  name: 'Wedding enquiry',
  slug: 'wedding-enquiry',
  fields: FormField[],
  settings: {
    submitLabel: 'Send enquiry',
    successMessage: 'Thank you — we will be in touch shortly.',
    redirectUrl?: '/thank-you',
    storeSubmissions: true,          // false = process, then delete the submission
    honeypot: true,
    captcha: { provider: 'none' | 'recaptcha-v2' | 'recaptcha-v3' | 'turnstile' | 'hcaptcha',
               integrationId?: string, minScore: 0.5, action: 'submit' },
    rateLimitPerMinute: 5,           // per form + visitor (hashed IP)
    layout: 'grid' | 'stacked',
    consentText?: string,
  },
  rules: FormRule[],
}
```

In the database a form is stored as `forms` (settings) + `form_fields` + `form_rules` rows
(`@atrium/site-store` maps between the two shapes).

### Field types

| Type | Value | Notes |
| --- | --- | --- |
| `text`, `textarea` | string | `minLength`, `maxLength`, `pattern` + `patternMessage` |
| `email` | string | Format validated; usable as an autoresponder recipient |
| `phone` | string | Lenient format check; SMS actions normalize to E.164 |
| `number`, `rating` | number | `min`, `max` |
| `select`, `radio` | string | Must match one of `options[].value` |
| `multiselect`, `checkbox` (with options) | string[] | Every value must be an option |
| `checkbox` (no options), `consent` | boolean | `consent` must be checked when required |
| `date`, `time`, `datetime`, `url` | string | `url` must be http(s) |
| `file` | `[{ key, filename, size, mimeType }]` | `accept` (MIME types, `image/*` or `.pdf`), `maxFileSizeMb` (default 10), `maxFiles`; stored privately |
| `hidden` | string | UTM tags, campaign ids… (`defaultValue`) |
| `heading`, `paragraph` | — | Layout only, never submitted |
| `custom` | any | Rendered by a registered component (`component`) |

Every field has a machine `name` (`^[a-zA-Z][a-zA-Z0-9_]*$`) used in submissions and templates, a
`label`, optional `placeholder`, `helpText`, `required`, `defaultValue` and `width`
(`full | half | third`).

### Conditional fields

`showIf` is a condition group. A hidden field is neither shown nor validated (`validateSubmission`
applies the same logic on the client and the server):

```json
{
  "id": "fld_venue", "type": "select", "name": "venueArea", "label": "Preferred area",
  "options": [{ "label": "Lakeside lawn", "value": "lawn" }, { "label": "Ballroom", "value": "ballroom" }],
  "showIf": { "match": "all", "conditions": [{ "field": "eventType", "op": "eq", "value": "wedding" }] }
}
```

Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `notContains`, `in`, `notIn`,
`empty`, `notEmpty`, `matches` (regex). Groups nest (`{ match: 'any', conditions: [...] }`), and
`contains`/`eq` test membership for array values such as multiselects.

## Rules engine

A rule is `when` (condition group; omitted = always) → `then` actions, otherwise `otherwise`
actions. Rules run in order. `stopProcessing: true` stops evaluation after a **matching** rule.
Disabled rules are skipped, and invalid rules are logged on the submission timeline and skipped.
Planning is pure (`planFormRules` in `@atrium/schema`); execution happens in the worker.

Conditions see every field by `name` with typed values (numbers stay numbers, multiselects stay
arrays) plus `submission.*` (`submission.locale`, `submission.pageUrl`…).

### Actions

| Action | Shape | Execution |
| --- | --- | --- |
| `email` | `{ to: string[], cc?, bcc?, replyTo?, subject, body?, html?, providerId? }` | Templates rendered, then `email.send`. Without `html` the **default template** (all fields + files) is used, with `body` as an intro paragraph. |
| `autoresponder` | `{ subject, html, emailField = 'email', providerId? }` | Sent to the address in `emailField`; skipped when it isn't a valid email. |
| `sms` | `{ to: string[], body (≤1600), providerId? }` | One `sms.send` per recipient (templated numbers allowed, e.g. `{{phone}}`). |
| `webhook` | `{ webhookId? , url? }` | `webhookId` → signed delivery through `webhook.dispatch` (retries, delivery log). `url` → single unsigned POST, result logged. |
| `tag` | `{ tags: string[] }` | Added to the submission (deduplicated; templating allowed). |
| `assign` | `{ userId }` | Sets `assignedToId`. |
| `status` | `{ status }` | `new`, `contacted`, `qualified`, `converted`, `rejected`, `spam`, `archived`. |

Queued jobs use deterministic job ids (`fp-{submissionId}-{ruleId}-{branch}-{index}`), so a retried
`form.process` never sends duplicate notifications. Every action result (`queued`, `sent`, `done`,
`skipped`, `failed`) is appended to `FormSubmission.actionsLog`, followed by a final `rules`
summary entry. After the actions, `form.submitted` is dispatched to every subscribed webhook.

### Example: large weddings go to the events team

```json
{
  "id": "big-wedding",
  "name": "Weddings over 200 guests",
  "when": { "match": "all", "conditions": [
    { "field": "eventType", "op": "eq", "value": "wedding" },
    { "field": "guestCount", "op": "gt", "value": 200 }
  ]},
  "then": [
    { "type": "email", "to": ["events@aranya.example"], "replyTo": "{{email}}",
      "subject": "Large wedding enquiry: {{name}} — {{guestCount}} guests on {{eventDate}}" },
    { "type": "tag", "tags": ["wedding", "vip"] },
    { "type": "status", "status": "qualified" },
    { "type": "webhook", "webhookId": "wh_crm" }
  ],
  "otherwise": [
    { "type": "email", "to": ["hello@aranya.example"], "subject": "New enquiry from {{name}}" }
  ]
}
```

### Example: Nepal vs international routing

```json
[
  {
    "id": "nepal",
    "name": "Nepal — local team + SMS",
    "when": { "match": "any", "conditions": [
      { "field": "country", "op": "eq", "value": "NP" },
      { "field": "phone", "op": "matches", "value": "^(\\+?977)?9[78]\\d{8}$" }
    ]},
    "then": [
      { "type": "email", "to": ["kathmandu@aranya.example"], "subject": "Local enquiry: {{name}}" },
      { "type": "sms", "to": ["{{phone}}"], "body": "Namaste {{name}}! We received your enquiry for {{guestCount}} guests. Our team will call you within a day.", "providerId": "sms_sparrow" }
    ],
    "otherwise": [
      { "type": "email", "to": ["reservations@aranya.example"], "subject": "International enquiry: {{name}} ({{country}})" },
      { "type": "autoresponder", "subject": "We received your enquiry", "html": "<p>Dear {{name}},</p><p>Thank you for contacting {{website.name}}. A travel specialist will reply within 24 hours.</p>" }
    ],
    "stopProcessing": false
  }
]
```

Use a local Nepali gateway (`sparrow`, `aakash`) for the `then` branch and Twilio/Vonage/SNS for
international numbers by setting `providerId` per action. The SMS drivers normalize numbers
(`9812345678` → `+9779812345678` with `defaultCountry: NP`; the Nepali gateways send the 10-digit
national number).

## Email & SMS templates

Templates use safe `{{path}}` interpolation with an optional fallback: `{{company | not provided}}`.
There is no code execution. In HTML templates (`html`, autoresponder) every interpolated value is
HTML-escaped, while subjects, `body` and SMS text are plain text.

| Variable | Value |
| --- | --- |
| `{{fieldName}}` | Display value of a field: arrays joined with `, `, booleans as Yes/No, files as file names |
| `{{values.fieldName}}` | Same, namespaced |
| `{{submission.id}}`, `{{submission.createdAt}}` (ISO), `{{submission.date}}` | Submission identity and time |
| `{{submission.pageUrl}}`, `{{submission.referrer}}`, `{{submission.locale}}`, `{{submission.status}}`, `{{submission.tags}}` | Context |
| `{{website.name}}`, `{{website.slug}}`, `{{website.url}}` | The site (primary domain when connected) |
| `{{form.name}}`, `{{form.slug}}`, `{{form.id}}` | The form |

Recipients (`to`, `cc`, `bcc`, `replyTo`) are templated too, and may contain comma-separated lists
or `Name <address>`. Invalid addresses are dropped, and an action with no valid recipient is logged
as `skipped`.

**Default notification template.** It lists every field as a label/value table, adds the site,
date and page URL, a *View submission* button linking to the admin, and for uploads
**"N file(s) attached"** with 7-day signed download links.

**Senders.** Emails go through the provider chosen by `providerId`, else the website's email
provider, else the organization default, else the platform SMTP (`SMTP_*`, `MAIL_FROM`). The From
address is the provider's `fromEmail`/`fromName`. SMS uses the same resolution, but there is no
platform fallback.

## Spam protection

Layered checks, all configurable per form:

1. **Rate limit**: `rateLimitPerMinute` per form + hashed visitor IP (Redis); excess requests get `429`.
2. **Honeypot**: a hidden `_hp` input that humans never fill. A filled honeypot stores the
   submission as `SPAM` (score 1) and returns the normal success response, so bots learn nothing.
3. **Captcha** (optional, below). Verification happens server-side before anything is stored.
4. **Spam score** (0–1): the captcha score deficit (`0.6 − score`), a form completed in under
   2.5 s (`_ts` render timestamp), links in text (≥1: +0.1, ≥3: +0.3), common spam phrases,
   repeated characters and script anomalies. A score of **≥ 0.8** stores the submission as `SPAM`.

Spam submissions are kept (status `SPAM`) for review, and the rule engine does not run for them.
To run the rules for a false positive after changing its status, enqueue `form.process
{ submissionId }` again. Processing is idempotent: a submission whose rules already completed is
skipped, and notification job ids are deterministic.

## Captcha options

Captcha providers are **integrations** (`kind: CAPTCHA`, driver = provider id) with config
`{ siteKey, allowedHostnames?, minScore? }` and secret `{ secretKey }`. The site key is published in
the site snapshot (`runtime.captcha`) for the renderer. The secret never leaves the server. A form
selects `settings.captcha.provider` and optionally `integrationId`; otherwise the website's (then
the organization's) integration for that provider is used. If the integration is missing, the
public API fails closed with `424 NOT_CONFIGURED`.

Verification calls the provider's siteverify endpoint (8 s timeout). Network failures count as
**failed** verification (`verify-unavailable`), so an outage never lets spam through silently.
`allowedHostnames` additionally rejects tokens issued for other hosts.

### Google reCAPTCHA v2 (checkbox / invisible)

1. Open <https://www.google.com/recaptcha/admin/create>, choose **reCAPTCHA v2** → *"I'm not a robot"
   Checkbox* (or *Invisible*).
2. Add every domain the site is served from: the platform subdomain (`{slug}.sites.example.com`),
   custom domains, and `localhost` for development.
3. Copy the **Site key** and **Secret key**.
4. In Atrium, go to *Settings → Integrations → Add → Google reCAPTCHA v2*, paste both keys, and
   optionally restrict `allowedHostnames`.
5. On the form, set *Spam protection → Captcha* to **reCAPTCHA v2**. The widget token is sent as
   `g-recaptcha-response`/`captchaToken`.

### Google reCAPTCHA v3 (invisible, score-based)

1. Create a **reCAPTCHA v3** key at the same console, with the same domains.
2. Add the integration *Google reCAPTCHA v3* with the keys and a default `minScore` (0.5 is a good
   start; raise to 0.7 for high-abuse forms).
3. On the form, choose **reCAPTCHA v3**, set `minScore` and `action` (default `submit`). The renderer
   calls `grecaptcha.execute(siteKey, { action })` on submit.
4. The server requires `success`, `score ≥ minScore` (`score-too-low` otherwise) and a matching
   `action` (`action-mismatch`). The score is stored as `captchaScore` and also feeds the spam score.
5. Watch the score distribution in the reCAPTCHA admin console for a week before tightening the
   threshold.

### Cloudflare Turnstile

1. In the Cloudflare dashboard, go to **Turnstile → Add widget**, add your hostnames, and choose
   *Managed* (recommended) or *Invisible*.
2. Copy the site key and secret key into an integration *Cloudflare Turnstile*.
3. Select **Turnstile** on the form. The token is sent as `cf-turnstile-response`. If you set a
   widget `action`, it is checked too.

### hCaptcha

1. Create a site at <https://dashboard.hcaptcha.com>, add your hostnames, and copy the site key plus
   your account **secret**.
2. Add the integration *hCaptcha* and select **hCaptcha** on the form. The token is sent as
   `h-captcha-response`, and the server verifies with the site key included.

## Submission lifecycle

| Stage | What happens |
| --- | --- |
| **Received** | Validation (with conditional visibility), files uploaded to `private/submissions/{websiteId}/…`, spam scoring. |
| **Stored** | `form_submissions` row (`NEW` or `SPAM`) + normalized `submission_values`. `summary` holds the first fields for fast lists. A `conversion` analytics event is recorded for non-spam submissions. |
| **Processed** | `form.process` runs the rules, fans out notifications, dispatches `form.submitted`, and writes `actionsLog`. |
| **Worked** | In the admin: read/unread, status pipeline (`new → contacted → qualified → converted`, or `rejected`/`archived`), tags, assignment, internal notes, CSV/XLSX export. |
| **Not stored** | With `storeSubmissions: false`, the submission is deleted right after processing. Notifications are fully rendered before deletion, so they still contain every value. |
| **Retention** | Submissions are kept until deleted. Uploaded files stay in storage (signed links in emails expire after 7 days). |

The timeline (`actionsLog`) records every action with time, rule, branch, provider, target, message
id and error. Email and SMS delivery results are appended asynchronously by `email.send` /
`sms.send`. Failures after the final retry (5 attempts, exponential backoff from 5 s) are logged as
`failed`. Non-retryable provider errors such as bad credentials fail immediately.

## Webhooks

Organizations register webhooks under *Settings → Webhooks* with a URL, the events to receive, and
an optional website scope. Events: `form.submitted`, `page.published`, `website.published`,
`deployment.created`, `deployment.completed`, `deployment.failed`, `media.uploaded`, `user.invited`,
`domain.verified`, `ai.generation.completed`. Subscriptions may also use `*` (everything) or
`form.*` (one namespace). Each webhook gets a signing secret (`whsec_…`), shown once when created.

**Delivery.** `webhook.dispatch` creates a `WebhookDelivery` per matching webhook and enqueues
`webhook.deliver`. Each attempt is a `POST` with a 10 s timeout. A 2xx response is `SUCCESS`, and
anything else is retried with exponential backoff (8 attempts starting at 30 s, about 2 hours in
total) before it is marked `FAILED`. `410 Gone` stops retries immediately. Every attempt records the
status code, the first 4 KB of the response body, the duration and the error. Delivery history is
pruned after 90 days. Production refuses private-network targets (SSRF protection).

**Request**

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: Atrium-Webhooks/1.0
X-Atrium-Event: form.submitted
X-Atrium-Delivery: cmabc123…          (unique per delivery; use it for idempotency)
X-Atrium-Timestamp: 1791201600        (unix seconds)
X-Atrium-Signature: sha256=5f1c…      (HMAC-SHA256 of "{timestamp}.{raw body}")

{
  "id": "cmabc123…",
  "event": "form.submitted",
  "createdAt": "2026-10-05T12:00:00.000Z",
  "organizationId": "org_…",
  "websiteId": "web_…",
  "data": {
    "submissionId": "sub_…", "formId": "frm_…", "formName": "Wedding enquiry", "formSlug": "wedding-enquiry",
    "websiteId": "web_…", "pageUrl": "https://aranya.example/weddings", "createdAt": "…",
    "data": { "name": "Asha Rai", "email": "asha@example.com", "guestCount": "250", "services": ["catering", "decor"] },
    "fields": [{ "name": "name", "label": "Your name", "type": "text", "value": "Asha Rai" }]
  }
}
```

**Verifying signatures (Node.js)**

```js
import crypto from 'node:crypto';
import express from 'express';

const app = express();
const SECRET = process.env.ATRIUM_WEBHOOK_SECRET; // whsec_…

// Use the RAW body: re-serialized JSON will not match the signature.
app.post('/webhooks/atrium', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = req.get('X-Atrium-Timestamp');
  const signature = req.get('X-Atrium-Signature') ?? '';
  const body = req.body.toString('utf8');

  // 1) Reject stale requests (replay protection, 5 minutes).
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return res.status(400).send('stale');

  // 2) Compare HMAC-SHA256("{timestamp}.{body}") in constant time.
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).send('bad signature');

  const event = JSON.parse(body);
  // 3) Deduplicate on X-Atrium-Delivery / event.id: retries reuse the same id.
  console.log('received', event.event, event.id);
  res.sendStatus(204); // respond quickly; do slow work asynchronously
});

app.listen(3000);
```

With Atrium's own packages: `verifyWebhookSignature(secret, timestamp, rawBody, signature)` from
`@atrium/server-kit`.

**Ad-hoc rule URLs.** A rule `webhook` action with a bare `url` (no stored webhook) sends one
unsigned POST (`X-Atrium-Event: form.submitted`, body `{ event, createdAt, data }`), with no
retries. Use a registered webhook when you need signatures, retries and delivery history.
