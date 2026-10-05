import type { Scene } from '../director';
import { card, terminal } from './helpers';

const CH = 'Developer setup';

export const setupScenes: Scene[] = [
  card('01-setup-card', CH, 'Chapter 1', 'Set up a *development* environment', 'Node, pnpm and Podman · one command to bootstrap · four local services', [
    'Let us start as a developer. You need Node, pnpm and Podman, and about ten minutes.',
  ]),
  terminal('02-setup-install', CH, 'Install', [
    { cmd: 'node -v && pnpm -v && podman --version', say: 'Check your toolchain first: Node 22 or newer, pnpm 10, and Podman. Docker also works if you prefer it.' },
    { cmd: 'git clone https://github.com/your-org/atrium.git website-builder && cd website-builder', output: "Cloning into 'website-builder'...\nremote: Enumerating objects: done.\nReceiving objects: 100% done.\nResolving deltas: 100% done.", say: 'Clone the repository. It is a pnpm and Turborepo monorepo with four apps and about twenty shared packages.' },
    { cmd: 'pnpm install', say: 'Install dependencies once for the whole workspace.', maxLines: 8 },
  ]),
  terminal('03-setup-cli', CH, 'The atrium CLI', [
    { cmd: 'pnpm atrium --help', run: 'pnpm -s atrium --help', say: 'Atrium ships with a bench-style command line tool. It bootstraps, runs, migrates, backs up and deploys the platform.', maxLines: 34, lineMs: 14 },
    { cmd: 'pnpm atrium init --help', run: 'pnpm -s atrium init --help', say: 'On a fresh machine, atrium init does everything in one go: it checks prerequisites, picks free ports, writes a dot env file with strong generated secrets, starts the services, migrates and seeds. Every step can be skipped with a flag.', maxLines: 30, lineMs: 14 },
  ]),
  terminal('04-setup-services', CH, 'Local services', [
    { cmd: 'podman compose -f infra/compose.yaml up -d', run: 'podman compose -f infra/compose.yaml ps --format "{{.Names}}  {{.Status}}"', say: 'Under the hood, Podman runs four small services: PostgreSQL, Redis for background jobs, SeaweedFS as S3 compatible storage, and Mailpit to catch email.', maxLines: 10 },
    { cmd: 'pnpm db:deploy', run: 'pnpm -s db:deploy', say: 'Database migrations are managed with Prisma.', maxLines: 10 },
    { cmd: 'pnpm db:seed', run: 'pnpm -s db:seed', say: 'The seed creates a super admin, a demo organization and three published demo websites.', maxLines: 12 },
  ]),
  terminal('05-setup-run', CH, 'Run the platform', [
    { cmd: 'pnpm atrium start --help', run: 'pnpm -s atrium start --help', say: 'Run pnpm dev, or atrium start, to launch everything with hot reload: the NestJS API on port four thousand, the background worker, the admin and builder on port three thousand, and the public website renderer on port three thousand and one.', maxLines: 24, lineMs: 14 },
    { cmd: 'pnpm atrium doctor', run: 'pnpm -s atrium doctor', say: 'If anything looks wrong, atrium doctor checks your environment, secrets, database, Redis, storage and mail, and tells you exactly what to fix.', maxLines: 30, lineMs: 16 },
    { cmd: 'pnpm atrium status', run: 'pnpm -s atrium status', say: 'And atrium status shows service health, app endpoints, queue depth and migration state at a glance.', maxLines: 30, lineMs: 16 },
  ]),
];
