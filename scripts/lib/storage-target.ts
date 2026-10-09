/**
 * Spec 2026-10-09: operator backfills must not read covers from this
 * machine's .uploads/ while writing to a remote (production) database.
 * Pure functions over an env object, so they are testable without
 * touching process.env.
 */

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const REMOTE_DRIVERS = new Set(["r2", "s3"]);

/** Host (and port) of a database URL, never its credentials or query. */
export function databaseHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname) return null;
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return null;
  }
}

function hostnameOnly(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function driverOf(env: Env): string {
  return REMOTE_DRIVERS.has(env.STORAGE_DRIVER ?? "") ? (env.STORAGE_DRIVER as string) : "local";
}

function describeDriver(env: Env): string {
  const driver = env.STORAGE_DRIVER;
  if (!driver || driver === "local" || driver === "r2" || driver === "s3") {
    return driverOf(env);
  }
  return `${driver} (unrecognised)`;
}

export function assertStorageMatchesDatabase(env: Env): void {
  const host = env.DATABASE_URL ? hostnameOnly(env.DATABASE_URL) : null;
  if (!host) {
    throw new Error(
      "DATABASE_URL is missing or not a valid URL. Put it in .env.production.local (scripts/load-env.ts loads that file).",
    );
  }
  if (driverOf(env) === "local" && !LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run: the database is ${databaseHost(env.DATABASE_URL)} but storage is local (STORAGE_DRIVER=${env.STORAGE_DRIVER ?? "unset"}), ` +
        "so every cover would be read from this machine's .uploads/ folder. " +
        "Add the production storage settings to .env.production.local: STORAGE_DRIVER=r2 with CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY " +
        "(or STORAGE_DRIVER=s3 with S3_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).",
    );
  }
}

export function describeTarget(env: Env, dryRun: boolean): string {
  return `Target: database ${databaseHost(env.DATABASE_URL) ?? "unknown"}, storage ${describeDriver(env)}, ${dryRun ? "DRY RUN" : "LIVE"}`;
}
