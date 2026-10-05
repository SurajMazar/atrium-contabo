import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Secrets-at-rest encryption (AES-256-GCM) with key rotation.
 *
 * Format: `v1:<keyId>:<iv>:<tag>:<ciphertext>` (base64url parts). The `v1:<keyId>` header is
 * bound as additional authenticated data, so tampering with any part fails decryption.
 *
 * Keys (env):
 *  - `ENCRYPTION_KEY`      — base64 32-byte key, registered under key id `default`.
 *  - `ENCRYPTION_KEYS`     — `keyId:base64,keyId:base64` additional/rotated keys.
 *  - `ENCRYPTION_KEY_ID`   — active key id for new ciphertexts (default: `default` when
 *                             ENCRYPTION_KEY is set, else the first ENCRYPTION_KEYS entry).
 * Rotation: add the new key to ENCRYPTION_KEYS, point ENCRYPTION_KEY_ID at it, keep the old key
 * until `needsReencryption()` reports nothing left, then remove it.
 */
export const CIPHER_VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

export class CryptoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoConfigError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

export interface Keyring {
  activeKeyId: string;
  keys: Map<string, Buffer>;
}

function decodeKey(id: string, b64: string): Buffer {
  const key = Buffer.from(b64.trim(), 'base64');
  if (key.length !== 32) throw new CryptoConfigError(`Encryption key "${id}" must be 32 bytes (base64); got ${key.length} bytes`);
  return key;
}

/** Build a keyring from environment variables (see module docs). */
export function keyringFromEnv(env: Record<string, string | undefined> = process.env): Keyring {
  const keys = new Map<string, Buffer>();
  for (const entry of (env.ENCRYPTION_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const idx = entry.indexOf(':');
    if (idx <= 0) throw new CryptoConfigError('ENCRYPTION_KEYS entries must look like keyId:base64key');
    const id = entry.slice(0, idx).trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new CryptoConfigError(`Invalid encryption key id "${id}"`);
    keys.set(id, decodeKey(id, entry.slice(idx + 1)));
  }
  if (env.ENCRYPTION_KEY && !keys.has('default')) keys.set('default', decodeKey('default', env.ENCRYPTION_KEY));
  if (!keys.size) throw new CryptoConfigError('ENCRYPTION_KEY (or ENCRYPTION_KEYS) is not set — generate one with: openssl rand -base64 32');
  const activeKeyId = env.ENCRYPTION_KEY_ID?.trim() || (env.ENCRYPTION_KEY ? 'default' : [...keys.keys()][0]!);
  if (!keys.has(activeKeyId)) throw new CryptoConfigError(`ENCRYPTION_KEY_ID "${activeKeyId}" is not present in the keyring`);
  return { activeKeyId, keys };
}

const b64u = (b: Buffer) => b.toString('base64url');

export class SecretBox {
  constructor(private readonly keyring: Keyring) {}

  get activeKeyId(): string {
    return this.keyring.activeKeyId;
  }

  encrypt(plaintext: string): string {
    const keyId = this.keyring.activeKeyId;
    const key = this.keyring.keys.get(keyId)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, key, iv);
    cipher.setAAD(Buffer.from(`${CIPHER_VERSION}:${keyId}`));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [CIPHER_VERSION, keyId, b64u(iv), b64u(cipher.getAuthTag()), b64u(ct)].join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 5 || parts[0] !== CIPHER_VERSION) throw new DecryptionError('Unsupported or malformed ciphertext');
    const [version, keyId, ivB64, tagB64, ctB64] = parts as [string, string, string, string, string];
    const key = this.keyring.keys.get(keyId);
    if (!key) throw new DecryptionError(`Unknown encryption key id "${keyId}" — is the old key still in ENCRYPTION_KEYS?`);
    try {
      const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'));
      decipher.setAAD(Buffer.from(`${version}:${keyId}`));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new DecryptionError('Ciphertext failed authentication (tampered or wrong key)');
    }
  }

  keyIdOf(payload: string): string | undefined {
    const parts = payload.split(':');
    return parts.length === 5 && parts[0] === CIPHER_VERSION ? parts[1] : undefined;
  }

  needsReencryption(payload: string): boolean {
    return this.keyIdOf(payload) !== this.keyring.activeKeyId;
  }
}

