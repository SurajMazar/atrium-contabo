import type { CaptchaConfig, CaptchaProvider } from '../islands/captcha';
import { FormIsland, type FormIslandProps } from '../islands/form';
import type { RenderContext, RenderProps } from '../types';
import { cx, EditorNotice, editProp, Rich } from '../ui/core';
import { Frame } from '../ui/media';
import { Intro, Section } from '../ui/section';
import { ContactDetails } from './site';

/**
 * Serializable props for the form island. Rules (recipients, webhooks) are never sent to the browser.
 */
export function formIslandProps(ctx: RenderContext, nodeId: string, formId: string, overrides: Partial<FormIslandProps> & { fieldFilter?: (t: string) => boolean } = {}): FormIslandProps | null {
  const form = ctx.forms.get(formId);
  if (!form) return null;
  const provider = form.settings.captcha?.provider ?? 'none';
  const rt = ctx.runtime.captcha[form.id] ?? ctx.runtime.captcha[formId] ?? ctx.runtime.captcha.default;
  const captcha: CaptchaConfig | null = provider !== 'none' && rt?.siteKey ? { provider: ((rt.provider as CaptchaProvider) || provider) as CaptchaProvider, siteKey: rt.siteKey, action: form.settings.captcha.action } : null;
  const { fieldFilter, ...rest } = overrides;
  return {
    form: { id: form.id, fields: fieldFilter ? form.fields.filter((f) => fieldFilter(f.type)) : form.fields, settings: form.settings },
    formId: form.id,
    apiBaseUrl: ctx.apiBaseUrl,
    mode: ctx.mode,
    locale: ctx.locale,
    captcha,
    layout: form.settings.layout === 'stacked' ? 'stacked' : 'grid',
    ...rest,
  };
}

export function FormRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'split-with-text';
  const island = props.formId ? formIslandProps(ctx, node.id, String(props.formId), { submitLabel: props.submitLabel || undefined }) : null;
  const formEl = island ? <FormIsland {...island} /> : <EditorNotice ctx={ctx}>Choose a form in the inspector to display it here.</EditorNotice>;
  if (variant === 'split-with-text') {
    return (
      <Section rp={rp} labelled>
        <div className="a-formsec__split">
          <div className="a-formsec__aside">
            <Intro ctx={ctx} props={props} nodeId={node.id} align="left" />
            {props.image ? <Frame ctx={ctx} media={props.image} aspect="4:3" sizes="(max-width: 991px) 100vw, 40vw" rounded="sm" className="a-formsec__image" /> : null}
            {props.showContactDetails ? <ContactDetails ctx={ctx} className="a-formsec__contact" /> : null}
          </div>
          <div className="a-formsec__form">{formEl}</div>
        </div>
      </Section>
    );
  }
  return (
    <Section rp={rp} labelled width={variant === 'stacked' ? 'narrow' : props.containerWidth}>
      <Intro ctx={ctx} props={props} nodeId={node.id} align={variant === 'stacked' ? 'center' : props.align} />
      <div className={cx('a-formsec__form', variant === 'card' && 'a-formsec__card')}>{formEl}</div>
    </Section>
  );
}

export function NewsletterRenderer(rp: RenderProps) {
  const { props, ctx, node } = rp;
  const variant = rp.variant ?? 'inline';
  const island = props.formId
    ? formIslandProps(ctx, node.id, String(props.formId), { layout: 'inline', submitLabel: props.buttonLabel, placeholder: props.placeholder, fieldFilter: (t) => ['email', 'consent', 'hidden', 'checkbox'].includes(t) })
    : null;
  const formEl = island ? <FormIsland {...island} /> : <EditorNotice ctx={ctx}>Choose a form with an email field.</EditorNotice>;
  const copy = (
    <div className="a-newsletter__copy">
      {props.eyebrow ? <p className="a-eyebrow" {...editProp(ctx, 'eyebrow')}>{props.eyebrow}</p> : null}
      <h2 className="a-heading a-newsletter__heading" {...editProp(ctx, 'heading')}><Rich text={props.heading} /></h2>
      {props.text ? <p className="a-muted" {...editProp(ctx, 'text')}><Rich text={props.text} /></p> : null}
    </div>
  );
  if (variant === 'banner') {
    return (
      <Section rp={rp} className="a-on-media" container={false}>
        {props.image ? <Frame ctx={ctx} media={props.image} className="a-newsletter__bg" sizes="100vw" /> : null}
        <div className="a-overlay" style={{ opacity: 0.55 }} />
        <div className="a-container a-container--narrow a-newsletter__inner">
          {copy}
          {formEl}
        </div>
      </Section>
    );
  }
  return (
    <Section rp={rp} width={variant === 'card' ? 'narrow' : props.containerWidth}>
      <div className={cx('a-newsletter__inner', variant === 'card' && 'a-newsletter__card')}>
        {copy}
        {formEl}
      </div>
    </Section>
  );
}

