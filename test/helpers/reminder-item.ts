import type { ReminderItem } from "@/lib/reminder-about";

/** A ReminderItem fixture: about the Trip as a whole, no notes, unless overridden. */
export function reminderItem(over: Pick<ReminderItem, "id" | "title" | "date"> & Partial<ReminderItem>): ReminderItem {
  return { notes: null, stopId: null, stopName: null, itemId: null, itemTitle: null, transportId: null, transportLabel: null, ...over };
}
