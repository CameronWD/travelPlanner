/**
 * Operator script: mint, list and revoke Claude connection tokens
 * (spec 2026-10-09, ADR 0070 amendment). Loads .env.production.local via
 * scripts/load-env.ts, so it targets production when that file exists.
 *
 *   npm run mcp:token -- --email <email> --label <label>
 *   npm run mcp:token -- --list
 *   npm run mcp:token -- --revoke <id>
 */
import "./load-env";

import { db } from "../lib/db";
import { databaseHost } from "./lib/storage-target";
import { runMcpToken } from "./mcp-token-run";

const argv = process.argv.slice(2);
console.log(`Target: database ${databaseHost(process.env.DATABASE_URL) ?? "unknown"}`);
runMcpToken(argv, { db, log: (s) => console.log(s) })
  .then((code) => { process.exitCode = code; })
  .catch((err) => { console.error("Fatal error:", err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => db.$disconnect());
