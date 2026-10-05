import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  platform: 'node',
  // heavy SDKs stay external and are loaded lazily by the adapters that need them
  external: [/^@aws-sdk\//, '@azure/storage-blob', 'nodemailer', '@anthropic-ai/sdk', 'openai', '@google/genai', 'sharp'],
});
