import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { unzip, zipFiles } from '../src/zip';

/** Archives are hostile: zip bombs and entry floods must fail fast, without inflating everything. */
describe('unzip limits', () => {
  it('stops inflating a zip bomb at the byte budget', async () => {
    // 64 MB of zeros compresses to ~64 KB; allow only 1 MB.
    const bomb = await zipFiles({ 'pages/_home.json': Buffer.alloc(64 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const t0 = Date.now();
    await expect(unzip(bomb, { maxTotalBytes: 1024 * 1024 })).rejects.toThrow(/maximum uncompressed size/);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it('refuses when the sizes an archive declares exceed the budget', async () => {
    const zip = new JSZip();
    zip.file('a.json', Buffer.alloc(2 * 1024 * 1024));
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await expect(unzip(buf, { maxTotalBytes: 1024 * 1024 })).rejects.toThrow(/maximum uncompressed size/);
  });

  it('refuses archives with too many entries', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 60; i++) files[`f${i}.txt`] = 'x';
    await expect(unzip(await zipFiles(files), { maxFiles: 10 })).rejects.toThrow(/too many/);
  });

  it('still unpacks ordinary archives', async () => {
    const zip = new JSZip();
    zip.file('site.json', '{"a":1}');
    zip.file('pages/about.json', '{}');
    const out = await unzip(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    expect([...out.keys()].sort()).toEqual(['pages/about.json', 'site.json']);
    expect(out.get('site.json')!.toString()).toBe('{"a":1}');
  });
});
