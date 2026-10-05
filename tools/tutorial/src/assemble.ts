import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { TimelineEntry } from './director';
import { SAMPLE_RATE, writeWav } from './tts';

const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

export function probeDuration(file: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim()) * 1000;
}

export interface SceneRender {
  file: string;
  durationMs: number;
  captions: Array<{ startMs: number; endMs: number; text: string }>;
}

/** Mux one scene: trim the un-narrated setup, lay narration clips on a timeline, encode H.264/AAC. */
export function renderScene(opts: { video: string; timeline: TimelineEntry[]; trimMs: number; out: string; tailMs?: number }): SceneRender {
  const videoMs = probeDuration(opts.video);
  const lengthMs = Math.max(500, videoMs - opts.trimMs);
  const total = new Float32Array(Math.ceil(((lengthMs + 500) / 1000) * SAMPLE_RATE));
  const captions: SceneRender['captions'] = [];
  for (const e of opts.timeline) {
    const at = Math.round(((e.startMs - opts.trimMs) / 1000) * SAMPLE_RATE);
    if (at < 0) continue;
    total.set(e.clip.samples.subarray(0, Math.max(0, total.length - at)), at);
    captions.push({ startMs: e.startMs - opts.trimMs, endMs: e.startMs - opts.trimMs + e.clip.durationMs, text: e.text });
  }
  const wav = opts.out.replace(/\.mp4$/, '.wav');
  writeWav(wav, total);
  ff([
    '-ss', (opts.trimMs / 1000).toFixed(3), '-i', opts.video, '-i', wav,
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-profile:v', 'high',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-t', (lengthMs / 1000).toFixed(3), '-movflags', '+faststart', opts.out,
  ]);
  rmSync(wav, { force: true });
  return { file: opts.out, durationMs: probeDuration(opts.out), captions };
}

const srtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000), m = Math.floor((t % 3_600_000) / 60_000), s = Math.floor((t % 60_000) / 1000), f = t % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(f).padStart(3, '0')}`;
};

/** Concatenate scenes, add chapter markers and a soft subtitle track. */
export function finalize(opts: { scenes: Array<SceneRender & { chapter: string; title: string }>; outDir: string; out: string; title: string }) {
  const list = path.join(opts.outDir, 'concat.txt');
  writeFileSync(list, opts.scenes.map((s) => `file '${s.file.replace(/'/g, "'\\''")}'`).join('\n'));
  const joined = path.join(opts.outDir, 'joined.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

  let offset = 0;
  let srt = '';
  let n = 1;
  let meta = `;FFMETADATA1\ntitle=${opts.title}\nartist=Atrium\n`;
  let lastChapter = '';
  const chapterStarts: Array<{ start: number; title: string }> = [];
  for (const s of opts.scenes) {
    if (s.chapter !== lastChapter) {
      chapterStarts.push({ start: offset, title: `${s.chapter}` });
      lastChapter = s.chapter;
    }
    for (const c of s.captions) srt += `${n++}\n${srtTime(offset + c.startMs)} --> ${srtTime(offset + c.endMs)}\n${c.text}\n\n`;
    offset += s.durationMs;
  }
  chapterStarts.forEach((c, i) => {
    const end = chapterStarts[i + 1]?.start ?? offset;
    meta += `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start)}\nEND=${Math.round(end)}\ntitle=${c.title}\n`;
  });
  const srtFile = opts.out.replace(/\.mp4$/, '.srt');
  const metaFile = path.join(opts.outDir, 'chapters.txt');
  writeFileSync(srtFile, srt);
  writeFileSync(metaFile, meta);
  ff(['-i', joined, '-i', metaFile, '-i', srtFile, '-map', '0', '-map', '2', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', opts.out]);
  rmSync(joined, { force: true });
  rmSync(list, { force: true });
  const chaptersTxt = chapterStarts.map((c) => `${srtTime(c.start).slice(0, 8)}  ${c.title}`).join('\n');
  writeFileSync(opts.out.replace(/\.mp4$/, '.chapters.txt'), `${chaptersTxt}\n`);
  return { durationMs: offset, srtFile, chaptersTxt };
}
