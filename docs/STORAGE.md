# Storage & media

Atrium stores every uploaded file — media library assets, generated image variants, private form
uploads, exports — through one provider-neutral interface. Business logic never imports an S3 or
Azure SDK; it asks the **ProviderResolver** for a `StorageProvider` and calls its methods.

```
API / worker ──► ProviderResolver.storage({ organizationId, providerId? })
                    │  explicit providerId → organization default → platform env
                    ▼
               StorageProvider  (local | s3 | azure-blob)
                    │
     upload · download · delete · move · copy · exists
     getPublicUrl · getSignedUrl · getUploadUrl · test
```

- Contract: `packages/providers/src/storage/types.ts`
- Drivers: `packages/providers/src/storage/{local,s3,azure}.ts`
- Resolution, secret decryption and caching: `packages/server-kit/src/providers.ts`
- Image pipeline: `apps/worker/src/processors/media.ts`

## Provider architecture

Each driver is declared with `defineDriver({ kind: 'storage', id, configSchema, secretsSchema, presets, create })`.

- **`config`** (JSON, visible in the admin) holds non-secret settings: bucket, region, endpoint, public URL.
- **`secrets`** (`secrets_enc`, AES-256-GCM encrypted with `ENCRYPTION_KEY`) hold credentials. They are
  write-only: the API returns masked values (`••••••••abcd`) and sending a masked value back keeps the
  stored secret (`mergeSecrets`).
- The admin renders the configuration form from the driver's JSON Schema (`describeDrivers('storage')`),
  including **presets** that pre-fill endpoint/region/path-style for common services.
- `test()` writes, reads back and deletes a probe object under `.atrium-probe/` and reports latency.

### Resolution order

1. An explicit `providerId` (a `StorageProvider` row of the same organization).
2. The organization's default storage provider (`is_default = true`, else the most recently updated).
3. The **platform storage** configured from environment variables (below).

Resolved instances are cached for 60 s per row + `updated_at`, so edits take effect immediately; call
`resolver.invalidate(id)` after deleting a provider.

### Object keys

| Purpose | Key | Visibility |
| --- | --- | --- |
| Media originals | `media/{organizationId}/{yyyy}/{mm}/{random}-{filename}` | public |
| Responsive variants | `{original key without extension}/w{width}.{webp\|avif}` | public, immutable |
| Form uploads | `private/submissions/{websiteId}/{yyyy-mm-dd}/{hash}-{filename}` | private (signed URLs) |
| Storage probes | `.atrium-probe/{random}.txt` | private, deleted immediately |

Keys are validated (`normalizeKey`): no leading slash, no `..`, `.` or empty segments, no control
characters. Every driver supports an optional `keyPrefix` so several environments can share a bucket.

## Platform storage (environment)

```dotenv
STORAGE_DRIVER=s3            # s3 | local | azure-blob
# S3-compatible
S3_ENDPOINT=http://localhost:59000
S3_PUBLIC_URL=http://localhost:59000/atrium-media
S3_REGION=us-east-1
S3_BUCKET=atrium-media
S3_ACCESS_KEY_ID=atrium
S3_SECRET_ACCESS_KEY=atrium-secret
S3_FORCE_PATH_STYLE=true
# local filesystem
LOCAL_STORAGE_DIR=./storage
LOCAL_STORAGE_PUBLIC_URL=http://localhost:4000/v1/storage
LOCAL_STORAGE_SIGNING_SECRET=        # optional; derived from ENCRYPTION_KEY when empty
# Azure
AZURE_STORAGE_ACCOUNT= AZURE_STORAGE_CONTAINER= AZURE_STORAGE_KEY=
```

Local development uses **SeaweedFS** (S3 gateway on `:59000`, bucket `atrium-media`, anonymous read
enabled) from `infra/compose.yaml`.

## Drivers

### `s3` — Amazon S3 and S3-compatible services

AWS SDK v3, loaded lazily. Uploads use `PutObject` (streams of unknown length are buffered), copy/move
use `CopyObject` (+ `DeleteObject`), signed URLs use the S3 presigner.

