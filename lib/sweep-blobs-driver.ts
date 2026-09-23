/**
 * Which storage driver `scripts/sweep-deleted-blobs.ts` is about to destroy
 * objects through — decided here, as a pure function, so it can be tested
 * without a database (the script itself imports `@/lib/db`, which throws at
 * module evaluation when `DATABASE_URL` is unset).
 *
 * Why this exists at all: `getStorage()` (lib/storage.ts) defaults
 * `STORAGE_DRIVER` to `"local"`, and the local driver's `delete` is
 * `fs.rm(dest, { force: true })` — a silent no-op against a path that does
 * not exist. So a sweep run with only `DATABASE_URL` in the environment
 * (which is exactly how every documented invocation was written) printed
 * `[DESTROY]` per key and `destroyed N, failed 0`, deleted every `DeletedBlob`
 * row, and left every R2 object alive and now *permanently* orphaned: no live
 * row points at them and no retention record remains, so no future sweep can
 * ever find them again. The dry-run path never constructs a driver, so no
 * amount of dry-run verification could catch it.
 *
 * The fix is to refuse rather than guess. `--execute` requires `STORAGE_DRIVER`
 * to be set *explicitly* — including to `"local"`, which is a deliberate
 * choice and therefore fine. A dry run resolves as normal and simply reports
 * what it would have used, because the point of a dry run is to show you what
 * the real run will do.
 */

export type SweepDriverResolution =
  | { driver: string; label: string }
  | { error: string };

const REFUSAL = [
  "STORAGE_DRIVER is not set, and --execute refuses to guess.",
  "",
  'getStorage() would default to "local", whose delete() is a silent no-op for',
  "any key that is not on this machine's disk — so this run would report every",
  "blob destroyed, drop every DeletedBlob row, and leave the real objects alive",
  "with nothing left pointing at them. Set it explicitly:",
  "",
  "  STORAGE_DRIVER=r2 CLOUDFLARE_ACCOUNT_ID=… R2_BUCKET_NAME=… \\",
  "    R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \\",
  "    DATABASE_URL=… npm run sweep:blobs -- --execute",
  "",
  'STORAGE_DRIVER=local is accepted too — it is a choice rather than a default.',
].join("\n");

/**
 * Resolve the storage driver for a sweep run.
 *
 * @param execute  true for `--execute`, false for a dry run.
 * @param storageDriver  the raw `process.env.STORAGE_DRIVER`.
 * @returns the driver to use plus a human label to print, or a refusal message.
 */
export function resolveSweepDriver(
  execute: boolean,
  storageDriver: string | undefined,
): SweepDriverResolution {
  const explicit = storageDriver?.trim() ?? "";

  if (explicit === "") {
    if (execute) return { error: REFUSAL };
    return {
      driver: "local",
      label: "local (default — STORAGE_DRIVER is not set)",
    };
  }

  return { driver: explicit, label: explicit };
}
