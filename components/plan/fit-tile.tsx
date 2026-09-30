"use client";

import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDayLabel } from "@/lib/dates";
import type { PlanSummary } from "@/lib/plan-overview";
import { fitTileModel, type FitTone } from "@/lib/plan/plan-model";
import { HardEndDateControl } from "@/components/trip/hard-end-date-control";
import { MakeItFit } from "@/components/trip/make-it-fit";
import type { FitStop } from "@/lib/make-it-fit";

const TONE: Record<FitTone, string> = {
  teal: "bg-teal text-on-accent",
  sun: "bg-sun text-on-accent",
  coral: "bg-coral text-on-accent",
  card: "bg-card",
};

/** The words split across two lines at the first space (PLAN.md §6.2). */
function WordsBreak({ words }: { words: string }) {
  const i = words.indexOf(" ");
  if (i === -1) return <>{words}</>;
  return (
    <>
      <span className="block">{words.slice(0, i)}</span>
      {words.slice(i)}
    </>
  );
}

function FitBar({ bar }: { bar: { setPct: number; roughPct: number; overPct: number } }) {
  return (
    <div className="mt-3 flex h-[18px] overflow-hidden rounded-full border-2 border-border bg-card">
      <span data-bar-set className="h-full bg-foreground" style={{ width: `${bar.setPct}%` }} />
      <span
        data-bar-rough
        className="h-full bg-[repeating-linear-gradient(135deg,hsl(var(--foreground))_0_3px,hsl(var(--card))_3px_7px)]"
        style={{ width: `${bar.roughPct}%` }}
      />
      {bar.overPct > 0 && (
        <span
          data-bar-over
          className="-mt-[18px] ml-auto block h-[18px] rounded-r-full border-2 border-l-0 border-border bg-[repeating-linear-gradient(135deg,hsl(var(--coral))_0_3px,hsl(var(--card))_3px_7px)]"
          style={{ width: `${bar.overPct}%` }}
        />
      )}
    </div>
  );
}

interface FitTileProps {
  tripId: string;
  summary: PlanSummary;
  startDate: string | null;
  fitStops: FitStop[];
  isOwner: boolean;
}

/** PLAN.md §6.2 desktop rail Fit tile: replaces PlanOverview. */
export function FitTile({ tripId, summary, startDate, fitStops, isOwner }: FitTileProps) {
  const m = fitTileModel(summary);
  const isOver = summary.hardEndState === "over";

  return (
    <section
      aria-label="Fit"
      className={cn(
        "rounded-[22px] border-2 border-border p-3.5 shadow-hard-4 transition-colors duration-[var(--dur-slow)]",
        TONE[m.tone],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {m.pill && (
          <span className="rounded-full border-2 border-border bg-card px-2.5 py-0.5 text-[11px] font-extrabold tracking-[0.08em] text-foreground">
            {m.pill}
          </span>
        )}
        {summary.hardEndDate && (
          <HardEndDateControl
            tripId={tripId}
            hardEndDate={summary.hardEndDate}
            startDate={startDate}
            label={`Home by ${formatDayLabel(summary.hardEndDate)}`}
          />
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        {m.big !== null ? (
          <>
            <span className="font-display text-[40px] font-extrabold leading-none tabular-nums xl:text-5xl">{m.big}</span>
            <span role="status" aria-live="polite" className="text-[15px] font-extrabold leading-tight">
              <WordsBreak words={m.words} />
            </span>
          </>
        ) : summary.hardEndState === "unset" ? (
          <>
            <HardEndDateControl tripId={tripId} hardEndDate={null} startDate={startDate} label="Set a home-by date" />
            <span role="status" aria-live="polite" className="sr-only">
              {m.words}
            </span>
          </>
        ) : (
          <span role="status" aria-live="polite" className="text-[15px] font-extrabold leading-tight">
            {m.words}
          </span>
        )}
      </div>

      {isOver && (
        <div className="mt-2">
          <MakeItFit tripId={tripId} stops={fitStops} anchor={startDate} hardEndDate={summary.hardEndDate} isOwner={isOwner} />
        </div>
      )}

      {m.bar && <FitBar bar={m.bar} />}

      {m.bar && (
        <div className="mt-1.5 flex justify-between text-xs font-bold">
          <span>{m.legendLeft}</span>
          {m.legendRight && <span>{m.legendRight}</span>}
        </div>
      )}
    </section>
  );
}

interface FitStripProps {
  summary: PlanSummary;
  onOpenMap?: () => void;
}

/** PLAN.md §7.1 mobile Fit strip. */
export function FitStrip({ summary, onOpenMap }: FitStripProps) {
  const m = fitTileModel(summary);
  return (
    <div className={cn("flex items-center gap-2.5 rounded-2xl border-2 border-border px-3.5 py-2.5", TONE[m.tone])}>
      {m.big !== null && (
        <span className="font-display text-[30px] font-extrabold leading-none tabular-nums">{m.big}</span>
      )}
      <span role="status" aria-live="polite" className="text-sm font-extrabold leading-tight">
        {m.words}
      </span>
      <div className="flex-1">{m.bar && <FitStripBar bar={m.bar} />}</div>
      {onOpenMap && (
        <button type="button" className="tap-target inline-flex shrink-0 items-center gap-1 text-sm font-extrabold" onClick={onOpenMap}>
          Map <Maximize2 className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function FitStripBar({ bar }: { bar: { setPct: number; roughPct: number; overPct: number } }) {
  return (
    <div className="flex h-3.5 overflow-hidden rounded-full border-2 border-border bg-card">
      <span data-bar-set className="h-full bg-foreground" style={{ width: `${bar.setPct}%` }} />
      <span
        data-bar-rough
        className="h-full bg-[repeating-linear-gradient(135deg,hsl(var(--foreground))_0_3px,hsl(var(--card))_3px_7px)]"
        style={{ width: `${bar.roughPct}%` }}
      />
      {bar.overPct > 0 && (
        <span
          data-bar-over
          className="-mt-3.5 ml-auto block h-3.5 rounded-r-full border-2 border-l-0 border-border bg-[repeating-linear-gradient(135deg,hsl(var(--coral))_0_3px,hsl(var(--card))_3px_7px)]"
          style={{ width: `${bar.overPct}%` }}
        />
      )}
    </div>
  );
}
