/**
 * Spec 2026-10-09 (TC-05): preflight for operator scripts. Pure over an env
 * object, so testable without touching process.env or a database.
 */
import { resolveSweepDriver } from "../../lib/sweep-blobs-driver";
import { assertStorageMatchesDatabase, databaseHost, describeTarget } from "./storage-target";

type Env = Record<string, string | undefined>;

/** Target line for scripts that touch the database but no storage. */
export function dbTargetLine(env: Env, dryRun: boolean): string {
  return `Target: database ${databaseHost(env.DATABASE_URL) ?? "unknown"}, ${dryRun ? "DRY RUN" : "LIVE"}`;
}

/**
 * sweep:blobs preflight. Both guards stack: the storage/database match
 * (dry runs too) and resolveSweepDriver's "--execute needs an explicit
 * STORAGE_DRIVER" rule. The target line is always first.
 */
export function sweepPreflight(
  env: Env,
  execute: boolean,
): { ok: true; lines: string[]; driverLabel: string } | { ok: false; lines: string[] } {
  const lines = [describeTarget(env, !execute)];
  try {
    assertStorageMatchesDatabase(env);
  } catch (err) {
    return { ok: false, lines: [...lines, err instanceof Error ? err.message : String(err)] };
  }
  const resolved = resolveSweepDriver(execute, env.STORAGE_DRIVER);
  if ("error" in resolved) return { ok: false, lines: [...lines, resolved.error] };
  return { ok: true, lines, driverLabel: resolved.label };
}
