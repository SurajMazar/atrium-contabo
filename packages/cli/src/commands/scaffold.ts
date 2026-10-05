import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Command } from 'commander';
import { context } from '../lib/context';
import { examples } from '../lib/help';
import { templatesDir } from '../lib/paths';
import { renderDir, toCamel, toKebab, toPascal, toTitle, type TemplateVars } from '../lib/template';
import { CliError, color, log, note } from '../lib/ui';

export const PROVIDER_KINDS = ['email', 'sms', 'storage', 'ai', 'deployment', 'captcha'] as const;
export type ProviderKindArg = (typeof PROVIDER_KINDS)[number];

const LEVELS = ['section', 'block', 'element'];
const CATEGORIES = [
  'structure',
  'content',
  'media',
  'marketing',
  'hospitality',
  'contact',
  'forms',
  'advanced',
  'collection',
];

/** Add `plugins/*` to pnpm-workspace.yaml if missing. Returns true when edited. */
export function ensureWorkspaceGlob(file: string, glob = 'plugins/*'): boolean {
  const src = readFileSync(file, 'utf8');
  if (
    new RegExp(`^\\s*-\\s*["']?${glob.replace(/[*/]/g, (c) => `\\${c}`)}["']?\\s*$`, 'm').test(src)
  )
    return false;
  const m = /^packages:\s*\n((?:\s+-\s+.*\n?)+)/m.exec(src);
  if (!m) throw new CliError(`Could not find a "packages:" list in ${file}`);
  const indent = /^(\s+)-/.exec(m[1]!)?.[1] ?? '  ';
  const block = m[1]!.endsWith('\n') ? m[1]! : `${m[1]}\n`;
  const next =
    src.slice(0, m.index) +
    `packages:\n${block}${indent}- ${glob}\n` +
    src.slice(m.index + m[0].length);
  writeFileSync(file, next);
  return true;
}

function writeScaffold(kind: string, outDir: string, vars: TemplateVars, force?: boolean) {
  const src = join(templatesDir, 'scaffold', kind);
  if (!existsSync(src))
    throw new CliError(`Scaffold template "${kind}" is missing from the CLI package`);
  const files = renderDir(src, outDir, vars, { overwrite: force });
  const skipped = files.filter((f) => f.skipped);
  if (skipped.length === files.length)
    throw new CliError(
      `Files already exist: ${skipped.map((f) => relative(process.cwd(), f.path)).join(', ')}`,
      'Use --force to overwrite.',
    );
  for (const f of files)
    log.raw(
      `  ${f.skipped ? color.yellow('=') : color.green('+')} ${relative(process.cwd(), f.path)}${f.skipped ? color.dim(' (exists, kept)') : ''}`,
    );
  return files;
}

