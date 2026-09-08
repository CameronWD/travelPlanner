/**
 * Loads environment variables before any other module runs.
 *
 * Import this first, for its side effect only, in any script whose other
 * imports read env vars at import time (e.g. lib/db reads DATABASE_URL when
 * it is imported). ES import execution order guarantees this module fully
 * evaluates before later imports in the same file do, so the env is in place
 * by the time they run.
 *
 * Prefers .env.production.local when present (that is where real data lives
 * — the app is used deployed), falling back to whatever env dotenv finds by
 * default.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const PROD_ENV = path.join(process.cwd(), ".env.production.local");
if (existsSync(PROD_ENV)) {
  config({ path: PROD_ENV, override: true });
} else {
  config();
}
