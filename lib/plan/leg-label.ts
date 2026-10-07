import type { LucideIcon } from "lucide-react";
import type { TransportMode } from "@/lib/enum-values";
import { TRANSPORT_MODE_META, formatDuration } from "@/lib/transport";
import { transportTimeDisplay } from "@/lib/time-display";
import { formatDayLabel } from "@/lib/dates";

export interface LegTransport {
  mode: TransportMode;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | null;
  arrAt?: Date | null;
  fromStopId?: string | null;
  toStopId?: string | null;
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
  driveEstimate?: { minutes: number; roadKm: number } | null;
}

export interface LegStop {
  id: string;
  name: string;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
}

export interface LegLabel {
  icon: LucideIcon | null;
  label: string;
  sub: string;
  missing: boolean;
  accessibleName: string;
}

const SPOKEN_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const spokenDay = (iso: string) => SPOKEN_DAY.format(new Date(`${iso}T00:00:00Z`));

/** PLAN.md §2: shorten a place to its IATA/station code when one is in it. */
export function placeCode(place: string): string {
  return /\b([A-Z]{3})\b/.exec(place)?.[1] ?? place;
}

export function legLabel(t: LegTransport, stops: readonly LegStop[], homeName?: string | null): LegLabel {
  const from = stops.find((s) => s.id === t.fromStopId) ?? null;
  const to = stops.find((s) => s.id === t.toStopId) ?? null;
  const meta = TRANSPORT_MODE_META[t.mode];
  const isCar = t.mode === "CAR";
  const word = isCar ? "Drive" : meta.label;
  const home = homeName ?? "home";
  const fromName = t.depIsHome ? home : (from?.name ?? t.depPlace ?? null);
  const toName = t.arrIsHome ? home : (to?.name ?? t.arrPlace ?? null);
  const fromShort = t.depPlace ? placeCode(t.depPlace) : fromName;
  const toShort = t.arrPlace ? placeCode(t.arrPlace) : toName;

  let label = word;
  let sub = "";
  let spoken = "";
  if (t.depAt) {
    if (fromShort && toShort) label = `${word} ${fromShort} → ${toShort}`;
    const { dep } = transportTimeDisplay({
      depAt: t.depAt,
      arrAt: t.arrAt ?? null,
      fromTimezone: from?.timezone,
      toTimezone: to?.timezone,
    });
    if (dep) {
      sub = `${formatDayLabel(dep.dateISO)} ${dep.time}`;
      spoken = `${spokenDay(dep.dateISO)} ${dep.time}`;
    }
  } else if (isCar && t.driveEstimate) {
    sub = `~${formatDuration(t.driveEstimate.minutes)} · ${t.driveEstimate.roadKm} km`;
    spoken = sub;
  } else {
    const day = from?.departDate ?? to?.arriveDate ?? null;
    if (day) {
      sub = formatDayLabel(day);
      spoken = spokenDay(day);
    }
  }

  const route = fromName && toName ? ` from ${fromName} to ${toName}` : "";
  return {
    icon: meta.icon,
    label,
    sub,
    missing: false,
    accessibleName: `${word}${route}${spoken ? `, ${spoken}` : ""}. Edit.`,
  };
}

export function missingLegLabel(from: { name: string }, to: { name: string }): LegLabel {
  return {
    icon: null,
    label: `How are you getting to ${to.name}?`,
    sub: "Add",
    missing: true,
    accessibleName: `Add transport from ${from.name} to ${to.name}`,
  };
}

/** PLAN.md §2: no nagging about legs until both stops have dates. */
export function legSlotKind(
  from: { arriveDate: string | null },
  to: { arriveDate: string | null },
  legCount: number,
): "legs" | "missing" | "line" {
  if (legCount > 0) return "legs";
  return from.arriveDate && to.arriveDate ? "missing" : "line";
}

/**
 * Spec 2026-10-05 §F: the change-over place between consecutive legs on one
 * strip, only where the data already says so — leg i-1's arrival place equals
 * leg i's departure place (trimmed, case-insensitive). Index i belongs to
 * leg i (the one leaving from it); index 0 is always null. No new data.
 */
export function changeoverPlaces(
  legs: readonly Pick<LegTransport, "depPlace" | "arrPlace">[],
): (string | null)[] {
  return legs.map((leg, i) => {
    if (i === 0) return null;
    const arrived = legs[i - 1].arrPlace?.trim();
    const leaving = leg.depPlace?.trim();
    if (!arrived || !leaving) return null;
    return arrived.toLowerCase() === leaving.toLowerCase() ? arrived : null;
  });
}
