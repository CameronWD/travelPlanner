"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SortRow } from "@/lib/sort-these-out";
import { ReminderNotes } from "@/components/trip/reminder-notes";
import { ROW_NAME_CLASS } from "@/components/ui/row-text";
import { Button } from "@/components/ui/button";
import { useUndoableAction } from "@/components/ui/use-undoable-action";
import { updateReminder } from "@/server/actions/reminders";
import { ICONS, TONES } from "@/components/trip/home/desktop/sort-row-style";

function RowBody({ row }: { row: SortRow }) {
  const Icon = ICONS[row.icon];
  return (
    <>
      <span
        data-sort-tile
        aria-hidden="true"
        className={cn(
          "island grid size-10 shrink-0 place-items-center rounded-[12px] border-2 border-border",
          TONES[row.tone],
        )}
      >
        <Icon className="size-5" strokeWidth={2.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span title={row.title} className={cn(ROW_NAME_CLASS, "text-[15px] font-bold leading-snug")}>{row.title}</span>
        {row.subtitle ? (
          <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{row.subtitle}</span>
        ) : null}
      </span>
      {row.href ? <ChevronRight className="size-5 shrink-0" aria-hidden="true" /> : null}
    </>
  );
}

export function SortTheseOutRows({ rows, total }: { rows: SortRow[]; total: number }) {
  // Held here, not in the row: the row leaves at once, and its Undo comes
  // from the toast after the server's rows no longer have it.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const hideId = (id: string) => setGone((prev) => new Set(prev).add(id));
  const showId = (id: string) => setGone((prev) => new Set([...prev].filter((x) => x !== id)));
  const gotIt = useUndoableAction<{ reminderId: string; title: string }>({
    apply: (r) => hideId(r.reminderId),
    persist: (r) => updateReminder(r.reminderId, { dismissed: true }),
    revert: (r) => showId(r.reminderId),
    undo: (r) => updateReminder(r.reminderId, { dismissed: false }),
    applyUndo: (r) => showId(r.reminderId),
    revertUndo: (r) => hideId(r.reminderId),
    done: (r) => ({ title: "Dismissed", description: r.title }),
    failure: "Couldn't dismiss that reminder.",
  });
  const shown = rows.filter((r) => !r.reminderId || !gone.has(r.reminderId));
  const shownTotal = total - (rows.length - shown.length);

  return (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em]">Sort these out</h2>
        {shownTotal > 0 ? (
          <span
            aria-label={`${shownTotal} ${shownTotal === 1 ? "thing" : "things"} to sort out`}
            className="island grid h-[26px] min-w-[26px] place-items-center rounded-full border-2 border-border bg-coral px-1.5 text-xs font-extrabold"
          >
            {shownTotal}
          </span>
        ) : null}
      </div>
      <ul className="flex min-h-0 flex-col overflow-y-auto">
        {shown.map((row) => (
          <li key={row.id} className="border-t-2 border-border-soft">
            <div className="flex items-center gap-2">
              {row.href ? (
                <Link
                  href={row.href}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3.5 rounded-md py-2.5 hover:bg-muted/40"
                >
                  <RowBody row={row} />
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3.5 py-2.5">
                  <RowBody row={row} />
                </div>
              )}
              {row.reminderId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void gotIt.run({ reminderId: row.reminderId!, title: row.title })}
                >
                  Got it
                  <span className="sr-only">: {row.title}</span>
                </Button>
              ) : null}
            </div>
            {row.notes ? <div className="pb-2 pl-[54px]"><ReminderNotes notes={row.notes} /></div> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
