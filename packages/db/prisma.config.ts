import { config } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Load the monorepo root .env (then a local one, if present).
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'pnpm --filter @atrium/api seed' },
  // `prisma generate` does not need a live database; migrate/studio do.
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/atrium' },
});
