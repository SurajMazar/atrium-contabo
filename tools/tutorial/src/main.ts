import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { finalize, renderScene, type SceneRender } from './assemble';
import { Director, type Scene } from './director';
import { SCENES } from './scenes/index';
import { say } from './tts';
import { prepareAdminSession } from './session';

const OUT = path.resolve(import.meta.dirname, '../out');
const SCENE_DIR = path.join(OUT, 'scenes');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const only = args.get('only')?.split(',');
const force = args.has('force');

async function main() {
  mkdirSync(SCENE_DIR, { recursive: true });
  const scenes = SCENES.filter((s) => !only || only.includes(s.id));
  console.log(`Atrium tutorial — ${scenes.length} scenes`);

  console.log('1/3 Synthesizing narration (Kokoro, voice af_heart)…');
  const texts = scenes.flatMap((s) => s.steps.map((st) => st.say));
  let i = 0;
  for (const t of texts) {
    await say(t);
    if (++i % 10 === 0) console.log(`    ${i}/${texts.length}`);
  }

  console.log('2/3 Recording scenes (Playwright, 1920×1080)…');
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--hide-scrollbars', '--font-render-hinting=none'] });
  const storage = scenes.some((s) => s.storage === 'admin') ? await prepareAdminSession(browser) : undefined;
  for (const scene of scenes) {
    const mp4 = path.join(SCENE_DIR, `${scene.id}.mp4`);
    const metaFile = `${mp4}.json`;
    if (!force && !only && existsSync(mp4) && existsSync(metaFile)) {
      console.log(`    ✓ ${scene.id} (cached)`);
      continue;
    }
    const t = Date.now();
    const d = new Director(scene);
    await d.start(browser, { storageState: scene.storage === 'admin' ? storage : undefined, videoDir: path.join(OUT, 'raw') });
    try {
      await scene.setup?.(d);
      for (const step of scene.steps) await d.step(step);
    } catch (err) {
      console.error(`    ✗ ${scene.id}: ${(err as Error).message}`);
    }
    const raw = await d.finish();
    const render = renderScene({ video: raw, timeline: d.timeline, trimMs: Math.max(0, d.firstStepMs - 350), out: mp4 });
    rmSync(raw, { force: true });
    writeFileSync(metaFile, JSON.stringify(render));
    console.log(`    ✓ ${scene.id} — ${(render.durationMs / 1000).toFixed(1)}s (recorded in ${((Date.now() - t) / 1000).toFixed(0)}s)`);
  }
  await browser.close();

  console.log('3/3 Assembling final video (ffmpeg)…');
  const all = SCENES.filter((s) => existsSync(path.join(SCENE_DIR, `${s.id}.mp4.json`))).map((s) => ({
    ...(JSON.parse(readFileSync(path.join(SCENE_DIR, `${s.id}.mp4.json`), 'utf8')) as SceneRender),
    chapter: s.chapter,
    title: s.title,
  }));
  const out = path.join(OUT, 'atrium-tutorial.mp4');
  const res = finalize({ scenes: all, outDir: OUT, out, title: 'Atrium — complete tutorial' });
  console.log(`\nDone: ${out}\nLength ${(res.durationMs / 60000).toFixed(1)} min · subtitles ${res.srtFile}\nChapters:\n${res.chaptersTxt}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
