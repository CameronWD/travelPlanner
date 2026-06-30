"use client";

import * as React from "react";
import Link from "next/link";
import { LogIn, LogOut, Navigation } from "lucide-react";
import { cn } from "@/lib/cn";
import { buildMonthGrid, MONTH_GRID_WEEKDAYS } from "@/lib/month-grid";
import { parseISODate } from "@/lib/dates";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type { TransportMode } from "@/lib/enums";
import type { DayPlan } from "@/lib/itinerary";
import { PACKED_DAY_THRESHOLD } from "@/lib/flags";

/** Subtle left-border colour per stop, keyed by stop.sortOrder (purge-safe static strings). */
const STOP_BAND_CLASSES = [
  "border-l-sky-400",
  "border-l-amber-400",
  "border-l-emerald-400",
  "border-l-violet-400",
  "border-l-rose-400",
  "border-l-teal-400",
];


export interface MonthGridProps {
  tripId: string;
  monthAnchorISO: string;
  days: DayPlan[];
  tripStart: string;
  tripEnd: string;
  /** When provided, day cells accept dropped items (the drag source is the wishlist rail, not the cell). */
  onDropItem?: (itemId: string, dateISO: string) => void;
}

export function MonthGrid({
  tripId,
  monthAnchorISO,
  days,
  tripStart,
  tripEnd,
  onDropItem,
}: MonthGridProps) {
  const weeks = React.useMemo(() => buildMonthGrid(monthAnchorISO), [monthAnchorISO]);
  const byDate = React.useMemo(
    () => new Map(days.map((d) => [d.dateISO, d] as const)),
    [days],
  );
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  const inWindow = (dateISO: string) => dateISO >= tripStart && dateISO <= tripEnd;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {MONTH_GRID_WEEKDAYS.map((wd) => (
          <div key={wd} className="px-1 py-2">
            {wd}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7">
        {weeks.flat().map((cell) => {
          const active = cell.inMonth && inWindow(cell.dateISO);
          // Only surface itinerary content on active (in-month, in-window) cells —
          // padding/out-of-window cells stay dimmed and empty but for the day number.
          const day = active ? byDate.get(cell.dateISO) : undefined;
          const dayNum = parseISODate(cell.dateISO).getUTCDate();
          const bandClass =
            active && day?.stop
              ? STOP_BAND_CLASSES[day.stop.sortOrder % STOP_BAND_CLASSES.length]
              : "border-l-transparent";

          const timed = day?.timedItems ?? [];
          const untimed = day?.untimedItems ?? [];
          const allItems = [...timed, ...untimed];
          const packed = timed.length > PACKED_DAY_THRESHOLD;

          const itemCount = allItems.length;

          const cellInner = (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    active ? "text-foreground" : "text-muted-foreground/40",
                  )}
                >
                  {dayNum}
                </span>
                <span className="flex items-center gap-0.5">
                  {day?.transportEntries.map((t) => {
                    const Icon = TRANSPORT_MODE_META[t.transport.mode as TransportMode]?.icon ?? Navigation;
                    return (
                      <Icon
                        key={`${t.kind}-${t.transport.id}`}
                        className="size-3 text-muted-foreground"
                        aria-hidden="true"
                      />
                    );
                  })}
                  {day?.accommodationEntries.map((a) =>
                    a.kind === "accommodation-checkin" ? (
                      <LogIn key={`in-${a.accommodation.id}`} className="size-3 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <LogOut key={`out-${a.accommodation.id}`} className="size-3 text-rose-600" aria-hidden="true" />
                    ),
                  )}
                  {packed && (
                    <span
                      className="size-1.5 rounded-full bg-amber-500"
                      title="Busy day"
                      aria-label="Busy day"
                    />
                  )}
                </span>
              </div>

              {day?.stop ? (
                <div className="flex flex-1 flex-col items-center justify-center px-0.5 text-center">
                  <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground">
                    {day.stop.name}
                  </span>
                  {day.stop.country && (
                    <span className="truncate text-[11px] leading-tight text-muted-foreground">
                      {day.stop.country}
                    </span>
                  )}
                  {itemCount > 0 && (
                    <span className="mt-0.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      +{itemCount} {itemCount === 1 ? "thing" : "things"}
                    </span>
                  )}
                </div>
              ) : itemCount > 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    +{itemCount} {itemCount === 1 ? "thing" : "things"}
                  </span>
                </div>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          );

          const cellClasses = cn(
            "min-h-28 border-b border-r border-border border-l-2 p-1.5 transition-colors md:min-h-20",
            bandClass,
            !active && "bg-muted/20",
            active && onDropItem && dragOver === cell.dateISO && "bg-primary/10 ring-1 ring-inset ring-primary",
          );

          // Drop handlers (only when interactive AND the day is in-window)
          const dropProps =
            onDropItem && active
              ? {
                  onDragOver: (e: React.DragEvent) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOver(cell.dateISO);
                  },
                  onDragLeave: () => setDragOver((d) => (d === cell.dateISO ? null : d)),
                  onDrop: (e: React.DragEvent) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData("text/item-id");
                    if (id) onDropItem(id, cell.dateISO);
                  },
                }
              : {};

          if (active) {
            return (
              <div key={cell.dateISO} className={cellClasses} {...dropProps}>
                <Link
                  href={`/trips/${tripId}/day/${cell.dateISO}`}
                  className="block h-full focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                >
                  {cellInner}
                </Link>
              </div>
            );
          }

          return (
            <div key={cell.dateISO} className={cellClasses} role="presentation">
              {cellInner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
