"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReminderNotes } from "@/components/trip/reminder-notes";
import { formatDayLabel } from "@/lib/dates";
import type { ReminderItem } from "@/lib/reminder-about";

/**
 * The Reminders about one thing — a Stop, a thing to do or a Transport leg
 * (spec F8: "the thing's card lists the Reminder"). Notes fold (ReminderNotes).
 * "Add a reminder" is a plain button (type="button") so it never submits the
 * Item or Transport form it sits inside.
 */
export function ReminderList({ reminders, onAdd }: { reminders: ReminderItem[]; onAdd?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {reminders.length > 0 && (
        <ul aria-label="Reminders" className="flex flex-col gap-1">
          {reminders.map((r) => (
            <li key={r.id} className="flex flex-col text-sm">
              <div className="flex items-center gap-2">
                <Bell className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words text-foreground">{r.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDayLabel(r.date)}</span>
              </div>
              {r.notes && <div className="pl-5.5"><ReminderNotes notes={r.notes} /></div>}
            </li>
          ))}
        </ul>
      )}
      {onAdd && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAdd}>
          <Bell className="size-3.5" aria-hidden="true" />
          Add a reminder
        </Button>
      )}
    </div>
  );
}
