import * as React from "react";
import {
  Clock,
  ArrowRight,
  LogIn,
  LogOut,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CategoryPill } from "./category-pill";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type {
  DayPlan,
  TransportDepartureEntry,
  TransportArrivalEntry,
  AccommodationCheckinEntry,
  AccommodationCheckoutEntry,
  ItemEntry,
} from "@/lib/itinerary";
import type { Category } from "@/lib/categories";
import type { TransportMode } from "@/lib/enums";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimelineProps {
  day: DayPlan;
  /**
   * "agenda" — compact one-liner rows suitable for the calendar overview.
   * "day"    — detailed rows with more whitespace and metadata.
   */
  variant?: "agenda" | "day";
}

// ---------------------------------------------------------------------------
// Timeline component
// ---------------------------------------------------------------------------

export function Timeline({ day, variant = "agenda" }: TimelineProps) {
  const isDay = variant === "day";

  const hasAnything =
    day.timedItems.length > 0 ||
    day.untimedItems.length > 0 ||
    day.transportEntries.length > 0 ||
    day.accommodationEntries.length > 0;

  if (!hasAnything) {
    return (
      <p className="py-2 text-sm text-muted-foreground italic">
        Nothing planned
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col", isDay ? "gap-3" : "gap-1.5")}>
      {/* Accommodation check-ins (shown first as they set the context) */}
      {day.accommodationEntries
        .filter((e) => e.kind === "accommodation-checkin")
        .map((e) => (
          <AccomCheckinRow key={`ci-${e.accommodation.id}`} entry={e} isDay={isDay} />
        ))}

      {/* Timed entries: transport departures/arrivals interleaved with timed items */}
      {/* We render them in two groups — transport first for departure context, then timed items */}
      {day.transportEntries.map((e) => (
        <TransportRow key={`tr-${e.transport.id}-${e.kind}`} entry={e} isDay={isDay} />
      ))}

      {day.timedItems.map((e) => (
        <TimedItemRow key={`ti-${e.item.id}`} entry={e} isDay={isDay} />
      ))}

      {/* Accommodation check-outs */}
      {day.accommodationEntries
        .filter((e) => e.kind === "accommodation-checkout")
        .map((e) => (
          <AccomCheckoutRow key={`co-${e.accommodation.id}`} entry={e} isDay={isDay} />
        ))}

      {/* Untimed items */}
      {day.untimedItems.length > 0 && (
        <div className={cn("flex flex-col", isDay ? "gap-2 mt-1" : "gap-1")}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mt-1">
            Anytime
          </p>
          {day.untimedItems.map((e) => (
            <UntimedItemRow key={`ui-${e.item.id}`} entry={e} isDay={isDay} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row sub-components
// ---------------------------------------------------------------------------

function TimeGutter({
  time,
  isDay,
}: {
  time?: string | null;
  isDay: boolean;
}) {
  if (!isDay) return null;
  return (
    <span className="w-11 shrink-0 text-right text-[11px] font-mono text-muted-foreground/80 leading-tight pt-0.5">
      {time ?? ""}
    </span>
  );
}

function TransportRow({
  entry,
  isDay,
}: {
  entry: TransportDepartureEntry | TransportArrivalEntry;
  isDay: boolean;
}) {
  const t = entry.transport;
  const meta = TRANSPORT_MODE_META[t.mode as TransportMode];
  const Icon = meta?.icon;

  const isDep = entry.kind === "transport-departure";
  const depEntry = isDep ? (entry as TransportDepartureEntry) : null;
  const arrEntry = !isDep ? (entry as TransportArrivalEntry) : null;

  const fromLabel = t.depPlace ?? null;
  const toLabel = t.arrPlace ?? null;

  // Time to show in the gutter: departure time for dep rows, arrival time for arr rows
  const gutterTime = isDep
    ? (depEntry?.depTimeLabel ?? null)
    : (arrEntry?.arrTimeLabel ?? null);

  // For same-day trips, show "dep → arr" inline
  const sameDay = depEntry?.arrivesSameDay && depEntry?.arrTimeLabel;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg px-2 py-1.5",
        isDay
          ? "bg-primary/5 border border-primary/10"
          : "bg-transparent",
      )}
    >
      <TimeGutter time={gutterTime} isDay={isDay} />

      {/* Mode icon */}
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        {Icon && (
          <Icon
            className={cn(
              "size-4",
              isDep ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1 text-sm leading-tight">
          <span
            className={cn(
              "font-medium",
              isDep ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {isDep ? "Departs" : "Arrives"} — {meta?.label ?? t.mode}
          </span>
          {t.reference && (
            <span className="rounded bg-muted px-1 py-0 text-[11px] font-mono text-muted-foreground">
              {t.reference}
            </span>
          )}
          {/* Same-day time summary: "08:24 → 11:47" */}
          {sameDay && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {depEntry!.depTimeLabel} → {depEntry!.arrTimeLabel}
            </span>
          )}
        </div>

        {/* From → To */}
        {(fromLabel || toLabel) && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            {fromLabel && <span>{fromLabel}</span>}
            {fromLabel && toLabel && (
              <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
            )}
            {toLabel && <span>{toLabel}</span>}
          </div>
        )}

        {/* Multi-day notice */}
        {isDep && depEntry && !depEntry.arrivesSameDay && depEntry.arrivalDateISO && (
          <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
            Arrives {depEntry.arrivalDateISO}
          </p>
        )}
      </div>
    </div>
  );
}

function TimedItemRow({
  entry,
  isDay,
}: {
  entry: ItemEntry;
  isDay: boolean;
}) {
  const { item } = entry;
  const timeLabel = item.endTime
    ? `${item.startTime} – ${item.endTime}`
    : item.startTime;

  return (
    <div className="flex items-start gap-2 px-2 py-1">
      <TimeGutter time={item.startTime} isDay={isDay} />

      <Clock
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50"
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium leading-tight text-foreground">
            {item.title}
          </span>
          {!isDay && timeLabel && (
            <span className="text-[11px] text-muted-foreground">{timeLabel}</span>
          )}
        </div>
        {isDay && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <CategoryPill category={item.category as Category} size="sm" />
            {timeLabel && (
              <span className="text-xs text-muted-foreground">{timeLabel}</span>
            )}
          </div>
        )}
        {!isDay && (
          <CategoryPill category={item.category as Category} size="sm" />
        )}
      </div>
    </div>
  );
}

function UntimedItemRow({
  entry,
  isDay,
}: {
  entry: ItemEntry;
  isDay: boolean;
}) {
  const { item } = entry;
  return (
    <div className="flex items-start gap-2 px-2 py-0.5">
      <TimeGutter time={null} isDay={isDay} />
      <div className="h-1.5 w-1.5 mt-2 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground/80">{item.title}</span>
          <CategoryPill category={item.category as Category} size="sm" />
        </div>
        {isDay && item.address && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.address}</p>
        )}
      </div>
    </div>
  );
}

function AccomCheckinRow({
  entry,
  isDay,
}: {
  entry: AccommodationCheckinEntry;
  isDay: boolean;
}) {
  const { accommodation: a } = entry;
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-lg",
        isDay ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/30" : "",
      )}
    >
      <TimeGutter time={null} isDay={isDay} />
      <LogIn
        className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">
          Check-in — {a.name}
        </span>
        {isDay && a.confirmation && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Hash className="size-3 shrink-0" aria-hidden="true" />
            {a.confirmation}
          </p>
        )}
      </div>
    </div>
  );
}

function AccomCheckoutRow({
  entry,
  isDay,
}: {
  entry: AccommodationCheckoutEntry;
  isDay: boolean;
}) {
  const { accommodation: a } = entry;
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-lg",
        isDay ? "bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/30" : "",
      )}
    >
      <TimeGutter time={null} isDay={isDay} />
      <LogOut
        className="size-4 shrink-0 text-rose-600 dark:text-rose-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">
          Check-out — {a.name}
        </span>
      </div>
    </div>
  );
}
