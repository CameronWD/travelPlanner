/**
 * GET /api/cron/purge-trips
 *
 * Hard-deletes Trips that have sat in Recently deleted past their 30-day
 * Restore window (ADR 0067) — see lib/trip-purge.ts for the actual purge and
 * .github/workflows/purge-trips-cron.yml for the schedule.
 *
 * Auth is the same fail-closed CRON_SECRET gate as every other cron route —
 * see lib/cron-auth.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { purgeExpiredDeletedTrips } from "@/lib/trip-purge";

// Force Node.js runtime — required for Prisma (not edge-compatible)
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await purgeExpiredDeletedTrips();

  return NextResponse.json({ purged: result.purged.length });
}
