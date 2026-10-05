import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Per-checkout CLI state in `.atrium/config.json` (like bench's currentsite.txt). */
export interface ProjectConfig {
  currentSite?: string;
  currentSiteId?: string;
  defaultOrg?: string;
  apiUrl?: string;
}

export function readProjectConfig(file: string): ProjectConfig {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ProjectConfig;
  } catch {
    return {};
  }
}

export function writeProjectConfig(file: string, cfg: ProjectConfig) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
}

export function updateProjectConfig(file: string, patch: Partial<ProjectConfig>): ProjectConfig {
  const next = { ...readProjectConfig(file), ...patch };
  for (const k of Object.keys(next) as Array<keyof ProjectConfig>) if (next[k] === undefined || next[k] === '') delete next[k];
  writeProjectConfig(file, next);
  return next;
}

/** One stored API session. Tokens never leave this file (0600). */
export interface StoredSession {
  email: string;
  userId?: string;
  accessToken?: string;
  accessExpiresAt?: number;
  refreshToken?: string;
  /** Name of the refresh cookie the API set (default atrium_rt). */
  refreshCookie?: string;
  savedAt: string;
}

export interface CredentialsFile {
  version: 1;
  sessions: Record<string, StoredSession>;
}

export function configHome(): string {
  return process.env.ATRIUM_CONFIG_HOME ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'atrium');
}

export function credentialsPath(): string {
  return join(configHome(), 'credentials.json');
}

export function readCredentials(file = credentialsPath()): CredentialsFile {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as CredentialsFile;
    if (data && typeof data.sessions === 'object') return data;
  } catch {
    /* fallthrough */
  }
  return { version: 1, sessions: {} };
}

export function writeCredentials(data: CredentialsFile, file = credentialsPath()) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** Sessions are keyed by normalized API base URL. */
export function sessionKey(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
}

export function getSession(apiUrl: string, file?: string): StoredSession | undefined {
  return readCredentials(file).sessions[sessionKey(apiUrl)];
}

export function saveSession(apiUrl: string, s: StoredSession, file?: string) {
  const data = readCredentials(file);
  data.sessions[sessionKey(apiUrl)] = s;
  writeCredentials(data, file);
}

export function clearSession(apiUrl: string, file?: string): boolean {
  const data = readCredentials(file);
  const key = sessionKey(apiUrl);
  if (!data.sessions[key]) return false;
  delete data.sessions[key];
  writeCredentials(data, file);
  return true;
}
