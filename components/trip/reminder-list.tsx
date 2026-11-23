"use client";

import { useState } from "react";
import { Bell, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddReminderDialog } from "@/components/trip/add-reminder-dialog";
import { ReminderNotes } from "@/components/trip/reminder-notes";
import { toastRefused } from "@/components/ui/action-failure";
import { useServerAction } from "@/components/ui/use-server-action";
import { updateReminder } from "@/server/actions/reminders";
import { formatDayLabel } from "@/lib/dates";
import type { ReminderItem } from "@/lib/reminder-about";

/**
 * The Reminders about one thing — a Stop, a thing to do or a Transport leg
 * (spec F8: "the thing's card lists the Reminder"). Notes fold (ReminderNotes).
 * Every row can be edited or deleted (spec 2026-11-18 P4); a Reminder flagged
 * `past` sits under "Earlier", dimmed. Every button is type="button" so none
 * submits the Item or Transport form this sits inside.
 */
export function ReminderList({ reminders, onAdd }: { reminders: ReminderItem[]; onAdd?: () => void }) {
  const [editing, setEditing] = useState<ReminderItem | null>(null);
  const [bringingBackId, setBringingBackId] = useState<string | null>(null);
  const dismissal = useServerAction(
    (...[id, dismissed]: [string, boolean]) => updateReminder(id, { dismissed }),
    { onError: (errors) => toastRefused(errors, "Couldn’t bring that reminder back.") },
  );

  const upcoming = reminders.filter((r) => !r.past);
  const earlier = reminders.filter((r) => r.past);

  const row = (r: ReminderItem) => (
    <li key={r.id} className={r.past || r.dismissed ? "flex flex-col text-sm opacity-60" : "flex flex-col text-sm"}>
      <div className="flex items-center gap-2">
        <Bell className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words text-foreground">{r.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDayLabel(r.date)}</span>
        {r.dismissed && (
          <>
            <span className="shrink-0 text-xs font-bold text-muted-foreground">Dismissed</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2"
              disabled={(dismissal.isPending && bringingBackId !== r.id) || undefined}
              loading={dismissal.isPending && bringingBackId === r.id}
              aria-label={`Bring back reminder: ${r.title}`}
              onClick={() => {
                setBringingBackId(r.id);
                dismissal.run(r.id, false);
              }}
            >
              Bring back
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`Edit reminder: ${r.title}`}
          onClick={() => setEditing(r)}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      {r.notes && <div className="pl-5.5"><ReminderNotes notes={r.notes} /></div>}
    </li>
  );

  return (
    <div className="flex flex-col gap-2">
      {upcoming.length > 0 && (
        <ul aria-label="Reminders" className="flex flex-col gap-1">
          {upcoming.map(row)}
        </ul>
      )}
      {earlier.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-extrabold text-muted-foreground">Earlier</h4>
          <ul aria-label="Earlier reminders" className="flex flex-col gap-1">
            {earlier.map(row)}
          </ul>
        </div>
      )}
      {onAdd && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAdd}>
          <Bell className="size-3.5" aria-hidden="true" />
          Add a reminder
        </Button>
      )}
      {/* The dialog's own <form> submits through the React tree: without this its submit bubbles into the Item or Transport form this list sits in. */}
      <div onSubmit={(e) => e.stopPropagation()}>
        {editing && (
          <AddReminderDialog
            key={editing.id}
            reminder={editing}
            open
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
