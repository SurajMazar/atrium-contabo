import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node22',
  platform: 'node',
  // Workspace packages and native deps (sharp, prisma) are resolved from node_modules at runtime.
  external: [/^@atrium\//, 'sharp', 'bullmq', 'ioredis', 'pino', 'dotenv', /^@sentry\//, /^@opentelemetry\//],
});
