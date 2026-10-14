/**
 * The checklist item select shared by `server/actions/checklists.ts`'s
 * `requireChecklistItemAccess` and `lib/guards.ts`'s `requireRowAccess`
 * (card C): id, trip, kind/text/done/dueDate, and the assignee resolved to a
 * Traveller (never just an id) for Activity's diff rows. Its own module so
 * either side can import it without `lib/guards.ts` reaching into
 * `server/actions`.
 */
import { TRAVELLER_SELECT } from "@/lib/traveller";

export const CHECKLIST_ITEM_ACTIVITY_SELECT = {
  id: true,
  tripId: true,
  kind: true,
  text: true,
  done: true,
  dueDate: true,
  assignedTo: { select: TRAVELLER_SELECT },
} as const;