| Config | Description |
| --- | --- |
| `bucket` | Bucket name (required) |
| `region` | Region (`auto` for R2) |
| `endpoint` | Custom endpoint for non-AWS services; empty = AWS |
| `forcePathStyle` | `https://host/bucket/key` instead of `https://bucket.host/key` |
| `accessKeyId` | Access key id; empty = default AWS credential chain (IAM role / instance profile) |
| `publicUrl` | Public base URL (CDN, custom domain, bucket website) used by `getPublicUrl` |
| `usePublicAcl` | Send `public-read` on public uploads (only for buckets with ACLs enabled) |
| `serverSideEncryption` | `none`, `AES256`, `aws:kms` |
| `defaultCacheControl` | Default `public, max-age=31536000, immutable` (keys are content-unique) |
| `signedUrlTtlSeconds` | Default signed URL lifetime (3600) |

Secrets: `secretAccessKey`, optional `sessionToken`.

For custom endpoints the driver sets `requestChecksumCalculation: WHEN_REQUIRED`, because several
S3-compatible services reject the SDK's newer default integrity checksums.

**Public reads.** `getPublicUrl` returns `publicUrl/key` when set, otherwise the path-style or
virtual-hosted URL. Make public objects readable with a bucket policy (recommended), a CDN, or
`usePublicAcl`. Private objects (form uploads) are only reachable through signed URLs.

| Service | Preset | Endpoint | Region | Path style | Notes |
| --- | --- | --- | --- | --- | --- |
| Amazon S3 | `aws-s3` | — | your region | no | Block public ACLs; grant `s3:GetObject` on `media/*` via bucket policy or CloudFront OAC. |
| Cloudflare R2 | `cloudflare-r2` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | `auto` | yes | No ACLs; enable an `r2.dev` or custom domain and set `publicUrl`. |
| MinIO | `minio` | `http://minio:9000` | `us-east-1` | yes | `mc anonymous set download local/atrium-media/media`. |
| SeaweedFS | `seaweedfs` | `http://localhost:59000` | `us-east-1` | yes | Local dev default. |
| Oracle Object Storage | `oracle` | `https://<NAMESPACE>.compat.objectstorage.<REGION>.oraclecloud.com` | your region | yes | Create a *Customer Secret Key* for S3 compatibility; public buckets or pre-authenticated requests for reads. |
| DigitalOcean Spaces | `digitalocean-spaces` | `https://<REGION>.digitaloceanspaces.com` | `nyc3`… | no | Supports `public-read` ACL; the Spaces CDN URL makes a good `publicUrl`. |
| Backblaze B2 | `backblaze-b2` | `https://s3.<REGION>.backblazeb2.com` | e.g. `us-west-004` | yes | Use an application key with S3 access; public bucket or Cloudflare in front. |

**CORS (direct browser uploads).** `getUploadUrl` returns a presigned `PUT` URL + headers. If the
admin uploads directly to the bucket, allow `PUT` from the admin origin with `Content-Type` in the
bucket's CORS rules. Without it the API proxies uploads (the default flow).

### `azure-blob` — Azure Blob Storage

`@azure/storage-blob`, loaded lazily.

| Config | Description |
| --- | --- |
| `accountName`, `container` | Storage account and container |
| `endpoint` | Override for Azurite / sovereign clouds (default `https://{account}.blob.core.windows.net`) |
| `publicUrl` | CDN / custom domain for public blobs |
| `keyPrefix`, `defaultCacheControl`, `signedUrlTtlSeconds` | As for S3 |

Secrets: `accountKey` (required for SAS signed URLs) or `connectionString`.

Signed URLs are **SAS** tokens (`r` for downloads, `cw` for direct uploads, HTTPS-only on HTTPS
endpoints, start time back-dated 5 minutes for clock skew). Copy uses `beginCopyFromURL` with a
short-lived SAS on the source. Public reads require the container's access level to be *Blob*
(anonymous read for blobs), or a CDN. The `azurite` preset points at the local emulator.

### `local` — filesystem

For development and single-node installs.

| Config | Description |
| --- | --- |
| `directory` | Root directory (default `./storage`); use a shared volume for multiple API/worker nodes |
| `publicBaseUrl` | URL that serves the directory — the API's `/v1/storage` route |
| `keyPrefix`, `signedUrlTtlSeconds` | As above |

Secret: `signingSecret` (≥ 16 chars). Writes are atomic (temp file + rename) and every path is
checked to stay inside the root.

