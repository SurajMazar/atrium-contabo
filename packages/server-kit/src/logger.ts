import { pino, stdSerializers, type Logger, type LoggerOptions } from 'pino';

/** Keys whose values are never logged (case-insensitive substring match in `redactDeep`). */
export const SECRET_KEY_PATTERN = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key|signature|session|accesskey|auth[-_]?token|connectionstring|dsn/i;

const SECRET_KEYS = [
  'password', 'pass', 'secret', 'secrets', 'secretsEnc', 'secretEnc', 'token', 'apiKey', 'api_key', 'authToken', 'accessToken',
  'refreshToken', 'authorization', 'Authorization', 'cookie', 'secretAccessKey', 'accountKey', 'connectionString', 'privateKey',
  'serverToken', 'apiSecret', 'signingSecret', 'secretKey', 'passwordHash', 'mfaSecretEnc',
];

/** pino redact paths: top level + up to 3 levels deep, plus common header locations. */
export const REDACT_PATHS = [
  ...SECRET_KEYS,
  ...SECRET_KEYS.map((k) => `*.${k}`),
  ...SECRET_KEYS.map((k) => `*.*.${k}`),
  ...SECRET_KEYS.map((k) => `*.*.*.${k}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers["x-api-key"]',
  '*.headers["x-api-key"]',
];

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  /** Pretty output (requires pino-pretty to be installed); defaults to false. */
  pretty?: boolean;
  base?: Record<string, unknown>;
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    name: opts.name,
    level: opts.level ?? process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    base: { service: opts.name, ...(opts.base ?? {}) },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    serializers: { err: stdSerializers.err, error: stdSerializers.err },
  };
  if (opts.pretty) options.transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } };
  return pino(options);
}

/** Deep-copy a value replacing secret-looking keys (for audit metadata, error payloads, job logs). */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as T;
  if (Buffer.isBuffer(value) || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_PATTERN.test(k) && v !== null && v !== undefined && typeof v !== 'boolean' ? '[redacted]' : redactDeep(v, depth + 1);
  }
  return out as T;
}

export type { Logger };
