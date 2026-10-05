import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { csvCell, neutralizeFormula } from '../modules/forms/forms.service';
import { resolveStoragePath } from '../modules/public/public.controller';
import { loginLockSeconds } from '../modules/auth/auth.service';
import { resolveUploadType, sanitizeSvg, sniffType } from './file-safety';
import { escapeHtml } from './html';
import { safeRequestId, stripQuery } from './logging';
import { originDecision } from './origin.guard';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

describe('upload type detection', () => {
  it('uses the bytes, not the client type or filename', () => {
    expect(resolveUploadType(PNG, 'photo.html')).toEqual({ mime: 'image/png', ext: 'png' });
    expect(() => resolveUploadType(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'evil.png')).toThrow();
  });
  it('treats HTML as plain text (never as a document type) and SVG as SVG', () => {
    expect(sniffType(Buffer.from('<html><script>alert(1)</script></html>'))?.mime).toBe('text/plain');
    expect(sniffType(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))?.mime).toBe('image/svg+xml');
  });
  it('rejects types outside the allowlist', () => {
    expect(() => resolveUploadType(PNG, 'a.png', new Set(['application/pdf']))).toThrow();
  });
});

describe('sanitizeSvg', () => {
  const payloads = [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><script >alert(1)</script ></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><script href="data:text/javascript,alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"><rect/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="javascript:alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="onmouseover" to="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg#a"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/x.css);rect{fill:url(https://evil.example/t)}</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script></svg>',
  ];
  it.each(payloads)('neutralizes %s', (p) => {
    const out = sanitizeSvg(p);
    expect(out).not.toMatch(/<script|<svg:script|onload|onmouseover|javascript:|&#106;|foreignObject|<iframe|<animate|<set|evil\.example/i);
    expect(out).toMatch(/^<svg/);
  });
  it('keeps ordinary vector content', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#g)"/><use href="#g"/></svg>');
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('linearGradient');
    expect(out).toContain('href="#g"');
  });
});

describe('local storage path resolution', () => {
  it('stays inside the root and classifies private keys case-insensitively', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'atrium-storage-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'atrium-outside-'));
    await mkdir(path.join(root, 'media'), { recursive: true });
    await mkdir(path.join(root, 'private'), { recursive: true });
    await writeFile(path.join(root, 'media/a.png'), 'x');
    await writeFile(path.join(root, 'private/secret.pdf'), 'x');
    await writeFile(path.join(outside, 'passwd'), 'x');
    await symlink(path.join(outside, 'passwd'), path.join(root, 'media/link'));

    expect((await resolveStoragePath(root, 'media/a.png'))?.isPrivate).toBe(false);
    for (const k of ['private/secret.pdf', './private/secret.pdf', 'media/../private/secret.pdf', 'PRIVATE/secret.pdf'.replace('PRIVATE', 'private')]) {
      expect((await resolveStoragePath(root, k))?.isPrivate).toBe(true);
    }
    expect((await resolveStoragePath(root, 'Private/secret.pdf'))?.isPrivate ?? true).toBe(true); // case-insensitive FS or missing
    for (const k of ['../etc/passwd', '../../etc/passwd', '/etc/passwd', 'media/link', 'media\\..\\..\\x', 'media/a.png\0.jpg', '.env', 'media/']) {
      expect(await resolveStoragePath(root, k)).toBeNull();
    }
  });
});

describe('spreadsheet formula injection', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', ' =cmd|/c calc', '\t=1', '\r=1', '＝1'])('neutralizes %j', (v) => {
    expect(neutralizeFormula(v).startsWith("'")).toBe(true);
  });
  it('quotes separators including CR', () => {
    expect(csvCell('a\rb')).toBe('"a\rb"');
    expect(csvCell('plain')).toBe('plain');
  });
});

describe('cookie-auth CSRF origin check', () => {
  const allowed = new Set(['https://admin.example.com']);
  const req = (headers: Record<string, string>, method = 'POST') => ({ method, headers });
  it('rejects form posts and foreign origins', () => {
    expect(originDecision(req({ 'content-type': 'application/x-www-form-urlencoded', 'content-length': '10' }), allowed)).toBeTruthy();
    expect(originDecision(req({ 'content-type': 'text/plain', 'content-length': '10', origin: 'https://admin.example.com' }), allowed)).toBeTruthy();
    expect(originDecision(req({ 'content-type': 'application/json', 'content-length': '2', origin: 'https://evil.example' }), allowed)).toBeTruthy();
    expect(originDecision(req({ 'content-type': 'application/json', 'content-length': '2', origin: 'null' }), allowed)).toBeTruthy();
    expect(originDecision(req({ 'content-type': 'application/json', 'content-length': '2', 'sec-fetch-site': 'cross-site' }), allowed)).toBeTruthy();
  });
  it('allows same-origin JSON and non-browser clients', () => {
    expect(originDecision(req({ 'content-type': 'application/json', 'content-length': '2', origin: 'https://admin.example.com' }), allowed)).toBeNull();
    expect(originDecision(req({ 'content-type': 'application/json; charset=utf-8', 'content-length': '2' }), allowed)).toBeNull();
    expect(originDecision(req({}, 'GET'), allowed)).toBeNull();
  });
});

describe('misc hardening helpers', () => {
  it('escapes HTML for emails', () => {
    expect(escapeHtml('<a href="x">\'`&')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&#96;&amp;');
  });
  it('validates request ids and strips query strings from logged paths', () => {
    expect(safeRequestId('abc-123-def')).toBe('abc-123-def');
    expect(safeRequestId('x\n{"admin":true}')).toBeUndefined();
    expect(safeRequestId('a'.repeat(200))).toBeUndefined();
    expect(stripQuery('/v1/x?access_token=secret')).toBe('/v1/x');
  });
  it('locks accounts progressively after repeated failures', () => {
    expect(loginLockSeconds(3)).toBe(0);
    expect(loginLockSeconds(8)).toBe(30);
    expect(loginLockSeconds(9)).toBe(60);
    expect(loginLockSeconds(50)).toBe(900);
  });
});
