import { Command, CommanderError } from 'commander';
import pc from 'picocolors';
import { registerBackup } from './commands/backup';
import { registerConfig } from './commands/config';
import { registerDb } from './commands/db';
import { registerDoctor } from './commands/doctor';
import { registerInit } from './commands/init';
import { registerMaintenance } from './commands/maintenance';
import { registerRun } from './commands/run';
import { registerScaffold } from './commands/scaffold';
import { registerSetup } from './commands/setup';
import { registerSites } from './commands/sites';
import { registerUsers } from './commands/users';
import { examples } from './lib/help';
import { cliVersion, setRootOverride } from './lib/paths';
import { CliError, isVerbose, setUiOptions } from './lib/ui';

/** Build the command tree (exported for tests). */
export function createProgram(): Command {
  const program = new Command('atrium');
  // Throw instead of process.exit() so run() controls exit codes (inherited by subcommands).
  program.exitOverride();
  program
    .description(
      'Install, configure, run, migrate, back up and deploy the Atrium website platform.',
    )
    .version(cliVersion(), '-V, --version', 'print the CLI version')
    .option('--root <dir>', 'Atrium checkout to operate on (default: nearest parent of cwd)')
    .option('-y, --yes', 'assume "yes" for prompts; never prompt (CI)')
    .option('-v, --verbose', 'print the commands being run')
    .option('--json', 'machine-readable output where supported')
    .option('--api <url>', 'API base URL (default: API_URL from .env)')
    .option('--token <token>', 'API access token (default: stored session from `atrium login`)')
    .option('--site <site>', 'site slug/id for site commands (default: `atrium use`)')
    .showHelpAfterError('(add --help for usage)')
    .configureHelp({ sortSubcommands: false })
    .addHelpText(
      'after',
      `\n${pc.bold('Getting started:')}\n` +
        examples([
          ['pnpm atrium init', 'one-time setup: .env + secrets, podman services, migrations, seed'],
          ['pnpm atrium start', 'run api, worker, renderer, admin (like bench start)'],
          ['pnpm atrium doctor', 'diagnose problems'],
          [
            'pnpm atrium setup production --target podman --domain example.com',
            'generate deployment files',
          ],
        ]) +
        `\nDocs: docs/CLI.md (bench → atrium command map), docs/DEPLOYMENT.md\n`,
    )
    .hook('preAction', (_this, action) => {
      const o = action.optsWithGlobals() as {
        root?: string;
        yes?: boolean;
        verbose?: boolean;
        json?: boolean;
      };
      setUiOptions({ yes: o.yes, verbose: o.verbose, json: o.json });
      if (o.root) setRootOverride(o.root);
    });

  registerInit(program);
  registerSetup(program);
  registerRun(program);
  registerDb(program);
  registerSites(program);
  registerUsers(program);
  registerBackup(program);
  registerConfig(program);
  registerDoctor(program);
  registerMaintenance(program);
  registerScaffold(program);
  return program;
}

/** Entry point used by bin/atrium.mjs. */
export async function run(argv: string[]): Promise<void> {
  const program = createProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      // help/version and usage errors were already printed by commander
      process.exitCode = err.exitCode;
      return;
    }
    if (err instanceof CliError) {
      process.stderr.write(`${pc.red('✖')} ${err.message}\n`);
      if (err.hint)
        process.stderr.write(`${pc.dim('  ↳')} ${err.hint.split('\n').join('\n    ')}\n`);
      if (isVerbose() && err.stack) process.stderr.write(pc.dim(`${err.stack}\n`));
      process.exitCode = err.exitCode || 1;
      return;
    }
    const e = err as Error;
    process.stderr.write(`${pc.red('✖')} ${e?.message ?? String(err)}\n`);
    if (isVerbose() && e?.stack) process.stderr.write(pc.dim(`${e.stack}\n`));
    else process.stderr.write(pc.dim('  ↳ re-run with --verbose for details\n'));
    process.exitCode = 1;
  }
}
