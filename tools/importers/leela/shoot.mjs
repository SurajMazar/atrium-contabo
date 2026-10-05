// Full-page screenshots of a site at desktop + mobile, for fidelity comparison.
// Usage: node shoot.mjs <baseUrl> <outDir> [pages=comma list] [--motion]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(new URL('../../tutorial/package.json', import.meta.url));
const { chromium } = require('playwright');

let [base, outDir, pagesArg, ...flags] = process.argv.slice(2);
if (base.startsWith('atrium:')) {
  const st = JSON.parse(fs.readFileSync(new URL('./out/imports.json', import.meta.url), 'utf8'))[base.slice(7)];
  base = `http://localhost:3001/_site/${st.slug}`;
}
const pages = (pagesArg && !pagesArg.startsWith('--') ? pagesArg : 'home,about,venue,weddings,events,packages,gallery,contact').split(',');
const motion = flags.includes('--motion') || pagesArg === '--motion';
const only = (flags.find((f) => f.startsWith('--vp=')) ?? '').slice(5);
fs.mkdirSync(outDir, { recursive: true });
const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
].filter((v) => !only || v.name === only);

const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.isMobile, hasTouch: vp.isMobile, reducedMotion: motion ? 'no-preference' : 'reduce' });
  for (const p of pages) {
    const page = await ctx.newPage();
    const url = `${base.replace(/\/$/, '')}${p === 'home' ? '' : `/${p}`}`;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    } catch (e) { console.warn('goto', url, e.message); }
    await page.waitForTimeout(1500);
    // scroll through to trigger lazy images / reveals
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += Math.round(vp.height * 0.7)) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(motion ? 350 : 120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(motion ? 2500 : 800);
    await page.evaluate(async () => { await Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))); });
    const file = path.join(outDir, `${p}-${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('saved', file);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
