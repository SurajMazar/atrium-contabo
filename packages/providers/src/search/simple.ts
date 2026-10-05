import { z } from 'zod';
import { defineDriver } from '../driver';
import type { SearchDocument, SearchHit, SearchProvider } from './types';

/** Tokenize for search: lowercase, strip diacritics, split on non-letters/digits, drop 1-char tokens. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

function snippet(body: string, terms: string[], radius = 80): string {
  const lower = body.toLowerCase();
  const idx = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + radius * 2);
  return `${start > 0 ? '…' : ''}${body.slice(start, end).trim()}${end < body.length ? '…' : ''}`;
}

/**
 * In-memory BM25-ish search. Suitable for single-process deployments, previews and tests;
 * production multi-node setups should plug in an external search driver.
 */
export class SimpleSearchProvider implements SearchProvider {
  readonly driver = 'simple';
  private readonly docs = new Map<string, Map<string, SearchDocument & { tokens: string[]; titleTokens: string[] }>>();

  async index(docs: SearchDocument[]): Promise<void> {
    for (const d of docs) {
      let site = this.docs.get(d.websiteId);
      if (!site) this.docs.set(d.websiteId, (site = new Map()));
      site.set(d.id, { ...d, tokens: tokenize(`${d.body} ${(d.tags ?? []).join(' ')}`), titleTokens: tokenize(d.title) });
    }
  }

  async remove(websiteId: string, ids?: string[]): Promise<void> {
    if (!ids) {
      this.docs.delete(websiteId);
      return;
    }
    const site = this.docs.get(websiteId);
    for (const id of ids) site?.delete(id);
  }

  async search(websiteId: string, query: string, opts: { limit?: number; locale?: string } = {}): Promise<SearchHit[]> {
    const site = this.docs.get(websiteId);
    const terms = tokenize(query);
    if (!site || !terms.length) return [];
    const all = [...site.values()].filter((d) => !opts.locale || !d.locale || d.locale === opts.locale);
    const avgLen = all.reduce((n, d) => n + d.tokens.length, 0) / Math.max(1, all.length);
    const k1 = 1.2;
    const b = 0.75;
    const hits: SearchHit[] = [];
    for (const d of all) {
      let score = 0;
      for (const term of terms) {
        const df = all.filter((x) => x.tokens.some((t) => t.startsWith(term)) || x.titleTokens.some((t) => t.startsWith(term))).length;
        if (!df) continue;
        const idf = Math.log(1 + (all.length - df + 0.5) / (df + 0.5));
        const tf = d.tokens.filter((t) => t.startsWith(term)).length;
        const titleTf = d.titleTokens.filter((t) => t.startsWith(term)).length;
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.tokens.length) / Math.max(1, avgLen))) + titleTf * 2);
      }
      if (score > 0) hits.push({ id: d.id, title: d.title, url: d.url, snippet: snippet(d.body, terms), score: Math.round(score * 1000) / 1000 });
    }
    return hits.sort((a, b2) => b2.score - a.score).slice(0, opts.limit ?? 10);
  }
}

export const simpleSearchDriver = defineDriver({
  kind: 'search',
  id: 'simple',
  name: 'Built-in (in-memory)',
  description: 'Lightweight in-process full-text search for small sites, previews and development.',
  configSchema: z.object({}),
  secretsSchema: z.object({}),
  create: (): SearchProvider => new SimpleSearchProvider(),
});
