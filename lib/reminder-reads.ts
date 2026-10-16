import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

/**
 * A Reminder as the Home card (and a Stop card) render it: a title against a
 * calendar date. `stopId`/`stopName` are set when the Reminder is about a
 * Stop (Task 7) — `stopName` is the related Stop's name, joined at read time
 * so the Home card can render a chip without a second round trip. Both are
 * `null` (never omitted) for a Reminder about the Trip as a whole.
 */
export interface ReminderItem {
  id: string;
  title: string;
  date: string;
  stopId: string | null;
  stopName: string | null;
}

/**
 * Reminders for a trip dated on or after `fromDate`, soonest first.
 *
 * Called by the trip Home, the Checklists page, the Trips page loader and the
 * Claude connection's get_reminders. Access-checked: `requireTripAccess` is
 * the first statement. Surprise (ADR 0051): a Reminder about a Stop hidden
 * from the viewer stays in the database. A lib read (spec 2026-10-14 card
 * 3.N), no longer a published action.
 */
export async function listRemindersForTrip(tripId: string, fromDate: string): Promise<ReminderItem[]> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);

  const rows = await db.reminder.findMany({
    where: { tripId, date: { gte: fromDate }, ...v.where.reminder },
    orderBy: { date: "asc" },
    take: 20,
    select: { id: true, title: true, date: true, stopId: true, stop: { select: { name: true } } },
  });

  return rows.map((r) => ({ id: r.id, title: r.title, date: r.date, stopId: r.stopId, stopName: r.stop?.name ?? null }));
}
