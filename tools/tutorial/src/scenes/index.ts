import type { Scene } from '../director';
import { builderScenes } from './builder';
import { cliScenes, deployScenes } from './deploy';
import { card } from './helpers';
import { contentScenes, formScenes, insightScenes, opsScenes, publicScenes } from './manage';
import { setupScenes } from './setup';
import { createScenes, workspaceScenes } from './workspace';

export const SCENES: Scene[] = [
  card('00-intro', 'Welcome', 'Atrium', 'One platform for *every* website', 'Visual builder · headless CMS · forms & workflows · AI generation · multi-provider deployment', [
    'Welcome to Atrium, a multi-tenant website builder and content platform.',
    'In this tutorial you will set it up as a developer, build and publish a website using every major feature, and then deploy the platform to production.',
  ]),
  ...setupScenes,
  ...workspaceScenes,
  ...createScenes,
  ...builderScenes,
  ...contentScenes,
  ...formScenes,
  ...opsScenes,
  ...insightScenes,
  ...publicScenes,
  ...cliScenes,
  ...deployScenes,
];
