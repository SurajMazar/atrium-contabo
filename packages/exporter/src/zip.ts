import JSZip from 'jszip';

export type FileContent = string | Buffer | Uint8Array;
export type FileMap = Map<string, FileContent> | Record<string, FileContent>;

export function entriesOf(files: FileMap): Array<[string, FileContent]> {
  return files instanceof Map ? [...files.entries()] : Object.entries(files);
}

/** Normalize an archive path; rejects absolute paths and `..` segments (zip-slip). */
export function safeArchivePath(path: string): string | undefined {
  const p = path.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return undefined;
  const parts = p.split('/');
  if (parts.some((s) => s === '..')) return undefined;
  return parts.filter((s) => s && s !== '.').join('/');
}

export async function zipFiles(files: FileMap, opts: { compressionLevel?: number; rootDir?: string } = {}): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of entriesOf(files)) {
    const safe = safeArchivePath(path);
    if (!safe) throw new Error(`Refusing to zip unsafe path "${path}"`);
    zip.file(opts.rootDir ? `${opts.rootDir.replace(/\/+$/, '')}/${safe}` : safe, content, { createFolders: false, date: new Date('2026-01-01T00:00:00Z') });
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: opts.compressionLevel ?? 6 }, platform: 'UNIX' });
}

export interface UnzipLimits {
  /** Max number of files (default 20k). */
  maxFiles?: number;
  /** Max total uncompressed bytes (default 512 MiB). */
  maxTotalBytes?: number;
  /** Strip a single common top-level directory (e.g. `my-site/…`). Default true. */
  stripCommonRoot?: boolean;
}

/**
 * Entry count from the end-of-central-directory record, read before JSZip parses anything, so an
 * archive declaring millions of entries is refused without building them all in memory.
 * Returns undefined when the record is missing or uses ZIP64 (JSZip then validates).
 */
function declaredEntryCount(buf: Uint8Array): number | undefined {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      const total = buf[i + 10]! | (buf[i + 11]! << 8);
      return total === 0xffff ? undefined : total;
    }
  }
  return undefined;
}

interface StreamHelper {
  on(event: 'data', cb: (chunk: Buffer) => void): StreamHelper;
  on(event: 'error', cb: (err: Error) => void): StreamHelper;
  on(event: 'end', cb: () => void): StreamHelper;
  pause(): StreamHelper;
  resume(): StreamHelper;
}
/** JSZip's typings omit `internalStream` (public API since 3.x) and the parsed sizes. */
type ZipEntry = JSZip.JSZipObject & { _data?: { uncompressedSize?: number }; internalStream(type: 'nodebuffer'): StreamHelper };

/** Inflate one entry, aborting as soon as it would exceed `budget` bytes (declared sizes can lie). */
function inflateLimited(entry: ZipEntry, budget: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const stream = entry.internalStream('nodebuffer');
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > budget) {
        settled = true;
        stream.pause();
        reject(new Error('Archive exceeds the maximum uncompressed size'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    stream.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, size));
    });
    stream.resume();
  });
}

/**
 * Unzip into a path → Buffer map, ignoring directories, __MACOSX and unsafe paths. Archives are
 * hostile: the entry count is checked before parsing, declared sizes before inflating, and every
 * entry is inflated as a stream against the remaining byte budget (zip bombs stop early).
 */
export async function unzip(buffer: Buffer | Uint8Array, limits: UnzipLimits = {}): Promise<Map<string, Buffer>> {
  const maxFiles = limits.maxFiles ?? 20_000;
  const maxBytes = limits.maxTotalBytes ?? 512 * 1024 * 1024;
  const declared = declaredEntryCount(buffer);
  if (declared !== undefined && declared > maxFiles * 2 + 100) throw new Error(`Archive has too many entries (${declared})`);
  const zip = await JSZip.loadAsync(buffer);
  const out = new Map<string, Buffer>();
  let total = 0;
  const entries = (Object.values(zip.files) as ZipEntry[]).filter((f) => !f.dir && !f.name.startsWith('__MACOSX/') && !f.name.endsWith('.DS_Store'));
  if (entries.length > maxFiles) throw new Error(`Archive has too many files (${entries.length} > ${maxFiles})`);
  const declaredBytes = entries.reduce((n, e) => n + (e._data?.uncompressedSize ?? 0), 0);
  if (declaredBytes > maxBytes) throw new Error('Archive exceeds the maximum uncompressed size');
  for (const entry of entries) {
    const safe = safeArchivePath(entry.name);
    if (!safe) continue;
    const data = await inflateLimited(entry, maxBytes - total);
    total += data.length;
    out.set(safe, data);
  }
  if (limits.stripCommonRoot !== false && out.size) {
    const roots = new Set([...out.keys()].map((k) => (k.includes('/') ? k.split('/')[0] : '')));
    const [root] = [...roots];
    if (roots.size === 1 && root) {
      const stripped = new Map<string, Buffer>();
      for (const [k, v] of out) stripped.set(k.slice(root.length + 1), v);
      return stripped;
    }
  }
  return out;
}

export function isZip(buffer: Buffer | Uint8Array): boolean {
  return buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05) && (buffer[3] === 0x04 || buffer[3] === 0x06);
}
