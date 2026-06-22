"use client";

import * as React from "react";
import Link from "next/link";
import { LogIn, LogOut, Navigation } from "lucide-react";
import { cn } from "@/lib/cn";
import { categoryDotClass } from "@/components/trip/category-dot";
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

const MAX_VISIBLE_ITEMS = 3;

export interface MonthGridProps {
  tripId: string;
  monthAnchorISO: string;
  days: DayPlan[];
  tripStart: string;
  tripEnd: string;
  /** When provided, item chips are draggable and day cells accept drops. */
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
          const visible = allItems.slice(0, MAX_VISIBLE_ITEMS);
          const overflow = allItems.length - visible.length;
          const packed = timed.length > PACKED_DAY_THRESHOLD;

          const cellInner = (
            <>
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

              <ul className="mt-1 flex flex-col gap-0.5">
                {visible.map((entry) => (
                  <li
                    key={entry.item.id}
                    draggable={Boolean(onDropItem)}
                    onDragStart={
                      onDropItem
                        ? (e) => {
                            e.dataTransfer.setData("text/item-id", entry.item.id);
                            e.dataTransfer.effectAllowed = "move";
                          }
                        : undefined
                    }
                    className={cn(
                      "flex items-center gap-1 truncate text-[11px] leading-tight text-foreground",
                      onDropItem && "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", categoryDotClass(entry.item.category))} />
                    <span className="truncate">{entry.item.title}</span>
                  </li>
                ))}
                {overflow > 0 && (
                  <li className="text-[11px] leading-tight text-muted-foreground">+{overflow} more</li>
                )}
              </ul>
            </>
          );

          const cellClasses = cn(
            "min-h-20 border-b border-r border-border border-l-2 p-1.5 transition-colors",
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
