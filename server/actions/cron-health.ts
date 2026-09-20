"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { isDispatcherStale } from "@/lib/cron-health";

export interface DispatcherHealth {
  lastRunAt: Date | null;
  stale: boolean;
}

/**
 * When the Digest dispatcher last ran.
 *
 * Visible to any signed-in Traveller, not just an Admin: the person who
 * notices their Digests stopped is the one who needs the explanation, and
 * making it operator-only means the symptom and its cause live on different
 * screens.
 */
export async function getDispatcherHealth(): Promise<DispatcherHealth> {
  await requireUser();

  // The write above (in app/api/cron/digest/route.ts) is deliberately
  // best-effort; this read must be too. Production is protected from a
  // missing `CronHeartbeat` table by vercel.json's build-time
  // `migrate deploy`, but that only runs when VERCEL_ENV=production — a
  // preview deploy or any non-Vercel host has no such guarantee. Without
  // this guard a missing table throws here, and AccountPage's Promise.all
  // takes the whole Devices list down with it — exactly the panel a
  // Traveller is on when trying to work out why their Digests stopped.
  // "Never run" (stale: true, lastRunAt: null) is the honest answer to give
  // instead of a crash.
  let row: { lastRunAt: Date } | null;
  try {
    row = await db.cronHeartbeat.findUnique({ where: { id: "digest" } });
  } catch (err) {
    console.error("[cron-health] failed to read the dispatcher heartbeat:", err);
    return { lastRunAt: null, stale: true };
  }

  const lastRunAt = row?.lastRunAt ?? null;
  return { lastRunAt, stale: isDispatcherStale(lastRunAt, new Date()) };
}
