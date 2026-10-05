import type { PageDocument, WebsiteDefinition } from '@atrium/schema';
import { analyzePageSeo } from '@atrium/builder-core';
import { z } from 'zod';
import { Llm } from './llm';
import { DESIGN_PRINCIPLES } from './prompts';

export const REWRITE_MODES = {
  rewrite: 'Rewrite it with fresh wording, same meaning and length.',
  shorten: 'Make it about half as long without losing the key point.',
  expand: 'Expand it with one or two concrete, specific details. Keep it tight.',
  professional: 'Make it more professional and precise.',
  luxurious: 'Make it feel quietly luxurious: sensory, unhurried, specific — never gaudy.',
  casual: 'Make it warmer and more conversational.',
  seo: 'Optimize it for search: include the most relevant natural keyword phrase once, keep it readable.',
  translate: 'Translate it faithfully.',
} as const;
export type RewriteMode = keyof typeof REWRITE_MODES;

export async function rewriteText(llm: Llm, opts: { text: string; mode: RewriteMode; locale?: string; context?: string; voice?: string }): Promise<string> {
  const out = await llm.text(
    `${DESIGN_PRINCIPLES}\n\nYou rewrite a single piece of website copy. Return only the rewritten text — no quotes, no preamble. Preserve *asterisk emphasis*, {{template}} placeholders and line breaks where they make sense.`,
    `${opts.voice ? `Brand voice: ${opts.voice}\n` : ''}${opts.context ? `Context: ${opts.context}\n` : ''}${opts.mode === 'translate' ? `Target language: ${opts.locale ?? 'en'}\n` : ''}Instruction: ${REWRITE_MODES[opts.mode]}\n\nText:\n${opts.text}`,
    2000,
  );
  return out.replace(/^["“]|["”]$/g, '');
}

const SeoRecs = z.object({
  recommendations: z.array(z.object({ field: z.enum(['title', 'description', 'ogTitle', 'ogDescription', 'h1', 'content', 'structuredData', 'alt']), current: z.string().nullable(), suggested: z.string(), reason: z.string() })).max(8),
});

export async function seoRecommendations(llm: Llm, def: WebsiteDefinition, page: PageDocument) {
  const report = analyzePageSeo(page, def);
  const text = JSON.stringify(page.sections.map((s) => ({ type: s.type, props: s.props })), (_k, v) => (typeof v === 'string' && v.length > 300 ? v.slice(0, 300) : v)).slice(0, 20_000);
  return llm.json(
    'seo_recommendations',
    SeoRecs,
    `${DESIGN_PRINCIPLES}\n\nYou are an SEO specialist. Recommend concrete improvements. Titles ≤ 60 characters, descriptions 120–160 characters, natural language, no keyword stuffing.`,
    `Site: ${def.settings.name} — ${def.settings.business.description ?? ''}\nPage: ${page.title} (/${page.slug})\nCurrent meta title: ${page.seo.title ?? '(none)'}\nCurrent description: ${page.seo.description ?? '(none)'}\nAutomated checks: ${report.checks.map((c) => `${c.label}: ${c.status}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}\nContent:\n${text}`,
    6000,
  );
}
