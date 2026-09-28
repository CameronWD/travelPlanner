"use client";

import * as React from "react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import type { TravelStats } from "@/lib/travel-stats";
import { tallyFor, defaultTallyMode, effectiveTallyMode, formatKm, TALLY_MODE_KEY, type TallyMode } from "@/lib/trips/tally";
import { cn } from "@/lib/cn";

function readSaved(): TallyMode | null {
  try {
    const v = window.localStorage.getItem(TALLY_MODE_KEY);
    return v === "planned" || v === "been" ? v : null;
  } catch {
    return null;
  }
}

function useTallyMode(hasDoneTrip: boolean): [TallyMode, (m: TallyMode) => void] {
  const [mode, setMode] = React.useState<TallyMode>(() => defaultTallyMode(hasDoneTrip));
  React.useEffect(() => {
    // Async IIFE — state lands asynchronously rather than synchronously in
    // the effect body (react-hooks/set-state-in-effect). The read itself is
    // synchronous (localStorage); this only defers the setState call.
    void (async () => {
      const saved = readSaved();
      if (saved) setMode(saved);
    })();
  }, []);
  const set = (m: TallyMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(TALLY_MODE_KEY, m);
    } catch {
      /* private mode */
    }
  };
  return [mode, set];
}

export interface TallyProps {
  stats: TravelStats;
  hasDoneTrip: boolean;
}

/** Desktop Tally (TRIPS_PAGE.md §6): sun card, Planned | Been toggle, headline, stats grid. */
export function TallyCard({ stats, hasDoneTrip }: TallyProps) {
  const [mode, setMode] = useTallyMode(hasDoneTrip);
  const effective = effectiveTallyMode(stats, mode);
  const t = tallyFor(stats, effective);
  const doneCount = stats.countries.done.length;
  const plannedCount = stats.countries.planned.length;
  return (
    <section aria-label="Tally" className="tally-card island flex h-full min-h-0 flex-col rounded-[24px] border-2 border-border bg-sun px-[22px] py-5 shadow-hard-3">
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap shrink-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-on-accent-muted">Tally</span>
        <Segmented
          type="single"
          value={effective}
          onValueChange={(v) => v && setMode(v as TallyMode)}
          tone="ink"
          aria-label="Tally mode"
          className="gap-0 p-0 [&>button]:h-auto [&>button]:min-w-0 [&>button]:px-2.5 [&>button]:py-1 [&>button]:text-[12px]"
        >
          <SegmentedItem value="planned" disabled={plannedCount === 0}>Planned</SegmentedItem>
          <SegmentedItem value="been" disabled={doneCount === 0}>Been</SegmentedItem>
        </Segmented>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2.5">
        <span className="font-display text-[56px] font-extrabold leading-[0.9] tracking-[-0.04em]">{t.countries === 0 ? "—" : t.countries}</span>
        <span className="whitespace-pre-line font-display text-[20px] font-extrabold leading-[1.02]">{`${t.headline[0]}\n${t.headline[1]}`}</span>
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-x-4 border-t-2 border-border">
        {t.cells.map((c, i) => (
          <div key={c.key} className={cn("border-b-2 border-border/20 py-2", i >= 4 && "tally-cell-extra")}>
            <dd className="font-display text-[20px] font-extrabold leading-[1.1]">{c.value}</dd>
            <dt className="text-[13px] font-semibold text-on-accent-muted">{c.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Mobile tally strip (TRIPS_PAGE.md §8.5): countries, nights, km; no toggle. */
export function TallyStrip({ stats, hasDoneTrip }: TallyProps) {
  const mode = effectiveTallyMode(stats, defaultTallyMode(hasDoneTrip));
  const k = mode === "been" ? "done" : "planned";
  const countries = stats.countries[k].length;
  const cells = [
    { v: countries === 0 ? "—" : String(countries), l: "countries" },
    { v: String(stats.nightsAway[k]), l: "nights" },
    { v: formatKm(stats.distanceKm[k], true), l: mode },
  ];
  return (
    <section aria-label="Tally" className="island grid grid-cols-3 rounded-[22px] border-2 border-border bg-sun px-4 py-3.5 shadow-hard-2">
      {cells.map((c) => (
        <div key={c.l}>
          <div className="font-display text-[22px] font-extrabold leading-none">{c.v}</div>
          <div className="mt-1 text-[12px] font-semibold text-on-accent-muted">{c.l}</div>
        </div>
      ))}
    </section>
  );
}
