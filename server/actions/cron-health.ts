"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { isDispatcherUnhealthy } from "@/lib/cron-health";
import { reportError } from "@/lib/error-sink";

// Named ...Data so it does not collide with the DispatcherHealth *component*,
// which app/(app)/account/page.tsx imports alongside it (CD-15).
export interface DispatcherHealthData {
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
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
export async function getDispatcherHealth(): Promise<DispatcherHealthData> {
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
  let row: { lastRunAt: Date; lastSuccessAt: Date | null } | null;
  try {
    row = await db.cronHeartbeat.findUnique({
      where: { id: "digest" },
      select: { lastRunAt: true, lastSuccessAt: true },
    });
  } catch (err) {
    await reportError(err, {
      route: "server/actions/cron-health.ts#getDispatcherHealth",
      source: "server",
    });
    return { lastRunAt: null, lastSuccessAt: null, stale: true };
  }

  const lastRunAt = row?.lastRunAt ?? null;
  const lastSuccessAt = row?.lastSuccessAt ?? null;
  return {
    lastRunAt,
    lastSuccessAt,
    stale: isDispatcherUnhealthy(lastRunAt, lastSuccessAt, new Date()),
  };
}