export function registerScaffold(program: Command) {
  program
    .command('new-component <name>')
    .description(
      'Scaffold a builder component: registry definition (schema, controls, AI hints) + React renderer + test (like `bench new-app` for components)',
    )
    .option('--level <level>', `${LEVELS.join(' | ')}`, 'section')
    .option('--category <category>', CATEGORIES.join(' | '), 'content')
    .option('--plugin <name>', 'scaffold inside plugins/<name> instead of the core packages')
    .option('--force', 'overwrite existing files')
    .addHelpText(
      'after',
      examples([
        ['atrium new-component pricing-table --category marketing'],
        ['atrium new-component room-card --level block --plugin hotel-kit'],
      ]),
    )
    .action(function (
      this: Command,
      name: string,
      opts: { level: string; category: string; plugin?: string; force?: boolean },
    ) {
      const ctx = context(this);
      const plugin = opts.plugin ? toKebab(opts.plugin) : undefined;
      let type = toKebab(name);
      if (plugin && !type.startsWith(`${plugin}-`)) type = `${plugin}-${type}`;
      if (!/^[a-z][a-z0-9-]*$/.test(type))
        throw new CliError(
          `Invalid component name "${name}"`,
          'Use letters, digits and dashes, starting with a letter.',
        );
      if (!LEVELS.includes(opts.level))
        throw new CliError(`Unknown level "${opts.level}"`, LEVELS.join(' | '));
      if (!CATEGORIES.includes(opts.category))
        throw new CliError(`Unknown category "${opts.category}"`, CATEGORIES.join(' | '));
      const vars: TemplateVars = {
        type,
        Pascal: toPascal(type),
        camel: toCamel(type),
        title: toTitle(type),
        level: opts.level,
        category: opts.category,
        isSection: opts.level === 'section',
      };
      if (plugin) {
        const dir = join(ctx.root, 'plugins', plugin);
        if (!existsSync(dir))
          throw new CliError(
            `plugins/${plugin} does not exist`,
            `Create it: atrium new-plugin ${plugin}`,
          );
        const pkgVars = {
          ...vars,
          registryImport: '@atrium/component-registry',
          fieldsImport: '@atrium/component-registry',
          registryClassImport: '@atrium/component-registry',
        };
        writeScaffold('component', join(dir, 'src', 'components'), pkgVars, opts.force);
        writeScaffold('component-renderer', join(dir, 'src', 'components'), pkgVars, opts.force);
        note(
          `Add ${color.cyan(`${vars.camel}Definition`)} to components and ${color.cyan(`'${type}': ${vars.Pascal}Renderer`)} to renderers in plugins/${plugin}/src/index.ts.`,
          'Next',
        );
        return;
      }
      writeScaffold(
        'component',
        join(ctx.root, 'packages', 'component-registry', 'src', 'components'),
        {
          ...vars,
          registryImport: '../types',
          fieldsImport: '../fields',
          registryClassImport: '../registry',
        },
        opts.force,
      );
      writeScaffold(
        'component-renderer',
        join(ctx.root, 'packages', 'renderer-core', 'src', 'components'),
        vars,
        opts.force,
      );
      note(
        [
          `1. Register ${color.cyan(`${vars.camel}Definition`)} in packages/component-registry/src/index.ts (BUILTIN_COMPONENTS).`,
          `2. Map ${color.cyan(`'${type}'`)} → ${color.cyan(`${vars.Pascal}Renderer`)} in renderer-core's component map and style it with theme tokens.`,
          `3. ${color.cyan('pnpm --filter @atrium/component-registry test')} — the builder inspector, AI catalog and renderer all read the registry.`,
          'Conventions: docs/COMPONENTS.md.',
        ].join('\n'),
        'Next',
      );
    });

  program
    .command('new-provider <kind> <id>')
    .description(
      `Scaffold a provider driver (${PROVIDER_KINDS.join(', ')}) with config/secret schemas, implementation stub and test`,
    )
    .option('--plugin <name>', 'scaffold inside plugins/<name>')
    .option('--force', 'overwrite existing files')
    .addHelpText(
      'after',
      examples([
        ['atrium new-provider email brevo'],
        ['atrium new-provider sms msg91 --plugin india-sms'],
        ['atrium new-provider storage backblaze-b2'],
      ]),
    )
    .action(function (
      this: Command,
      kind: string,
      id: string,
      opts: { plugin?: string; force?: boolean },
    ) {
      const ctx = context(this);
      if (!PROVIDER_KINDS.includes(kind as ProviderKindArg))
        throw new CliError(
          `Unknown provider kind "${kind}"`,
          `Use one of: ${PROVIDER_KINDS.join(', ')}`,
        );
      const driverId = toKebab(id);
      const vars: TemplateVars = {
        kind,
        id: driverId,
        Pascal: toPascal(driverId),
        camel: toCamel(driverId),
        title: toTitle(driverId),
        KindPascal: toPascal(kind),
      };
      if (opts.plugin) {
        const dir = join(ctx.root, 'plugins', toKebab(opts.plugin));
        if (!existsSync(dir))
          throw new CliError(
            `plugins/${toKebab(opts.plugin)} does not exist`,
            `Create it: atrium new-plugin ${opts.plugin}`,
          );
        writeScaffold(
          `provider/${kind}`,
          join(dir, 'src', 'providers'),
          { ...vars, driverImport: '@atrium/providers', typesImport: '@atrium/providers' },
          opts.force,
        );
        note(
          `Add ${color.cyan(`${vars.camel}Driver`)} to the plugin's providers array in src/index.ts.`,
          'Next',
        );
        return;
      }
      writeScaffold(
        `provider/${kind}`,
        join(ctx.root, 'packages', 'providers', 'src', kind),
        { ...vars, driverImport: '../driver', typesImport: './types' },
        opts.force,
      );
      note(
        [
          `1. Add ${color.cyan(`${vars.camel}Driver`)} to the ${kind} driver list (packages/providers/src/${kind}/index.ts).`,
          '2. Implement the TODOs; keep secrets in secretsSchema (they are encrypted at rest and never returned to clients).',
          `3. Run ${color.cyan('pnpm --filter @atrium/providers test')}. The admin renders the config form from the zod schemas.`,
        ].join('\n'),
        'Next',
      );
    });

  program
    .command('new-plugin <name>')
    .description(
      'Scaffold a plugin package under plugins/<name> that can contribute components, renderers and provider drivers',
    )
    .option('--force', 'overwrite existing files')
    .addHelpText(
      'after',
      examples([
        ['atrium new-plugin hotel-kit', 'then: atrium new-component room-card --plugin hotel-kit'],
      ]),
    )
    .action(function (this: Command, name: string, opts: { force?: boolean }) {
      const ctx = context(this);
      const slug = toKebab(name);
      if (!slug) throw new CliError(`Invalid plugin name "${name}"`);
      const dir = join(ctx.root, 'plugins', slug);
      writeScaffold(
        'plugin',
        dir,
        { name: slug, Pascal: toPascal(slug), camel: toCamel(slug), title: toTitle(slug) },
        opts.force,
      );
      if (ensureWorkspaceGlob(join(ctx.root, 'pnpm-workspace.yaml')))
        log.success('Added plugins/* to pnpm-workspace.yaml');
      note(
        [
          `cd plugins/${slug} && pnpm install && pnpm test`,
          `atrium new-component <name> --plugin ${slug}`,
          `atrium new-provider <kind> <id> --plugin ${slug}`,
          `Load it from the API/worker/renderer by adding "@atrium-plugin/${slug}": "workspace:*" and calling registerPlugin() — see docs/CONTRIBUTING.md#plugins.`,
        ].join('\n'),
        'Next',
      );
    });
}
