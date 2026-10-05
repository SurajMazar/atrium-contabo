import { Injectable } from '@nestjs/common';
import * as exporterLib from '@atrium/exporter';
import type { WebsiteDefinition, WebsiteInput } from '@atrium/schema';
import path from 'node:path';
import { badRequest, notConfigured } from '../../common/errors';
import { apiPublicBase } from './websites.service';

type Files = Map<string, Buffer | string> | Record<string, Buffer | string>;
interface ExporterLib {
  buildSiteBundle?(definition: WebsiteDefinition, opts?: Record<string, unknown>): Files | Promise<Files>;
  parseSiteBundle?(files: Files): WebsiteInput | WebsiteDefinition | Promise<WebsiteInput | WebsiteDefinition>;
  zipFiles?(files: Files): Buffer | Uint8Array | Promise<Buffer | Uint8Array>;
  unzip?(buf: Buffer): Files | Promise<Files>;
  buildNextProject?(opts: { snapshot: unknown; repoRoot: string; env?: Record<string, string> }): Files | Promise<Files>;
}
const lib = exporterLib as unknown as ExporterLib;

const repoRoot = () => process.env.ATRIUM_REPO_ROOT ?? path.resolve(__dirname, '../../../../..');

/** Thin adapter over @atrium/exporter (site bundles, zips, standalone Next.js projects). */
@Injectable()
export class ExportService {
  async json(def: WebsiteDefinition) {
    return Buffer.from(JSON.stringify(def, null, 2));
  }

  async zip(def: WebsiteDefinition) {
    if (!lib.buildSiteBundle || !lib.zipFiles) throw notConfigured('Bundle export is unavailable');
    return Buffer.from(await lib.zipFiles(await lib.buildSiteBundle(def)));
  }

  async nextProject(snapshot: { websiteId: string; definition: WebsiteDefinition } & Record<string, unknown>) {
    if (!lib.buildNextProject || !lib.zipFiles) throw notConfigured('Next.js export is unavailable');
    const files = await lib.buildNextProject({ snapshot: { apiBaseUrl: apiPublicBase(), ...snapshot }, repoRoot: repoRoot() });
    return Buffer.from(await lib.zipFiles(files));
  }

  /** Parse an uploaded .json or .zip export into website input. */
  async parseUpload(buf: Buffer, filename: string, resolveAssets?: (files: Map<string, Buffer>) => Promise<Map<string, Buffer>>): Promise<unknown> {
    if (/\.zip$/i.test(filename) || buf.subarray(0, 2).toString() === 'PK') {
      if (!lib.unzip || !lib.parseSiteBundle) throw notConfigured('Zip import is unavailable');
      let files: Map<string, Buffer>;
      try {
        files = (await (lib.unzip as (b: Buffer, limits?: object) => Promise<Map<string, Buffer>>)(buf, { maxFiles: 2000, maxTotalBytes: 400 * 1024 * 1024 })) as Map<string, Buffer>;
      } catch (err) {
        throw badRequest(`This archive could not be read: ${(err as Error).message}`);
      }
      // Bundled media (assets/…) is uploaded and its `asset:` references rewritten before validation.
      if (resolveAssets && [...files.keys()].some((k) => k.startsWith('assets/'))) files = await resolveAssets(files);
      return lib.parseSiteBundle(files);
    }
    try {
      return JSON.parse(buf.toString('utf8'));
    } catch {
      throw badRequest('This file is not valid JSON');
    }
  }
}