export const FORMS_CSS = /* css */ `
.atrium-site .a-form{display:grid;gap:var(--a-space-5);width:100%}
.atrium-site .a-form__fields{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:var(--a-space-5) var(--a-space-4)}
.atrium-site .a-form--stacked .a-form__fields>*{grid-column:1/-1}
.atrium-site .a-field{grid-column:span 6;display:grid;gap:.45rem;align-content:start;min-width:0;border:0;padding:0;margin:0}
.atrium-site .a-form--grid .a-field--half{grid-column:span 3}
.atrium-site .a-form--grid .a-field--third{grid-column:span 2}
.atrium-site .a-form__heading{grid-column:1/-1;font-family:var(--a-font-heading);font-size:var(--a-text-xl);font-weight:var(--a-weight-heading);margin-top:var(--a-space-2)}
.atrium-site .a-form__para{grid-column:1/-1;color:var(--t-muted)}
.atrium-site .a-field__label{font-size:var(--a-text-sm);font-weight:500;letter-spacing:.01em;padding:0}
.atrium-site .a-field__req{color:var(--t-muted)}
.atrium-site .a-field :is(input:not([type=checkbox]):not([type=radio]),select,textarea){width:100%;min-height:3rem;padding:.8rem 1rem;border:1px solid color-mix(in srgb,var(--t-text) 22%,transparent);border-radius:var(--a-radius-sm);background:color-mix(in srgb,var(--t-bg) 92%,var(--t-text) 0%);color:var(--t-text);font-size:var(--a-text-base);line-height:1.4;transition:border-color .25s,box-shadow .25s;appearance:none}
.atrium-site .a-tone-inverse .a-field :is(input:not([type=checkbox]):not([type=radio]),select,textarea),.atrium-site .a-on-media .a-field :is(input:not([type=checkbox]):not([type=radio]),select,textarea){background:color-mix(in srgb,var(--a-color-inverse-text) 6%,transparent)}
.atrium-site .a-field textarea{min-height:8rem;resize:vertical}
.atrium-site .a-field :is(input,select,textarea)::placeholder{color:color-mix(in srgb,var(--t-text) 45%,transparent)}
.atrium-site .a-field :is(input,select,textarea):hover{border-color:color-mix(in srgb,var(--t-text) 40%,transparent)}
.atrium-site .a-field :is(input,select,textarea):focus{outline:none;border-color:var(--t-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--t-accent) 18%,transparent)}
.atrium-site .a-select{position:relative}
.atrium-site .a-select::after{content:"";position:absolute;right:1rem;top:50%;width:.45rem;height:.45rem;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-70%) rotate(45deg);pointer-events:none;opacity:.6}
.atrium-site .a-select select{padding-right:2.5rem}
.atrium-site .a-choices{display:flex;flex-wrap:wrap;gap:.6rem 1.25rem}
.atrium-site .a-choice{display:inline-flex;align-items:flex-start;gap:.65rem;font-size:var(--a-text-sm);line-height:1.45;cursor:pointer}
.atrium-site .a-choice input{flex:none;width:1.1rem;height:1.1rem;margin:.12rem 0 0;accent-color:var(--a-color-primary)}
.atrium-site .a-field--rating .a-choice{padding:.4rem .75rem;border:1px solid var(--t-border);border-radius:var(--a-radius-full)}
.atrium-site .a-field__help{font-size:var(--a-text-xs);color:var(--t-muted)}
.atrium-site .a-field__error{font-size:var(--a-text-xs);font-weight:500;color:var(--a-color-danger)}
.atrium-site .a-tone-inverse .a-field__error{color:color-mix(in srgb,var(--a-color-danger) 55%,var(--a-color-inverse-text))}
.atrium-site .a-field.is-invalid :is(input,select,textarea){border-color:var(--a-color-danger)}
.atrium-site .a-form__hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.atrium-site .a-form__submit{display:flex;align-items:center}
.atrium-site .a-form__submit .a-btn[disabled]{opacity:.65;cursor:progress}
.atrium-site .a-form__status{min-height:1.25em;font-size:var(--a-text-sm);color:var(--t-muted)}
.atrium-site .a-form__status:empty{display:none}
.atrium-site .a-form__status.is-error{color:var(--a-color-danger)}
.atrium-site .a-form__success{display:grid;gap:.5rem;padding:clamp(1.5rem,4vw,2.5rem);border:1px solid var(--t-border);border-radius:var(--a-radius-md);outline:none}
.atrium-site .a-form__success-title{font-family:var(--a-font-heading);font-size:var(--a-text-2xl)}
.atrium-site .a-form--inline .a-form__fields{grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:.75rem}
.atrium-site .a-form--inline .a-field{grid-column:auto}
.atrium-site .a-form--inline .a-field--check{grid-column:1/-1;order:3}
.atrium-site .a-form--inline .a-form__submit .a-btn{min-height:3rem}
@media (max-width:767px){.atrium-site .a-form--grid .a-field--half,.atrium-site .a-form--grid .a-field--third{grid-column:span 6}.atrium-site .a-form--inline .a-form__fields{grid-template-columns:1fr}}
.atrium-site .a-formsec__split{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(2.5rem,7vw,7rem);align-items:start}
.atrium-site .a-formsec__aside{display:grid;gap:clamp(1.5rem,3vw,2.5rem);position:sticky;top:calc(var(--a-header-h) + 2rem)}
.atrium-site .a-formsec__aside .a-intro{margin-bottom:0}
.atrium-site .a-formsec__contact{padding-top:1.5rem;border-top:1px solid var(--t-border)}
.atrium-site .a-formsec__card{padding:clamp(1.5rem,5vw,3.5rem);border:1px solid var(--t-border);border-radius:var(--a-radius-md);background:var(--t-surface)}
@media (max-width:991px){.atrium-site .a-formsec__split{grid-template-columns:1fr}.atrium-site .a-formsec__aside{position:static}}
.atrium-site .a-newsletter__inner{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(1.5rem,5vw,5rem);align-items:center}
.atrium-site .a-newsletter__copy{display:grid;gap:.75rem}
.atrium-site .a-newsletter__heading{font-size:var(--a-text-3xl)}
.atrium-site .a-newsletter__card{grid-template-columns:1fr;text-align:center;padding:clamp(2rem,6vw,4rem);border:1px solid var(--t-border);border-radius:var(--a-radius-md)}
.atrium-site .a-newsletter__card .a-newsletter__copy{justify-items:center}
.atrium-site .a-newsletter--banner{overflow:hidden;padding-block:clamp(5rem,12vw,9rem)}
.atrium-site .a-newsletter__bg{position:absolute!important;inset:0;z-index:0}
.atrium-site .a-newsletter__bg>.a-img{position:absolute}
.atrium-site .a-newsletter--banner .a-newsletter__inner{position:relative;z-index:2;grid-template-columns:1fr;text-align:center;justify-items:center}
.atrium-site .a-newsletter--banner .a-newsletter__copy{justify-items:center}
.atrium-site .a-newsletter--banner .a-form{max-width:32rem}
@media (max-width:767px){.atrium-site .a-newsletter__inner{grid-template-columns:1fr}}
`;
