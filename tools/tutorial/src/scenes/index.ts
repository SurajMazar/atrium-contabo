import type { Scene } from '../director';
import { card, terminal } from './helpers';

export const SCENES: Scene[] = [
  card('00-intro', 'Welcome', 'Atrium', 'One platform for *every* website', 'Visual builder · headless CMS · forms & workflows · AI generation · multi-provider deployment', [
    'Welcome to Atrium, a multi-tenant website builder and content platform.',
    'In this tutorial you will set it up as a developer, build and publish a website with every feature, and then deploy the platform to production.',
  ]),
  terminal('01-prereqs', 'Developer setup', 'Prerequisites', [
    { cmd: 'node -v && pnpm -v && podman --version', say: 'You need Node 22 or newer, pnpm, and Podman. Docker works too, but this project is set up for Podman.' },
  ]),
];
