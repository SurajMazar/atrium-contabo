import sanitizeHtml from 'sanitize-html';
import { validation } from './errors';

/**
 * Upload type detection. The client's Content-Type and filename are never
 * trusted: the stored MIME type and extension come from the file's bytes.
 */
export interface DetectedType {
  mime: string;
  ext: string;
}

const ascii = (buf: Buffer, start: number, end: number) => buf.toString('latin1', start, Math.min(end, buf.length));

/** Detect a file type from its signature. Returns null when unknown. */
export function sniffType(buf: Buffer): DetectedType | null {
  if (buf.length < 4) return isText(buf) ? { mime: 'text/plain', ext: 'txt' } : null;
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', ext: 'avif' };
    if (brand === 'qt  ') return { mime: 'video/quicktime', ext: 'mov' };
    if (/^(isom|iso2|iso5|iso6|mp41|mp42|avc1|dash|M4V |MSNV|3gp)/.test(brand)) return { mime: 'video/mp4', ext: 'mp4' };
    return null; // heic and other containers are not accepted
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'video/webm', ext: 'webm' };
  if (ascii(b, 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (ascii(b, 0, 4) === 'wOFF') return { mime: 'font/woff', ext: 'woff' };
  if (ascii(b, 0, 4) === 'wOF2') return { mime: 'font/woff2', ext: 'woff2' };
  if (ascii(b, 0, 4) === 'OTTO') return { mime: 'font/otf', ext: 'otf' };
  if ((b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) || ascii(b, 0, 4) === 'true') return { mime: 'font/ttf', ext: 'ttf' };
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return { mime: 'application/zip', ext: 'zip' };
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return { mime: 'application/x-ole-storage', ext: 'bin' };
  if (isText(b)) {
    const head = b.toString('utf8', 0, Math.min(b.length, 4096)).replace(/^﻿/, '').trimStart();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return { mime: 'image/svg+xml', ext: 'svg' };
    return { mime: 'text/plain', ext: 'txt' };
  }
  return null;
}

function isText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  if (sample.includes(0)) return false;
  // Valid UTF-8 round-trip (allowing a truncated trailing sequence in the sample).
  const s = sample.toString('utf8');
  return !s.slice(0, -4).includes('�');
}

const OFFICE_EXT: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
};

/** Types the media library accepts, after detection. */
export const MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf', 'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
  'text/plain', 'text/csv', 'application/zip', ...Object.values(OFFICE_EXT),
]);

/**
 * Resolve the type to store for an upload, or throw. Container formats (zip/OLE)
 * are mapped to Office types by the declared extension, which is safe because
 * the bytes are a container either way and are always served as downloads.
 */
export function resolveUploadType(buf: Buffer, filename: string, allowed: ReadonlySet<string> = MEDIA_TYPES): DetectedType {
  const detected = sniffType(buf);
  if (!detected) throw validation('This file type is not supported');
  const ext = (filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? '').trim();
  let out = detected;
  if (detected.mime === 'application/zip' && ['docx', 'xlsx', 'pptx'].includes(ext)) out = { mime: OFFICE_EXT[ext]!, ext };
  else if (detected.mime === 'application/x-ole-storage' && ['doc', 'xls'].includes(ext)) out = { mime: OFFICE_EXT[ext]!, ext };
  else if (detected.mime === 'text/plain' && ext === 'csv') out = { mime: 'text/csv', ext: 'csv' };
  if (!allowed.has(out.mime)) throw validation('This file type is not supported');
  return out;
}

/** Types that may be displayed inline by browsers. Everything else is served as a download. */
export const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf', 'font/woff', 'font/woff2', 'font/ttf', 'font/otf']);

/** Safe storage filename: random prefix + slug of the original name + the DETECTED extension. */
export function safeFilenameStem(filename: string): string {
  return (
    filename
      .toLowerCase()
      .replace(/\.[a-z0-9]{1,8}$/, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(-60) || 'file'
  );
}

// ── SVG ──
const SVG_TAGS = [
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'metadata', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'marker', 'image',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
];
const SVG_ATTRS = [
  'id', 'class', 'style', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'd', 'points',
  'transform', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'clip-path', 'mask', 'filter', 'opacity', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'stop-color', 'stop-opacity', 'offset',
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform', 'preserveAspectRatio',
  'xmlns', 'xmlns:xlink', 'version', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing',
  'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust', 'visibility', 'display', 'color', 'vector-effect', 'shape-rendering', 'paint-order',
  'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'filterUnits',
  'primitiveUnits', 'in', 'in2', 'result', 'stdDeviation', 'mode', 'values', 'type', 'operator', 'k1', 'k2', 'k3', 'k4', 'radius', 'scale',
  'xChannelSelector', 'yChannelSelector', 'baseFrequency', 'numOctaves', 'seed', 'stitchTiles', 'flood-color', 'flood-opacity',
  'href', 'xlink:href', 'aria-hidden', 'aria-label', 'role', 'focusable', 'enable-background', 'xml:space',
];

/** CSS inside an SVG may not load anything external or break out of its element. */
function cleanSvgCss(css: string): string {
  return css
    .replace(/</g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, 'none')
    .replace(/(?:java|vb)script\s*:/gi, '');
}

/** Only same-document fragment references (#id) and embedded raster data are allowed as links. */
function safeSvgRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^#[\w.-]+$/.test(v)) return v;
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(v)) return v;
  return undefined;
}

/**
 * Allowlist sanitizer for uploaded SVGs (parser-based, not regex stripping):
 * no scripts, event handlers, foreignObject, animation of attributes, external
 * references or links. The result is also always served with a sandboxing CSP.
 */
export function sanitizeSvg(svg: string): string {
  const out = sanitizeHtml(svg, {
    allowedTags: SVG_TAGS,
    allowedAttributes: { '*': SVG_ATTRS },
    allowedSchemes: [],
    allowedSchemesAppliedToAttributes: [],
    allowVulnerableTags: true, // <style> is allowed but its text is filtered below
    parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false, recognizeSelfClosing: true },
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'foreignObject', 'iframe'],
    transformTags: {
      '*': (tagName, attribs) => {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(attribs)) {
          if (/^on/i.test(k)) continue;
          if (k === 'href' || k === 'xlink:href') {
            const ref = safeSvgRef(v);
            if (ref) next[k] = ref;
            continue;
          }
          if (k === 'style') {
            next[k] = cleanSvgCss(v);
            continue;
          }
          if (/(?:java|vb)script\s*:|data\s*:(?!image\/)/i.test(v)) continue;
          next[k] = v;
        }
        return { tagName, attribs: next };
      },
    },
  });
  if (!/<svg[\s>]/.test(out)) throw validation('This SVG could not be processed');
  // sanitize-html passes <style> contents through verbatim; filter them on the (well-formed) output.
  return out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => `${open}${cleanSvgCss(css)}${close}`).trim();
}