let defaultBox: { box: SecretBox; signature: string } | undefined;

function envSignature(): string {
  return `${process.env.ENCRYPTION_KEY ?? ''}|${process.env.ENCRYPTION_KEYS ?? ''}|${process.env.ENCRYPTION_KEY_ID ?? ''}`;
}

/** The process-wide SecretBox built from env (rebuilt automatically when the env changes). */
export function getSecretBox(): SecretBox {
  const signature = envSignature();
  if (!defaultBox || defaultBox.signature !== signature) defaultBox = { box: new SecretBox(keyringFromEnv()), signature };
  return defaultBox.box;
}

/** Encrypt a string (objects are JSON-serialized; use decryptJson to read them back). */
export function encryptSecret(plaintext: string | Record<string, unknown> | unknown[]): string {
  return getSecretBox().encrypt(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
}

export function decryptSecret(payload: string): string {
  return getSecretBox().decrypt(payload);
}

export function encryptJson(value: unknown): string {
  return getSecretBox().encrypt(JSON.stringify(value ?? null));
}

export function decryptJson<T = Record<string, unknown>>(payload: string): T {
  return JSON.parse(getSecretBox().decrypt(payload)) as T;
}

/** True when the ciphertext was produced with a key other than the active one. */
export function needsReencryption(payload: string): boolean {
  return getSecretBox().needsReencryption(payload);
}

/** Decrypt with any known key and re-encrypt with the active key. */
export function reencryptSecret(payload: string): string {
  const box = getSecretBox();
  return box.needsReencryption(payload) ? box.encrypt(box.decrypt(payload)) : payload;
}

// ───────────────────────────── Tokens & HMAC ─────────────────────────────

/** sha256 hex — store this instead of raw tokens (sessions, invites, preview links). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** URL-safe random token (default 32 bytes ≈ 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function signHmac(secret: string | Buffer, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time HMAC verification; accepts an optional `sha256=` prefix on the signature. */
export function verifyHmac(secret: string | Buffer, payload: string | Buffer, signature: string): boolean {
  const expected = Buffer.from(signHmac(secret, payload), 'hex');
  const hex = signature.trim().replace(/^sha256=/, '');
  if (!/^[0-9a-f]+$/i.test(hex)) return false;
  const actual = Buffer.from(hex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ───────────────────────────── Webhook signatures ─────────────────────────────

export const WEBHOOK_HEADERS = {
  event: 'X-Atrium-Event',
  delivery: 'X-Atrium-Delivery',
  timestamp: 'X-Atrium-Timestamp',
  signature: 'X-Atrium-Signature',
} as const;

/** `sha256=<hex>` HMAC over `${timestamp}.${body}` (timestamp = unix seconds). */
export function signWebhookPayload(secret: string, timestamp: number | string, body: string): string {
  return `sha256=${signHmac(secret, `${timestamp}.${body}`)}`;
}

/** Receiver-side verification with replay protection (default tolerance 5 minutes). */
export function verifyWebhookSignature(secret: string, timestamp: number | string, body: string, signature: string, toleranceSeconds = 300, nowMs = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > toleranceSeconds) return false;
  return verifyHmac(secret, `${timestamp}.${body}`, signature);
}

/** Headers for an outgoing webhook delivery. */
export function webhookHeaders(secret: string, input: { event: string; deliveryId: string; body: string; timestamp?: number }): Record<string, string> {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Atrium-Webhooks/1.0',
    [WEBHOOK_HEADERS.event]: input.event,
    [WEBHOOK_HEADERS.delivery]: input.deliveryId,
    [WEBHOOK_HEADERS.timestamp]: String(timestamp),
    [WEBHOOK_HEADERS.signature]: signWebhookPayload(secret, timestamp, input.body),
  };
}

/** Derive a purpose-specific secret from the encryption key (e.g. local storage URL signing). */
export function deriveSecret(purpose: string, env: Record<string, string | undefined> = process.env): string {
  const ring = keyringFromEnv(env);
  return createHmac('sha256', ring.keys.get(ring.activeKeyId)!).update(`atrium:${purpose}`).digest('base64url');
}
