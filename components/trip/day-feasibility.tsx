"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DayHopEntry } from "@/lib/day-view-loader";
import { HopModeChooser, type HopModeChooserProps } from "@/components/trip/day/hop-mode-chooser";
import { MarkFineButton, MarkedFineList, type MarkedFineEntry } from "@/components/trip/marked-fine";

export interface DayFeasibilityEntry {
  flagId?: string;
  severity: "warning" | "info";
  message: string;
  hop?: HopModeChooserProps;
}

const TRAVEL_PHRASE = { walk: "walk", drive: "drive", transit: "by public transport" } as const;

function hopKey(h: { fromItemId: string; toItemId: string }): string {
  return `${h.fromItemId}|${h.toItemId}`;
}

function HopRow({ hop }: { hop: DayHopEntry }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-medium">
      <p className="min-w-0 flex-1">
        {hop.fromTitle} → {hop.toTitle}
        <span className="text-muted-foreground">
          {" "}
          · {hop.minutes} min {TRAVEL_PHRASE[hop.travel]}
          {hop.estimated ? " (estimated)" : ""}
        </span>
      </p>
      <HopModeChooser fromItemId={hop.fromItemId} toItemId={hop.toItemId} mode={hop.mode} modeSetByHand={hop.modeSetByHand} />
    </div>
  );
}

/**
 * Kit "heads up" card (DDays.jsx day panel: a sun Card under the plan). Text on
 * the sun island stays plain ink; the icon carries warning vs info. Flagged
 * hops and hand-set hops are always shown; the rest sit behind "All hops",
 * Marked fine ones (not in `entries`) among them.
 */
export function DayFeasibility({
  tripId,
  entries,
  markedFine = [],
  hops = [],
}: {
  tripId: string;
  entries: DayFeasibilityEntry[];
  markedFine?: MarkedFineEntry[];
  hops?: DayHopEntry[];
}) {
  const [open, setOpen] = React.useState(false);
  if (entries.length === 0 && markedFine.length === 0 && hops.length === 0) return null;

  const flagged = new Set(entries.flatMap((e) => (e.hop ? [hopKey(e.hop)] : [])));
  const handSet = hops.filter((h) => h.modeSetByHand && !flagged.has(hopKey(h)));
  const quiet = hops.filter((h) => !h.modeSetByHand && !flagged.has(hopKey(h)));

  return (
    <Card tone="sun" className="flex flex-col gap-2 px-3.5 py-3">
      <h3 className="text-label">Getting around</h3>
      {entries.map((e, i) => (
        <div key={i} className="flex items-start gap-2 text-[13px] font-medium">
          {e.severity === "warning" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} aria-label="Warning" />
          ) : (
            <Clock className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} aria-hidden />
          )}
          <p className="min-w-0 flex-1">{e.message}</p>
          {e.flagId ? <MarkFineButton tripId={tripId} flagId={e.flagId} /> : null}
          {e.hop ? <HopModeChooser {...e.hop} /> : null}
        </div>
      ))}
      <MarkedFineList tripId={tripId} entries={markedFine} />
      {handSet.map((h) => (
        <HopRow key={hopKey(h)} hop={h} />
      ))}
      {quiet.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="tap-target flex items-center gap-1 self-start rounded text-xs font-bold text-muted-foreground hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} strokeWidth={2.5} aria-hidden />
            All hops ({quiet.length})
          </button>
          {open ? quiet.map((h) => <HopRow key={hopKey(h)} hop={h} />) : null}
        </>
      ) : null}
    </Card>
  );
}
