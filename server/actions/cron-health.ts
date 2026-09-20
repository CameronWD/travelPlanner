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
  const row = await db.cronHeartbeat.findUnique({ where: { id: "digest" } });
  const lastRunAt = row?.lastRunAt ?? null;
  return { lastRunAt, stale: isDispatcherStale(lastRunAt, new Date()) };
}
