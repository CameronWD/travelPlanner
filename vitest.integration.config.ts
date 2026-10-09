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
    server: {
      deps: {
        // test/integration/mcp.test.ts (Task 16) is the first test in this
        // tier that does NOT mock @/lib/guards, so the real /api/mcp route
        // pulls in next-auth for real via lib/guards -> lib/auth. next-auth's
        // lib/env.js does a bare, extension-less `import { NextRequest } from
        // "next/server"`; Next ships no "exports" map, so once an ESM-only
        // package elsewhere in the graph (@modelcontextprotocol/sdk) pushes
        // Vite's dep handling to externalize node_modules to Node's native
        // loader, that import fails Node's strict ESM resolution ("Did you
        // mean to import next/server.js?"). Inlining next and next-auth
        // routes them through Vite's own resolver instead, which tolerates
        // the missing extension. No other file in this tier needs it.
        inline: [/next-auth/, /^next$/, /next\//],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
