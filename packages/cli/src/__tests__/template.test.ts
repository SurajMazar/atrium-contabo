import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TemplateError, renderDir, renderTemplate, toCamel, toKebab, toPascal, toTitle } from '../lib/template';

describe('renderTemplate', () => {
  it('substitutes variables and blocks', () => {
    const out = renderTemplate('Hi {{ name }}!{{#if pro}} PRO{{/if}}{{#unless pro}} free{{/unless}}', { name: 'Ada', pro: true });
    expect(out).toBe('Hi Ada! PRO');
    expect(renderTemplate('{{#if x}}a{{#if y}}b{{/if}}{{/if}}', { x: true, y: false })).toBe('a');
  });

  it('treats "false" and empty strings as falsy', () => {
    expect(renderTemplate('{{#if a}}x{{/if}}{{#if b}}y{{/if}}', { a: 'false', b: '' })).toBe('');
  });

  it('fails loudly on unknown variables', () => {
    expect(() => renderTemplate('{{ nope }}', {})).toThrow(TemplateError);
    expect(() => renderTemplate('{{#if nope}}x{{/if}}', {})).toThrow(TemplateError);
  });

  it('leaves GitHub Actions, compose and Caddy syntax alone', () => {
    const src = '${{ secrets.TOKEN }} ${POSTGRES_PASSWORD} {$ADMIN_HOST} {host}';
    expect(renderTemplate(src, {})).toBe(src);
  });
});

describe('renderDir', () => {
  it('renders .tpl files, copies others and expands __name__ paths', () => {
    const src = mkdtempSync(join(tmpdir(), 'tpl-src-'));
    const out = mkdtempSync(join(tmpdir(), 'tpl-out-'));
    mkdirSync(join(src, 'sub'));
    writeFileSync(join(src, '__name__.ts.tpl'), 'export const x = "{{name}}";');
    writeFileSync(join(src, 'sub', 'raw.txt'), '{{left}} alone');
    const files = renderDir(src, out, { name: 'demo' });
    expect(files.map((f) => f.rel).sort()).toEqual(['demo.ts', join('sub', 'raw.txt')].sort());
    expect(readFileSync(join(out, 'demo.ts'), 'utf8')).toBe('export const x = "demo";');
    expect(readFileSync(join(out, 'sub', 'raw.txt'), 'utf8')).toBe('{{left}} alone');
    // existing files are kept unless overwrite
    writeFileSync(join(out, 'demo.ts'), 'mine');
    expect(renderDir(src, out, { name: 'demo' }).find((f) => f.rel === 'demo.ts')?.skipped).toBe(true);
    expect(readFileSync(join(out, 'demo.ts'), 'utf8')).toBe('mine');
    renderDir(src, out, { name: 'demo' }, { overwrite: true });
    expect(readFileSync(join(out, 'demo.ts'), 'utf8')).toContain('demo');
    expect(existsSync(join(out, '__name__.ts'))).toBe(false);
  });
});

describe('name casing', () => {
  it('converts between styles', () => {
    expect(toKebab('PricingTable')).toBe('pricing-table');
    expect(toKebab('room card!')).toBe('room-card');
    expect(toPascal('pricing-table')).toBe('PricingTable');
    expect(toCamel('pricing-table')).toBe('pricingTable');
    expect(toTitle('pricing_table')).toBe('Pricing Table');
  });
});