**Signed URLs** look like `{publicBaseUrl}/{key}?expires={unix}&sig={hmac}` (plus `disposition`
when set). The signature is `HMAC-SHA256(secret, "get\n{key}\n{expires}\n{disposition}\n")` in
base64url. The API verifies with:

```ts
import { verifyLocalSignedUrl } from '@atrium/providers';
import { localStorageSigningSecret } from '@atrium/server-kit';

const ok = verifyLocalSignedUrl(localStorageSigningSecret()!, key, {
  expires: url.searchParams.get('expires'),
  sig: url.searchParams.get('sig'),
  disposition: url.searchParams.get('disposition'),
});
```

Direct uploads use `?op=put&expires=…&sig=…` signed over `put`, the key and the content type.

## Image optimization pipeline

Uploading a JPEG/PNG/WebP/AVIF creates a `Media` row with `status = PROCESSING` and enqueues
`media.process { mediaId }`. The worker (`sharp`):

1. Downloads the original from the media's storage provider (`storageProviderId` or the org default).
2. Reads metadata and applies the **EXIF orientation** (dimensions are swapped for orientations 5–8).
3. Generates **WebP (q78) and AVIF (q52)** variants at widths `320, 640, 960, 1280, 1920, 2560`,
   skipping widths larger than the original (an image narrower than 320 px gets one variant at
   its own width). Variants are uploaded as public, immutable objects at
   `{key without extension}/w{width}.{format}`.
4. Creates a **20 px wide WebP blur placeholder**, stored inline as a `data:` URL (`blurDataUrl`).
5. Computes the **dominant color** (`dominantColor`, `#rrggbb`) for placeholders and theming.
6. Updates `Media.width/height/variants/blurDataUrl/dominantColor/metadata` and sets `READY`.

`Media.variants` is an array of `{ width, height, format, key, url, size }`. The renderer builds
`<picture>`/`srcset` from it (AVIF first, then WebP, then the original), using `blurDataUrl` and
`dominantColor` while the image loads.

SVG, GIF (animated GIFs are not re-encoded), icons, video and documents are marked `READY` without
variants. SVG/GIF dimensions are read when possible. After the final failed attempt (3 attempts,
exponential backoff) the media is marked `FAILED` with the error in `metadata.error`. Tune throughput
with `WORKER_CONCURRENCY_MEDIA` (default 2; AVIF encoding is CPU-heavy).

## Signed URLs

| Driver | Mechanism | Default TTL |
| --- | --- | --- |
| `s3` | SigV4 presigned `GetObject` (optional `ResponseContentDisposition`) | 1 h (max 7 days) |
| `azure-blob` | Blob SAS (`r`), optional `contentDisposition` | 1 h |
| `local` | HMAC token verified by the API | 1 h |

Private form uploads are linked from notification emails with **7-day** signed URLs and a
`Content-Disposition: attachment; filename="…"` header. The admin requests fresh signed URLs when
someone opens a submission.

## Switching providers

1. **Add** the new provider under *Settings → Storage*, fill in the config, save the secrets and run
   **Test** (write/read/delete probe).
2. **Copy existing objects** with the provider's tooling, keeping keys identical — for example
   `rclone sync seaweed:atrium-media r2:atrium-media`, `aws s3 sync`, or `azcopy`. Keys are
   provider-independent, so no database rewrite is needed.
3. **Make it the default.** New uploads go to the new provider. Media rows that point at the old
   provider through `storageProviderId` keep resolving through it until you update them, which lets
   you migrate gradually.
4. When the copy is verified, **update** `media.storage_provider_id` (or set it to `NULL` to follow the
   org default), then remove the old provider. Variant URLs stored in `Media.variants.url` come from
   `getPublicUrl` at processing time. If the public base URL changes, re-run `media.process` for
   affected media (or rewrite the stored `url` values), since every variant also records its `key`.
5. For the **platform** storage (env), change `STORAGE_DRIVER`/`S3_*`, copy the objects, then
   restart the API and worker.

Never change `ENCRYPTION_KEY` without rotation: add the new key to `ENCRYPTION_KEYS`, point
`ENCRYPTION_KEY_ID` at it, re-encrypt (`reencryptSecret`), and only then remove the old key.
