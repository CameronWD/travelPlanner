import type { CSSProperties } from "react";
import { Plane, TrainFront, Bus, Car, Ship, ArrowRight, BedDouble, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { categoryDotClass } from "@/components/trip/category-dot";
import { orderDayEntries, type DayPlan } from "@/lib/itinerary";
import { isDoneAt } from "@/lib/share-view";

// ---------------------------------------------------------------------------
// Pure row builder + row renderer for the share page's "today" lists (the
// Right now card and, later, the day-by-day). No "use client" here — the
// builder is plain data shaping and ShareRow is a Server Component; only the
// clock that reads `nowHHMM` needs the client (local-clock.tsx).
// ---------------------------------------------------------------------------

export const MODE_LABELS: Record<string, string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  BUS: "Bus",
  CAR: "Car",
  FERRY: "Ferry",
  OTHER: "Transport",
};

export const MODE_ICONS: Record<string, LucideIcon> = {
  FLIGHT: Plane,
  TRAIN: TrainFront,
  BUS: Bus,
  CAR: Car,
  FERRY: Ship,
  OTHER: ArrowRight,
};

export interface ShareRowModel {
  key: string;
  time: string | null;
  title: string;
  /** An item's or a check-in's address (day by day only). */
  sub: string | null;
  kind: "item" | "transport" | "stay";
  /** kind "item" only. */
  category: string | null;
  /** kind "transport" only. */
  mode: string | null;
  done: boolean;
}

/**
 * Flatten a DayPlan into the share page's row shape, in `orderDayEntries`
 * order (anytime items last). Reads only the fields ADR 0051 allows off a
 * share link — never a reference, confirmation or booking field.
 */
export function buildShareRows(
  day: DayPlan,
  opts: { nowHHMM: string | null; withAddress: boolean },
): ShareRowModel[] {
  const { nowHHMM, withAddress } = opts;
  const { entries, anytime } = orderDayEntries(day);

  const rows: ShareRowModel[] = entries.map((entry): ShareRowModel => {
    switch (entry.kind) {
      case "item": {
        const { item } = entry;
        return {
          key: `item-${item.id}`,
          time: item.startTime ?? null,
          title: item.title,
          sub: withAddress ? item.address ?? null : null,
          kind: "item",
          category: item.category,
          mode: null,
          done: nowHHMM ? isDoneAt(item.startTime, item.endTime, nowHHMM) : false,
        };
      }
      case "transport-departure": {
        const { transport, arrivesSameDay, depTimeLabel, arrTimeLabel } = entry;
        return {
          key: `transport-departure-${transport.id}`,
          time: depTimeLabel ?? null,
          title: `${MODE_LABELS[transport.mode] ?? "Transport"}${transport.arrPlace ? ` to ${transport.arrPlace}` : ""}`,
          sub: null,
          kind: "transport",
          category: null,
          mode: transport.mode,
          done:
            nowHHMM && depTimeLabel
              ? isDoneAt(depTimeLabel, arrivesSameDay ? arrTimeLabel ?? null : null, nowHHMM)
              : false,
        };
      }
      case "transport-arrival": {
        const { transport, arrTimeLabel } = entry;
        return {
          key: `transport-arrival-${transport.id}`,
          time: arrTimeLabel ?? null,
          title: `${MODE_LABELS[transport.mode] ?? "Transport"} arrives${transport.arrPlace ? ` at ${transport.arrPlace}` : ""}`,
          sub: null,
          kind: "transport",
          category: null,
          mode: transport.mode,
          done: nowHHMM && arrTimeLabel ? arrTimeLabel <= nowHHMM : false,
        };
      }
      case "accommodation-checkin": {
        const { accommodation } = entry;
        return {
          key: `accommodation-checkin-${accommodation.id}`,
          time: accommodation.checkInTime ?? null,
          title: `Check in, ${accommodation.name}`,
          sub: withAddress ? accommodation.address ?? null : null,
          kind: "stay",
          category: null,
          mode: null,
          done: nowHHMM && accommodation.checkInTime ? accommodation.checkInTime <= nowHHMM : false,
        };
      }
      case "accommodation-checkout": {
        const { accommodation } = entry;
        return {
          key: `accommodation-checkout-${accommodation.id}`,
          time: accommodation.checkOutTime ?? null,
          title: `Check out, ${accommodation.name}`,
          sub: null,
          kind: "stay",
          category: null,
          mode: null,
          done: nowHHMM && accommodation.checkOutTime ? accommodation.checkOutTime <= nowHHMM : false,
        };
      }
    }
  });

  const anytimeRows: ShareRowModel[] = anytime.map((entry) => ({
    key: `item-${entry.item.id}`,
    time: null,
    title: entry.item.title,
    sub: withAddress ? entry.item.address ?? null : null,
    kind: "item",
    category: entry.item.category,
    mode: null,
    done: false,
  }));

  return [...rows, ...anytimeRows];
}

/** A list of rows; each done row's strike is staggered by its place among the done rows (MOTION.md S6). */
export function ShareRows({ rows, dense }: { rows: ShareRowModel[]; dense?: boolean }) {
  let done = 0;
  return rows.map((row) => <ShareRow key={row.key} row={row} dense={dense} doneIndex={row.done ? done++ : undefined} />);
}

export function ShareRow({ row, dense, doneIndex }: { row: ShareRowModel; dense?: boolean; doneIndex?: number }) {
  const Icon = row.kind === "transport" ? MODE_ICONS[row.mode ?? "OTHER"] ?? ArrowRight : null;
  return (
    <div className={cn("grid grid-cols-[44px_12px_minmax(0,1fr)] items-baseline gap-2.5", dense ? "py-1.5" : "py-1")}>
      <span className="text-[13px] font-bold tabular-nums text-muted-foreground">{row.time}</span>
      {row.kind === "item" && (
        <span aria-hidden className={cn("size-3 translate-y-0.5 rounded-full", categoryDotClass(row.category ?? "OTHER"))} />
      )}
      {row.kind === "transport" && Icon && <Icon aria-hidden className="size-3" />}
      {row.kind === "stay" && <BedDouble aria-hidden className="size-3" />}
      <span
        className={cn("min-w-0 break-words text-[15px] font-bold", row.done && "text-muted-foreground")}
        data-done={row.done || undefined}
      >
        {row.done ? (
          // Inline, so a wrapped title is struck through on every line (MOTION.md S6).
          <span className="tp-strike" style={{ "--tp-i": String(doneIndex ?? 0) } as CSSProperties}>
            {row.title}
          </span>
        ) : (
          row.title
        )}
      </span>
      {row.sub && (
        <span className="col-start-3 break-words text-[13px] font-medium text-muted-foreground">{row.sub}</span>
      )}
    </div>
  );
}
