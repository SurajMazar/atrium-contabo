import { Injectable } from '@nestjs/common';
import path from 'node:path';
import type { AuthUser } from '../../common/decorators';
import { ApiError, validation } from '../../common/errors';
import { MediaService } from '../media/media.service';

/** Bundled media: `assets/<path>` files in a site zip, referenced from the definition as `asset:<path>`. */
export const ASSET_PREFIX = 'asset:';
const MAX_ASSETS = 500;

type Json = unknown;

interface Uploaded {
  url: string;
  id: string;
  width: number | null;
  height: number | null;
  mimeType: string;
}

/** Every `asset:` reference in a JSON value. */
export function collectAssetRefs(value: Json, into = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (value.startsWith(ASSET_PREFIX)) into.add(value.slice(ASSET_PREFIX.length));
  } else if (Array.isArray(value)) value.forEach((v) => collectAssetRefs(v, into));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectAssetRefs(v, into));
  return into;
}

/**
 * Replace `asset:` references with uploaded media: media objects (`{ src: 'asset:…' }`) also get
 * `mediaId` (responsive variants) and dimensions; any other `asset:` string becomes the media URL.
 */
export function rewriteAssetRefs(value: Json, resolved: Map<string, Uploaded>): Json {
  const url = (s: string) => resolved.get(s.slice(ASSET_PREFIX.length))?.url ?? s;
  if (typeof value === 'string') return value.startsWith(ASSET_PREFIX) ? url(value) : value;
  if (Array.isArray(value)) return value.map((v) => rewriteAssetRefs(v, resolved));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, Json>;
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = rewriteAssetRefs(v, resolved);
    const src = obj.src;
    if (typeof src === 'string' && src.startsWith(ASSET_PREFIX)) {
      const m = resolved.get(src.slice(ASSET_PREFIX.length));
      if (m) {
        out.mediaId ??= m.id;
        if (m.width && obj.width === undefined) out.width = m.width;
        if (m.height && obj.height === undefined) out.height = m.height;
        out.mimeType ??= m.mimeType;
      }
    }
    return out;
  }
  return value;
}

/**
 * Site bundles may carry their own media. Referenced assets are uploaded into the organization's
 * media library (same type detection, SVG sanitizing and storage limits as manual uploads; files
 * already in the library are reused) and the JSON files are rewritten to point at them before the
 * bundle is validated.
 */
@Injectable()
export class BundleAssetsService {
  constructor(private readonly media: MediaService) {}

  async resolve(orgId: string, files: Map<string, Buffer>, user: AuthUser): Promise<{ files: Map<string, Buffer>; uploaded: number }> {
    const jsonFiles = [...files.keys()].filter((k) => k.endsWith('.json') && !k.startsWith('assets/'));
    const parsed = new Map<string, Json>();
    const refs = new Set<string>();
    for (const name of jsonFiles) {
      let value: Json;
      try {
        value = JSON.parse(files.get(name)!.toString('utf8'));
      } catch {
        continue; // the bundle parser reports malformed JSON with a proper message
      }
      parsed.set(name, value);
      collectAssetRefs(value, refs);
    }
    if (!refs.size) return { files, uploaded: 0 };
    if (refs.size > MAX_ASSETS) throw validation(`Bundles may reference at most ${MAX_ASSETS} assets (found ${refs.size})`);
    const missing = [...refs].filter((r) => !files.has(`assets/${r}`));
    if (missing.length) throw validation('The bundle references assets that are not included', missing.slice(0, 20).map((m) => ({ path: `assets/${m}`, message: 'Missing file' })));

    const resolved = new Map<string, Uploaded>();
    for (const ref of refs) {
      const buffer = files.get(`assets/${ref}`)!;
      const file = { originalname: path.posix.basename(ref), mimetype: 'application/octet-stream', size: buffer.length, buffer };
      let dto: { url: string; id: string; width: number | null; height: number | null; mimeType: string };
      try {
        dto = await this.media.upload(orgId, file, {}, user);
      } catch (err) {
        // Identical file already in the library: reuse it.
        const dup = err instanceof ApiError ? (err.details as { duplicateOf?: typeof dto } | undefined)?.duplicateOf : undefined;
        if (!dup) {
          if (err instanceof ApiError) throw validation(`Asset "${ref}": ${(err.getResponse() as { error?: { message?: string } }).error?.message ?? err.message}`);
          throw err;
        }
        dto = dup;
      }
      resolved.set(ref, { url: dto.url, id: dto.id, width: dto.width, height: dto.height, mimeType: dto.mimeType });
    }

    const out = new Map(files);
    for (const [name, value] of parsed) out.set(name, Buffer.from(JSON.stringify(rewriteAssetRefs(value, resolved))));
    for (const key of files.keys()) if (key.startsWith('assets/')) out.delete(key);
    return { files: out, uploaded: resolved.size };
  }
}
