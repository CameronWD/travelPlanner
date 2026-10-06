import { nightsBetween, tzAbbrev } from "@/lib/dates";
import { formatStayRange } from "@/lib/plan/plan-model";
import type { StopCardStop } from "@/components/plan/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "Thu 10 – Sat 12 Dec · 2 nights · CET", or "Rough · ~3 nights" (PLAN.md §7.2).
 * Shared by the stop sheet and the actions sheet. Its own module so the Plan
 * can build the actions sheet's meta line without loading the stop sheet
 * (spec 2026-10-06 §P).
 */
export function stopSheetMeta(stop: Pick<StopCardStop, "arriveDate" | "departDate" | "nights" | "timezone">): string {
  if (!stop.arriveDate || !stop.departDate) return `Rough · ~${plural(stop.nights ?? 1, "night")}`;
  const parts = [formatStayRange(stop.arriveDate, stop.departDate), plural(nightsBetween(stop.arriveDate, stop.departDate), "night")];
  const tz = tzAbbrev(stop.timezone, stop.arriveDate);
  if (tz) parts.push(tz);
  return parts.join(" · ");
}
