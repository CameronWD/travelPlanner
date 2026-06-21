/**
 * Storage abstraction for file uploads.
 *
 * Local dev (STORAGE_DRIVER unset or "local"):
 *   Files are written to `.uploads/<key>` at the repo root. The directory is
 *   git-ignored and created on demand.
 *
 * Production wiring (STORAGE_DRIVER="r2" or "s3"):
 *   Return a Storage impl that talks to your cloud bucket. Set up the bucket,
 *   credentials, and install the relevant SDK (e.g. @aws-sdk/client-s3 or the
 *   Cloudflare Workers R2 client), then replace the stub here.
 *
 *   For R2 you need:
 *     CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   For S3 you need:
 *     AWS_REGION, S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 *   The serve route at app/api/attachments/[id]/route.ts streams bytes from
 *   storage, so production needs `read()` too (or swap to signed URL redirects).
 */

import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Storage {
  /** Persist `data` under `key`. Creates intermediate directories as needed. */
  save(key: string, data: Buffer | Uint8Array, mime: string): Promise<void>;
  /** Remove the object at `key`. No-op if it doesn't exist. */
  delete(key: string): Promise<void>;
  /** Return the raw bytes for `key`, or null if not found. */
  read(key: string): Promise<Buffer | null>;
}

// ---------------------------------------------------------------------------
// Local-disk implementation (dev)
// ---------------------------------------------------------------------------

/** Absolute path to the uploads root at the repo root. */
function uploadsRoot(): string {
  // process.cwd() is the repo root in Next.js / test environments.
  return path.join(process.cwd(), ".uploads");
}

const localDiskStorage: Storage = {
  async save(key, data) {
    const dest = path.join(uploadsRoot(), key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
  },

  async delete(key) {
    const dest = path.join(uploadsRoot(), key);
    await fs.rm(dest, { force: true });
  },

  async read(key) {
    const dest = path.join(uploadsRoot(), key);
    try {
      return await fs.readFile(dest);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return null;
      }
      throw err;
    }
  },
};

// ---------------------------------------------------------------------------
// Production stub (R2 / S3)
// ---------------------------------------------------------------------------

const prodStubStorage: Storage = {
  async save() {
    throw new Error(
      "R2/S3 storage not configured — set up the bucket and credentials; see lib/storage.ts",
    );
  },
  async delete() {
    throw new Error(
      "R2/S3 storage not configured — set up the bucket and credentials; see lib/storage.ts",
    );
  },
  async read() {
    throw new Error(
      "R2/S3 storage not configured — set up the bucket and credentials; see lib/storage.ts",
    );
  },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate Storage impl based on the STORAGE_DRIVER env var.
 *   - unset / "local" → local-disk (`.uploads/`)
 *   - "r2" / "s3"     → stub that throws; wire up the real impl for production
 */
export function getStorage(): Storage {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    return localDiskStorage;
  }
  if (driver === "r2" || driver === "s3") {
    return prodStubStorage;
  }
  throw new Error(`Unknown STORAGE_DRIVER="${driver}". Use "local", "r2", or "s3".`);
}

// ---------------------------------------------------------------------------
// Pure helpers (testable, no I/O)
// ---------------------------------------------------------------------------

/** Characters that are safe to keep in a storage key path component. */
const SAFE_FILENAME_RE = /[^a-zA-Z0-9._-]/g;

/**
 * Sanitise a user-supplied filename so it's safe to embed in a storage key.
 * Strips path separators and any character outside [a-zA-Z0-9._-].
 */
export function sanitiseFilename(filename: string): string {
  // Strip any path component the client might have included.
  const base = path.basename(filename.trim());
  const sanitised = base.replace(SAFE_FILENAME_RE, "_");
  // If the sanitised result is empty or all underscores (e.g. input was "   ")
  // fall back to a safe literal.
  return sanitised.replace(/_+/g, "_").replace(/^_+$/, "") || "file";
}

/**
 * Generate a collision-resistant storage key for a new attachment.
 *
 * Shape: `trips/<tripId>/<uuid>-<safeFilename>`
 *
 * @param tripId   The trip this attachment belongs to.
 * @param uniqueId A collision-resistant id, e.g. the Attachment.id (cuid) or
 *                 crypto.randomUUID(). Do NOT pass user-supplied input here.
 * @param filename The original filename from the upload (will be sanitised).
 */
export function generateKey(
  tripId: string,
  uniqueId: string,
  filename: string,
): string {
  const safe = sanitiseFilename(filename);
  return `trips/${tripId}/${uniqueId}-${safe}`;
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

/** MIME types that are allowed for upload. */
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
]);

/** Maximum upload size: 10 MiB. */
const MAX_BYTES = 10 * 1024 * 1024;

export type ValidateUploadOk = { ok: true };
export type ValidateUploadError = { ok: false; error: string };
export type ValidateUploadResult = ValidateUploadOk | ValidateUploadError;

/**
 * Validate an upload against the MIME allowlist and size limit.
 * Pure: no I/O, fully testable.
 */
export function validateUpload(opts: {
  mime: string;
  size: number;
}): ValidateUploadResult {
  if (!ALLOWED_MIMES.has(opts.mime)) {
    return {
      ok: false,
      error: `File type "${opts.mime}" is not allowed. Accepted types: images (PNG, JPEG, WebP, GIF), PDF, plain text.`,
    };
  }
  if (opts.size > MAX_BYTES) {
    const mb = (MAX_BYTES / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      error: `File is too large. Maximum allowed size is ${mb} MB.`,
    };
  }
  return { ok: true };
}
