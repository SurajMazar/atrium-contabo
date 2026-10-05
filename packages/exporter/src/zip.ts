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

/** Unzip into a path → Buffer map, ignoring directories, __MACOSX and unsafe paths. */
export async function unzip(buffer: Buffer | Uint8Array, limits: UnzipLimits = {}): Promise<Map<string, Buffer>> {
  const zip = await JSZip.loadAsync(buffer);
  const maxFiles = limits.maxFiles ?? 20_000;
  const maxBytes = limits.maxTotalBytes ?? 512 * 1024 * 1024;
  const out = new Map<string, Buffer>();
  let total = 0;
  const entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith('__MACOSX/') && !f.name.endsWith('.DS_Store'));
  if (entries.length > maxFiles) throw new Error(`Archive has too many files (${entries.length} > ${maxFiles})`);
  for (const entry of entries) {
    const safe = safeArchivePath(entry.name);
    if (!safe) continue;
    const data = await entry.async('nodebuffer');
    total += data.length;
    if (total > maxBytes) throw new Error('Archive exceeds the maximum uncompressed size');
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
