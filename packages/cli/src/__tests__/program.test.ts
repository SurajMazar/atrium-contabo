import { describe, expect, it } from 'vitest';
import { createProgram } from '../index';
import { runCli } from './helpers';

const EXPECTED = [
  'init',
  'setup',
  'start',
  'stop',
  'status',
  'logs',
  'procfile',
  'migrate',
  'seed',
  'db',
  'console',
  'login',
  'logout',
  'whoami',
  'new-site',
  'list-sites',
  'use',
  'drop-site',
  'publish',
  'export-site',
  'import-site',
  'templates',
  'create-user',
  'set-admin-password',
  'new-org',
  'backup',
  'restore',
  'config',
  'doctor',
  'update',
  'build',
  'version',
  'new-component',
  'new-provider',
  'new-plugin',
];

describe('command registration', () => {
  const program = createProgram();
  const names = program.commands.map((c) => c.name());

  it('registers every bench-style command', () => {
    for (const n of EXPECTED) expect(names, n).toContain(n);
  });

  it('every command has a description', () => {
    const walk = (cmds: typeof program.commands): void => {
      for (const c of cmds) {
        expect(c.description(), c.name()).not.toBe('');
        walk(c.commands);
      }
    };
    walk(program.commands);
  });

  it('has setup, db and config subcommands', () => {
    const sub = (n: string) =>
      program.commands.find((c) => c.name() === n)!.commands.map((c) => c.name());
    expect(sub('setup')).toEqual(
      expect.arrayContaining(['env', 'infra', 'production', 'check', 'ssl', 'redis', 'procfile']),
    );
    expect(sub('db')).toEqual(expect.arrayContaining(['status', 'reset', 'console', 'studio']));
    expect(sub('config')).toEqual(expect.arrayContaining(['list', 'get', 'set', 'unset']));
  });

  it('prints help with examples', async () => {
    const r = await runCli(['setup', 'production', '--help']);
    expect(r.stdout).toContain('--target');
    expect(r.stdout).toContain('Examples:');
    expect(r.stdout).toContain('cpanel');
  });

  it('fails cleanly on unknown commands', async () => {
    const r = await runCli(['definitely-not-a-command']);
    expect(r.code).not.toBe(0);
  });
});
