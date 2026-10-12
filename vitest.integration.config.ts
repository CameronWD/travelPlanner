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
    // test/integration/mcp.test.ts (Task 16) is the first test in this tier
    // that does NOT mock @/lib/guards, so the real /api/mcp route pulls in
    // the real auth module graph via lib/guards -> lib/auth (Better Auth,
    // ADR 0071). The old next-auth inline-deps workaround lived here because
    // next-auth's lib/env.js did a bare, extension-less `import { NextRequest }
    // from "next/server"`, which Node's strict ESM resolution rejected once
    // an ESM-only package elsewhere in the graph (@modelcontextprotocol/sdk)
    // pushed Vite's dep handling to externalize node_modules to Node's native
    // loader. Better Auth's Next.js integration (dist/integrations/next-js.mjs)
    // only ever does a dynamic `import("next/headers.js")` with the explicit
    // extension, so it never hits that failure mode — verified by running
    // this tier's auth-dev-login test with no `server.deps.inline` entry at
    // all. No replacement entry is needed.
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
