/**
 * GET /api/cron/purge-trips
 *
 * Hard-deletes Trips that have sat in Recently deleted past their 30-day
 * Restore window (ADR 0067) — see lib/trip-purge.ts for the actual purge and
 * lib/usage/purge.ts for the Usage records past 180 days, and
 * .github/workflows/purge-trips-cron.yml for the schedule.
 *
 * Auth is the same fail-closed CRON_SECRET gate as every other cron route —
 * see lib/cron-auth.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { purgeExpiredDeletedTrips } from "@/lib/trip-purge";
import { purgeOldUsage } from "@/lib/usage/purge";
import { reportError } from "@/lib/error-sink";

/** ARCH-OBS-1: the route string every reportError call from here carries. */
const ROUTE = "/api/cron/purge-trips";

// Force Node.js runtime — required for Prisma (not edge-compatible)
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await purgeExpiredDeletedTrips();
    const usagePurged = await purgeOldUsage().catch(async (err) => {
      await reportError(err, { route: ROUTE, source: "server" });
      return null;
    });
    return NextResponse.json({ purged: result.purged.length, usagePurged });
  } catch (err) {
    await reportError(err, { route: ROUTE, source: "server" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
