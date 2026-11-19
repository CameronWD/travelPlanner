"use client";

import Link from "next/link";
import { startTransition, useOptimistic } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SortRow } from "@/lib/sort-these-out";
import { ReminderNotes } from "@/components/trip/reminder-notes";
import { Button } from "@/components/ui/button";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
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
        <span title={row.title} className="line-clamp-2 text-[15px] font-bold leading-snug">{row.title}</span>
        {row.subtitle ? (
          <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{row.subtitle}</span>
        ) : null}
      </span>
      {row.href ? <ChevronRight className="size-5 shrink-0" aria-hidden="true" /> : null}
    </>
  );
}

export function SortTheseOutRows({ rows, total }: { rows: SortRow[]; total: number }) {
  const [shown, hide] = useOptimistic(rows, (state, reminderId: string) => state.filter((r) => r.reminderId !== reminderId));
  const shownTotal = total - (rows.length - shown.length);

  function gotIt(reminderId: string) {
    startTransition(async () => {
      hide(reminderId);
      try {
        const r = await updateReminder(reminderId, { dismissed: true });
        if (!r.success) toastRefused(r.errors, "Couldn't dismiss that reminder.");
      } catch {
        toastRejected("Couldn't dismiss that reminder.");
      }
    });
  }

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
                  onClick={() => gotIt(row.reminderId!)}
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
