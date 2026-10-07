import { db } from "@/lib/db";
import { notifyStorageCeiling } from "@/lib/storage-ceiling-notice";

/** Spec 2026-10-02 §B. Covers and profile photos are one-per-owner and 10 MiB-capped,
 *  so Attachments (files, Item photos, Journal photos) are the only unbounded uploads
 *  and the only rows counted. A Trip in Recently deleted still counts: its files exist. */
export const TRIP_QUOTA_BYTES = 500 * 1024 * 1024;
export const GLOBAL_QUOTA_BYTES = 8 * 1024 * 1024 * 1024;

const QUOTA_MESSAGES = {
  trip: "This Trip has used its 500 MB of file storage. Delete some files to add more.",
  global: "Teepee's file storage is full. Cam has been told.",
} as const;

export class QuotaExceeded extends Error {
  constructor(public readonly scope: "trip" | "global") {
    super(QUOTA_MESSAGES[scope]);
    this.name = "QuotaExceeded";
  }
}

export async function tripStorageUsed(tripId: string): Promise<number> {
  const r = await db.attachment.aggregate({ _sum: { size: true }, where: { tripId } });
  return r._sum.size ?? 0;
}

async function globalStorageUsed(): Promise<number> {
  const r = await db.attachment.aggregate({ _sum: { size: true } });
  return r._sum.size ?? 0;
}

/** Throws QuotaExceeded when `size` more bytes would exceed a cap. Reads only. */
export async function assertQuota(opts: { tripId?: string | null; size: number }): Promise<void> {
  if (opts.tripId) {
    const used = await tripStorageUsed(opts.tripId);
    if (used + opts.size > TRIP_QUOTA_BYTES) throw new QuotaExceeded("trip");
  }
  const total = await globalStorageUsed();
  if (total + opts.size > GLOBAL_QUOTA_BYTES) throw new QuotaExceeded("global");
}

/**
 * The repeated call-site shape for every upload action (cover, profile
 * photo, item photo, globe/trip attachment): check the quota, and on a
 * global-scope refusal, tell the admins (lib/storage-ceiling-notice.ts) —
 * awaited, not fire-and-forget, so a lost push can't be silently suppressed
 * for 24 h (see that module's docblock). Any non-quota error rethrows so the
 * caller's normal error handling (reportError, etc.) still sees it.
 */
export async function checkQuota(
  opts: { tripId?: string | null; size: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertQuota(opts);
    return { ok: true };
  } catch (e) {
    if (e instanceof QuotaExceeded) {
      if (e.scope === "global") await notifyStorageCeiling();
      return { ok: false, error: e.message };
    }
    throw e;
  }
}
