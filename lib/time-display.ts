/**
 * Pure display helpers for timezone-aware time rendering (Feature: tz display).
 * Local time stays primary; these add a legible zone label and cross-zone
 * "+N day" math. No React, no network.
 */
import { instantToZonedTime, instantToZonedDateISO } from "@/lib/tz";
import { tzAbbrev, daysBetween } from "@/lib/dates";

/** Short zone label for an instant's local date, e.g. "CEST"; "UTC" when unknown. */
export function zoneLabel(timezone: string | null | undefined, onDateISO: string): string {
  return tzAbbrev(timezone ?? null, onDateISO) ?? "UTC";
}

/** Compact "5 Aug" from a YYYY-MM-DD calendar date (zone-free). */
export function shortDate(dateISO: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${dateISO}T00:00:00Z`));
}

export interface ZonedEndpoint { time: string; zone: string; dateISO: string }
export interface TransportTimeDisplay {
  dep: ZonedEndpoint | null;
  arr: ZonedEndpoint | null;
  /** arr calendar date minus dep calendar date, each in its own zone; 0 same day, can be negative. */
  dayDelta: number;
}

export function transportTimeDisplay(input: {
  depAt: Date | null | undefined;
  arrAt: Date | null | undefined;
  fromTimezone: string | null | undefined;
  toTimezone: string | null | undefined;
}): TransportTimeDisplay {
  const { depAt, arrAt, fromTimezone, toTimezone } = input;
  const depTz = fromTimezone ?? "UTC";
  const arrTz = toTimezone ?? fromTimezone ?? "UTC";

  let dep: ZonedEndpoint | null = null;
  if (depAt) {
    const dateISO = instantToZonedDateISO(depAt, depTz);
    dep = { time: instantToZonedTime(depAt, depTz), zone: zoneLabel(fromTimezone, dateISO), dateISO };
  }
  let arr: ZonedEndpoint | null = null;
  if (arrAt) {
    const dateISO = instantToZonedDateISO(arrAt, arrTz);
    arr = { time: instantToZonedTime(arrAt, arrTz), zone: zoneLabel(toTimezone ?? fromTimezone, dateISO), dateISO };
  }
  const dayDelta = dep && arr ? daysBetween(dep.dateISO, arr.dateISO) : 0;
  return { dep, arr, dayDelta };
}

/** Render the "+1 day" / "−1 day" suffix for a cross-zone arrival; "" when same day. */
export function dayDeltaSuffix(dayDelta: number): string {
  if (dayDelta === 0) return "";
  const sign = dayDelta > 0 ? "+" : "−";
  const n = Math.abs(dayDelta);
  return ` (${sign}${n} day${n === 1 ? "" : "s"})`;
}
