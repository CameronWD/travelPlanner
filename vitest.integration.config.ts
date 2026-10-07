import { defineConfig } from 'vitest/config'
import path from 'path'
import { integrationDatabaseUrl } from './test/helpers/local-db'

// The real-Postgres tier (perf spec §X): docker compose up -d, then
// npx prisma migrate deploy, then npm run test:integration. CI's `integration`
// job runs the same against a service container. Refuses a non-local DB.
const databaseUrl = integrationDatabaseUrl(process.env)

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/integration/**/*.test.ts'],
    // These tests share one database — no parallel files/tests.
    fileParallelism: false,
    testTimeout: 30_000,
    env: { DATABASE_URL: databaseUrl, INTEGRATION: '1' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
