"use client";

import * as React from "react";
import Link from "next/link";
import { LogIn, LogOut, Navigation } from "lucide-react";
import { cn } from "@/lib/cn";
import { buildMonthGrid, MONTH_GRID_WEEKDAYS } from "@/lib/month-grid";
import { formatLongDate, monthKey, parseISODate } from "@/lib/dates";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type { TransportMode } from "@/lib/enums";
import type { DayPlan } from "@/lib/itinerary";
import { PACKED_DAY_THRESHOLD } from "@/lib/flags";
import { stopBandBorderClass, stopPillClass } from "@/lib/stop-colours";
import { Badge, badgeVariants } from "@/components/ui/badge";

export interface MonthGridProps {
  tripId: string;
  monthAnchorISO: string;
  days: DayPlan[];
  tripStart: string;
  tripEnd: string;
  /** Trip-reference-timezone "today" (YYYY-MM-DD); its tile gets `aria-current="date"`. */
  todayISO?: string;
  /** When provided, day cells accept dropped items (the drag source is the wishlist rail, not the cell). */
  onDropItem?: (itemId: string, dateISO: string) => void;
}

/**
 * Kit Days month grid (Days.jsx / DDays.jsx): seven outlined day tiles per
 * week — 50px on a phone, 96px from `sm` — with a stop legend underneath.
 * A stop's days wear its colour from lib/stop-colours.ts (the soft pill tint
 * plus the left band); today is the lifted, hard-shadowed tile.
 */
export function MonthGrid({
  tripId,
  monthAnchorISO,
  days,
  tripStart,
  tripEnd,
  todayISO,
  onDropItem,
}: MonthGridProps) {
  const weeks = React.useMemo(() => buildMonthGrid(monthAnchorISO), [monthAnchorISO]);
  const byDate = React.useMemo(
    () => new Map(days.map((d) => [d.dateISO, d] as const)),
    [days],
  );
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  const inWindow = (dateISO: string) => dateISO >= tripStart && dateISO <= tripEnd;

  // Legend: each stop seen on this month's in-window days, in date order.
  const legend = React.useMemo(() => {
    const month = monthKey(monthAnchorISO);
    const seen = new Map<string, NonNullable<DayPlan["stop"]>>();
    for (const d of days) {
      const shown = monthKey(d.dateISO) === month && d.dateISO >= tripStart && d.dateISO <= tripEnd;
      if (d.stop && shown && !seen.has(d.stop.id)) {
        seen.set(d.stop.id, d.stop);
      }
    }
    return [...seen.values()];
  }, [days, monthAnchorISO, tripStart, tripEnd]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Weekday header — kit micro/label type; the tiles carry the full date for assistive tech. */}
      <div
        aria-hidden="true"
        className="grid grid-cols-7 gap-1 px-0.5 text-center text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground sm:gap-2 sm:text-left sm:text-[11px]"
      >
        {MONTH_GRID_WEEKDAYS.map((wd) => (
          <span key={wd}>
            <span className="sm:hidden">{wd[0]}</span>
            <span className="hidden sm:inline">{wd}</span>
          </span>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {weeks.flat().map((cell) => {
          const tile = "flex h-[50px] min-w-0 flex-col overflow-hidden rounded-sm border-2 p-1 sm:h-24 sm:rounded-md sm:p-2 xl:p-2.5";

          if (!cell.inMonth) {
            // Kit: the month's leading/trailing slots are empty space, not dim days.
            return (
              <div key={cell.dateISO} data-month-pad="" aria-hidden="true" className={cn(tile, "invisible border-transparent")} />
            );
          }

          const dayNum = parseISODate(cell.dateISO).getUTCDate();
          const numberClass = "font-display text-xs font-extrabold leading-none sm:text-lg";

          if (!inWindow(cell.dateISO)) {
            // In the month, outside the trip: the kit's soft-outlined, muted tile.
            return (
              <div key={cell.dateISO} role="presentation" className={cn(tile, "border-border-soft text-muted-foreground")}>
                <span className={numberClass}>{dayNum}</span>
              </div>
            );
          }

          const day = byDate.get(cell.dateISO);
          const timed = day?.timedItems ?? [];
          const itemCount = timed.length + (day?.untimedItems.length ?? 0);
          const packed = timed.length > PACKED_DAY_THRESHOLD;
          const thingsLabel = `${itemCount} ${itemCount === 1 ? "thing" : "things"}`;
          const isToday = cell.dateISO === todayISO;

          const label = [
            formatLongDate(cell.dateISO),
            day?.stop?.name,
            day?.stop?.country,
            itemCount > 0 ? thingsLabel : null,
            packed ? "busy day" : null,
            isToday ? "today" : null,
          ]
            .filter(Boolean)
            .join(", ");

          const dropProps = onDropItem
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

          return (
            <Link
              key={cell.dateISO}
              href={`/trips/${tripId}/day/${cell.dateISO}`}
              aria-label={label}
              aria-current={isToday ? "date" : undefined}
              {...dropProps}
              className={cn(
                tile,
                "border-border transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop hover:shadow-hard-1",
                day?.stop
                  ? cn(stopPillClass(day.stop.sortOrder), stopBandBorderClass(day.stop.sortOrder), "border-l-4 sm:border-l-8")
                  : "bg-card text-foreground",
                isToday && "-translate-x-px -translate-y-px shadow-hard-1 sm:-translate-x-0.5 sm:-translate-y-0.5 sm:shadow-hard-2",
                onDropItem && dragOver === cell.dateISO && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <span className="flex items-start justify-between gap-1">
                <span className={numberClass}>{dayNum}</span>
                <span className="hidden min-w-0 items-center gap-0.5 overflow-hidden sm:flex">
                  {day?.transportEntries.map((t) => {
                    const Icon = TRANSPORT_MODE_META[t.transport.mode as TransportMode]?.icon ?? Navigation;
                    return <Icon key={`${t.kind}-${t.transport.id}`} className="size-3.5 shrink-0" aria-hidden="true" />;
                  })}
                  {day?.accommodationEntries.map((a) =>
                    a.kind === "accommodation-checkin" ? (
                      <LogIn key={`in-${a.accommodation.id}`} className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <LogOut key={`out-${a.accommodation.id}`} className="size-3.5 shrink-0" aria-hidden="true" />
                    ),
                  )}
                </span>
              </span>

              {day?.stop && (
                <span className="mt-1 truncate text-[7px] font-extrabold uppercase leading-tight sm:mt-2 sm:line-clamp-2 sm:whitespace-normal sm:text-[10px] sm:tracking-[0.08em]">
                  {day.stop.name}
                </span>
              )}
              {day?.stop?.country && (
                <span className="hidden truncate text-[11px] font-medium leading-tight lg:block">{day.stop.country}</span>
              )}
              {itemCount > 0 && (
                <Badge
                  variant={packed ? "coral" : "default"}
                  className="mt-auto hidden max-w-full self-start truncate sm:inline-flex"
                  aria-label={thingsLabel}
                >
                  <span className="xl:hidden">{itemCount}</span>
                  <span className="hidden xl:inline">{thingsLabel}</span>
                </Badge>
              )}
            </Link>
          );
        })}
      </div>

      {legend.length > 0 && (
        <ul aria-label="Stops" className="flex flex-wrap gap-1.5">
          {legend.map((stop) => (
            <li key={stop.id} className={cn(badgeVariants(), stopPillClass(stop.sortOrder))}>
              {stop.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
