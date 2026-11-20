"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { markFlagFine, unmarkFlagFine } from "@/server/actions/flag-dismissals";

const CHIP =
  "tap-target inline-flex shrink-0 items-center rounded-md border-2 border-border bg-card px-2 py-0.5 text-xs font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

function useFlagAction(action: () => ReturnType<typeof markFlagFine>, failure: string) {
  const [isPending, startTransition] = React.useTransition();
  const run = () =>
    startTransition(async () => {
      try {
        const r = await action();
        if (!r.success) toastRefused(r, failure);
      } catch {
        toastRejected(failure);
      }
    });
  return [isPending, run] as const;
}

export interface MarkFineTarget {
  flagId: string;
  fingerprint: string;
  between: { from: string; to: string };
}

export function MarkFineButton({ tripId, target }: { tripId: string; target: MarkFineTarget }) {
  const [isPending, run] = useFlagAction(() => markFlagFine(tripId, target.flagId, target.fingerprint), "Couldn’t mark that as fine.");
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={run}
      aria-label={`This is fine: ${target.between.from} to ${target.between.to}`}
      className={CHIP}
    >
      This is fine
    </button>
  );
}

export interface MarkedFineEntry {
  flagId: string;
  message: string;
  markedByName: string;
}

function MarkedFineRow({ tripId, entry }: { tripId: string; entry: MarkedFineEntry }) {
  const [isPending, run] = useFlagAction(() => unmarkFlagFine(tripId, entry.flagId), "Couldn’t undo that.");
  return (
    <div className="flex items-start gap-2 text-[13px] font-medium">
      <div className="min-w-0 flex-1">
        <p>{entry.message}</p>
        <p className="text-xs text-muted-foreground">Marked fine by {entry.markedByName}</p>
      </div>
      <button type="button" disabled={isPending} onClick={run} className={CHIP}>
        Undo
      </button>
    </div>
  );
}

export function MarkedFineList({ tripId, entries }: { tripId: string; entries: MarkedFineEntry[] }) {
  const [open, setOpen] = React.useState(false);
  if (entries.length === 0) return null;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="tap-target flex items-center gap-1 self-start rounded text-xs font-bold text-muted-foreground hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} strokeWidth={2.5} aria-hidden />
        {entries.length} marked fine
      </button>
      {open ? entries.map((e) => <MarkedFineRow key={e.flagId} tripId={tripId} entry={e} />) : null}
    </>
  );
}
