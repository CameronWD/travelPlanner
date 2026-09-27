/**
 * Day titles — server-side loader (db, no React). Keeps `lib/day-titles.ts`
 * pure; every route/component loader that needs Day titles for a set of
 * Stops (the plan, the Day page, the Days calendar, Home Today, the Share
 * page) calls this instead of repeating its own
 * `db.dayTitle.findMany` + `titlesByDate` pair.
 */

import { db } from "@/lib/db";
import { titlesByDate, type StopSpan } from "@/lib/day-titles";

/**
 * Resolve every Day title for `stops` into one dateISO → title map (ADR 0049:
 * a Changeover date carries at most one title, resolved by `titlesByDate`).
 * Empty `stops` short-circuits without a query — there is nothing to load
 * for a date-less trip, and a gated caller (e.g. the Share page's
 * `includeDailyPlans` dial) should skip calling this at all rather than rely
 * on an empty `stops` array to suppress the query.
 */
export async function loadDayTitles(
  stops: StopSpan[],
): Promise<Map<string, { title: string; stopId: string }>> {
  if (stops.length === 0) return new Map();

  const rows = await db.dayTitle.findMany({
    where: { stopId: { in: stops.map((s) => s.id) } },
    select: { stopId: true, dayIndex: true, title: true },
  });
  return titlesByDate(stops, rows);
}
