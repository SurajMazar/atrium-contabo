import type { Command } from 'commander';
import { ApiClient } from './api';
import { readProjectConfig, type ProjectConfig } from './config';
import { EnvFile, childEnv } from './env';
import { paths, projectRoot, type ProjectPaths } from './paths';

export interface GlobalOptions {
  root?: string;
  yes?: boolean;
  verbose?: boolean;
  json?: boolean;
  api?: string;
  token?: string;
  site?: string;
}

export interface Context {
  root: string;
  p: ProjectPaths;
  globals: GlobalOptions;
  /** Parsed .env (null when missing). */
  env: EnvFile | null;
  /** process.env overlaid on .env — what child processes see. */
  vars: Record<string, string | undefined>;
  config: ProjectConfig;
  api(): ApiClient;
  childEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv;
}

export function globalsOf(cmd: Command): GlobalOptions {
  return cmd.optsWithGlobals() as GlobalOptions;
}

export function context(cmd: Command): Context {
  const globals = globalsOf(cmd);
  const root = projectRoot();
  const p = paths(root);
  const env = EnvFile.read(p.env);
  const config = readProjectConfig(p.config);
  const vars: Record<string, string | undefined> = { ...(env?.toObject() ?? {}), ...process.env };
  let client: ApiClient | undefined;
  return {
    root,
    p,
    globals,
    env,
    vars,
    config,
    api() {
      if (!client) {
        const url =
          globals.api ??
          process.env.ATRIUM_API_URL ??
          config.apiUrl ??
          vars.API_URL ??
          'http://localhost:4000';
        client = new ApiClient(url, globals.token ?? process.env.ATRIUM_TOKEN);
      }
      return client;
    },
    childEnv: (extra = {}) => childEnv(p.env, extra),
  };
}
