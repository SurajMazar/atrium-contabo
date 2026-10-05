import { KokoroTTS } from 'kokoro-js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SAMPLE_RATE = 24_000;
export const VOICE = 'af_heart'; // Kokoro American English female voice
const CACHE = path.resolve(import.meta.dirname, '../.cache/tts');

let tts: KokoroTTS | null = null;
async function engine() {
  tts ??= await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  return tts;
}

/** Normalize text for speech: expand symbols the model reads poorly. */
export function speakable(text: string): string {
  return text
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/\bCLI\b/g, 'C L I')
    .replace(/\bCMS\b/g, 'C M S')
    .replace(/\bSEO\b/g, 'S E O')
    .replace(/\bSMS\b/g, 'S M S')
    .replace(/\bRBAC\b/g, 'role-based access control')
    .replace(/\bMFA\b/g, 'M F A')
    .replace(/\bJSON\b/g, 'jason')
    .replace(/\bURL\b/g, 'U R L')
    .replace(/\bURLs\b/g, 'U R Ls')
    .replace(/\bCSS\b/g, 'C S S')
    .replace(/\bHTML\b/g, 'H T M L')
    .replace(/\bDNS\b/g, 'D N S')
    .replace(/\bSSL\b/g, 'S S L')
    .replace(/\bAWS\b/g, 'A W S')
    .replace(/\bGCP\b/g, 'G C P')
    .replace(/\bS3\b/g, 'S 3')
    .replace(/\bk8s\b/gi, 'Kubernetes')
    .replace(/\bpnpm\b/g, 'p n p m')
    .replace(/\bnpm\b/g, 'n p m')
    .replace(/\bcPanel\b/g, 'C panel')
    .replace(/\bGSAP\b/g, 'G sap')
    .replace(/\bUI\b/g, 'U I')
    .replace(/\bAI\b/g, 'A I')
    .replace(/\bSMTP\b/g, 'S M T P')
    .replace(/\bHMAC\b/g, 'H mac')
    .replace(/\bCSV\b/g, 'C S V')
    .replace(/\breCAPTCHA\b/g, 'ree-captcha')
    .replace(/→/g, ' to ')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Clip {
  samples: Float32Array;
  durationMs: number;
}

/** Synthesize (cached by text+voice) and return mono float PCM at 24 kHz. */
export async function say(text: string): Promise<Clip> {
  mkdirSync(CACHE, { recursive: true });
  const spoken = speakable(text);
  const file = path.join(CACHE, `${createHash('sha1').update(`${VOICE}|${spoken}`).digest('hex')}.f32`);
  let samples: Float32Array;
  if (existsSync(file)) {
    const buf = readFileSync(file);
    samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  } else {
    const audio = await (await engine()).generate(spoken, { voice: VOICE as never, speed: 1.0 });
    samples = audio.audio as Float32Array;
    writeFileSync(file, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  }
  return { samples, durationMs: (samples.length / SAMPLE_RATE) * 1000 };
}

/** Write a 16-bit PCM mono WAV. */
export function writeWav(file: string, samples: Float32Array) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-1, Math.min(1, samples[i]!)) * 0x7fff, i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}
