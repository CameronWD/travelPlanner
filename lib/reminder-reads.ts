import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { loadSurpriseVisibility, type SurpriseVisibility } from "@/lib/surprise-visibility";
import { REMINDER_ITEM_SELECT, toReminderItem, type ReminderItem } from "@/lib/reminder-about";

export type { ReminderItem } from "@/lib/reminder-about";

/**
 * Reminders for a trip dated on or after `fromDate`, soonest first.
 *
 * Called by the trip Home, the Checklists page, the Trips page loader and the
 * Claude connection's get_reminders. Access-checked: `requireTripAccess` is
 * the first statement. Surprise (ADR 0051, spec F8): a Reminder about a Stop
 * or Item hidden from the viewer stays in the database. A lib read (spec
 * 2026-10-14 card 3.N), no longer a published action.
 */
export async function listRemindersForTrip(tripId: string, fromDate: string): Promise<ReminderItem[]> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);

  const rows = await db.reminder.findMany({
    where: { tripId, date: { gte: fromDate }, ...v.where.reminder },
    orderBy: { date: "asc" },
    take: 20,
    select: REMINDER_ITEM_SELECT,
  });
  return rows.map(toReminderItem);
}

/** Every Reminder about a Stop, Item or Transport leg, grouped by the thing (spec F8: the thing's card lists it). */
export interface RemindersAbout {
  byStopId: Map<string, ReminderItem[]>;
  byItemId: Map<string, ReminderItem[]>;
  byTransportId: Map<string, ReminderItem[]>;
}

/**
 * The plan editor's card lists: every Reminder about a thing, whatever its
 * date (unlike the "upcoming" feed above), soonest first. The page passes the
 * Surprise visibility it already loaded for this viewer (readPlan's) so the
 * pre-query isn't run twice; access is still checked first (memoised).
 */
export async function readRemindersAbout(tripId: string, v: SurpriseVisibility): Promise<RemindersAbout> {
  await requireTripAccess(tripId);
  const rows = await db.reminder.findMany({
    where: {
      tripId,
      OR: [{ stopId: { not: null } }, { itemId: { not: null } }, { transportId: { not: null } }],
      ...v.where.reminder,
    },
    orderBy: { date: "asc" },
    select: REMINDER_ITEM_SELECT,
  });
  const out: RemindersAbout = { byStopId: new Map(), byItemId: new Map(), byTransportId: new Map() };
  const push = (m: Map<string, ReminderItem[]>, id: string, r: ReminderItem) => m.set(id, [...(m.get(id) ?? []), r]);
  for (const r of rows.map(toReminderItem)) {
    if (r.stopId) push(out.byStopId, r.stopId, r);
    else if (r.itemId) push(out.byItemId, r.itemId, r);
    else if (r.transportId) push(out.byTransportId, r.transportId, r);
  }
  return out;
}
