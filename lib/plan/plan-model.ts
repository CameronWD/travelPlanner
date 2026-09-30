/**
 * Pure plan-page model helpers: stay status, ranges, header meta, the
 * add-stop consequence line and the Fit tile. No Prisma/React.
 * See PLAN.md §1.1, §3/§4.1, §6.2, §7.4.
 */
import { uncoveredNights } from "@/lib/accommodation-coverage";
import { addDays, daysBetween, formatDayLabel, nightsBetween, parseISODate } from "@/lib/dates";
import type { PlanSummary } from "@/lib/plan-overview";

export type StayStatus = {
  kind: "covered" | "partial" | "none";
  name: string | null;
  totalNights: number;
  coveredNights: number;
  extra: number;
  checkInTime: string | null;
};

/** PLAN.md §3/§4.1 stay chip. Null for a rough stop (no dates) or a same-day visit (0 nights). */
export function stayStatus(
  stop: { arriveDate: string | null; departDate: string | null },
  accs: readonly { name: string; checkIn: string; checkOut: string; checkInTime?: string | null }[],
): StayStatus | null {
  if (!stop.arriveDate || !stop.departDate) return null;
  const total = nightsBetween(stop.arriveDate, stop.departDate);
  if (total === 0) return null;
  const open = uncoveredNights({ arriveDate: stop.arriveDate, departDate: stop.departDate }, [...accs]);
  const first = accs[0] ?? null;
  return {
    kind: accs.length === 0 ? "none" : open === 0 ? "covered" : "partial",
    name: first?.name ?? null,
    totalNights: total,
    coveredNights: total - open,
    extra: Math.max(0, accs.length - 1),
    checkInTime: first?.checkInTime ?? null,
  };
}

/** "Tue 15 – Tue 22 Dec" / "Sun 27 Dec – Sun 3 Jan": the stop row and header range (PLAN.md §1.1, §3). */
export function formatStayRange(arrive: string, depart: string): string {
  const [a, d] = [arrive, depart].map(formatDayLabel);
  const sameMonth = parseISODate(arrive).getUTCMonth() === parseISODate(depart).getUTCMonth();
  return sameMonth ? `${a.replace(/ [A-Z][a-z]{2}$/, "")} – ${d}` : `${a} – ${d}`;
}

/** PLAN.md §1.1 eyebrow: the trip name with its start year, unless the name already ends with it. */
export function tripEyebrow(name: string, startDate: string | null): string {
  if (!startDate) return name;
  const year = startDate.slice(0, 4);
  return name.trimEnd().endsWith(year) ? name : `${name} ${year}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** PLAN.md §1.1 header meta: "{stops} · {rough} · {range}", dropping empty parts. */
export function planHeaderMeta(s: { stopCount: number; roughCount: number }, start: string | null, end: string | null): string {
  const parts = [plural(s.stopCount, "stop")];
  if (s.roughCount > 0) parts.push(`${s.roughCount} rough`);
  if (start && end) parts.push(formatStayRange(start, end));
  return parts.join(" · ");
}

/**
 * PLAN.md §7.4 live consequence line for the add-stop sheet. Uses the same
 * maths as the scheduler (`computeProjectedEnd`/`summarizePlan`): shifting
 * `projectedEnd` by the new stop's nights, then comparing to `hardEndDate`.
 */
export function addStopConsequence(i: {
  mode: "exact" | "rough";
  nights: number;
  range?: { arrive: string; depart: string } | null;
  after: { departDate: string | null } | null;
  projectedEnd: string | null;
  hardEndDate: string | null;
}): { text: string; over: boolean } | null {
  const lands =
    i.mode === "exact"
      ? (i.range ?? null)
      : i.after?.departDate
        ? { arrive: i.after.departDate, depart: addDays(i.after.departDate, i.nights) }
        : null;
  const shift = i.mode === "exact" ? (i.range ? nightsBetween(i.range.arrive, i.range.depart) : 0) : i.nights;
  const newEnd = i.projectedEnd ? addDays(i.projectedEnd, shift) : (lands?.depart ?? null);
  const slack = i.hardEndDate && newEnd ? daysBetween(newEnd, i.hardEndDate) : null;
  const landsText = lands ? `Lands on ${formatStayRange(lands.arrive, lands.depart)}.` : "";
  if (slack !== null && slack < 0) {
    return { text: `Pushes you ${plural(-slack, "night")} past ${formatDayLabel(i.hardEndDate!)}.`, over: true };
  }
  if (slack !== null) return { text: `${landsText} ${plural(slack, "night")} spare after this.`.trim(), over: false };
  return landsText ? { text: landsText, over: false } : null;
}

/** Unweighted average lat/lng of the stops that have coordinates; null with none (§6.1 mini map). */
export function routeCentroid(stops: readonly { lat?: number | null; lng?: number | null }[]): { lat: number; lng: number } | null {
  const located = stops.filter((s): s is { lat: number; lng: number } => s.lat != null && s.lng != null);
  if (located.length === 0) return null;
  return {
    lat: located.reduce((n, s) => n + s.lat, 0) / located.length,
    lng: located.reduce((n, s) => n + s.lng, 0) / located.length,
  };
}

export type FitTone = "teal" | "sun" | "coral" | "card";

/** PLAN.md §6.2 Fit tile, built from `summarizePlan()` output with no new date logic. */
export function fitTileModel(s: PlanSummary): {
  tone: FitTone;
  big: number | null;
  words: string;
  pill: "FITS YOUR DATES" | "RUNS OVER" | null;
  bar: { setPct: number; roughPct: number; overPct: number } | null;
  legendLeft: string;
  legendRight: string | null;
} {
  const rough = s.projectedNights - s.scheduledNights;
  const legendLeft = rough > 0 ? `${s.scheduledNights} set · ~${rough} rough` : `${s.scheduledNights} set`;
  const of = s.spanStart && s.hardEndDate ? daysBetween(s.spanStart, s.hardEndDate) : null;
  const bar =
    of && of > 0 && (s.hardEndState === "ok" || s.hardEndState === "approaching" || s.hardEndState === "over")
      ? (() => {
          const setPct = Math.min(100, (s.scheduledNights / of) * 100);
          const roughPct = Math.min(100 - setPct, (rough / of) * 100);
          const overPct = s.projectedNights > of ? Math.min(20, ((s.projectedNights - of) / of) * 100) : 0;
          return { setPct, roughPct, overPct };
        })()
      : null;
  const legendRight = of ? `of ${of}` : null;
  const slack = s.hardEndSlackNights ?? 0;
  const nightsWord = (n: number, tail: string) => `night${n === 1 ? "" : "s"} ${tail}`;
  switch (s.hardEndState) {
    case "ok":
      return { tone: "teal", big: slack, words: nightsWord(slack, "spare"), pill: "FITS YOUR DATES", bar, legendLeft, legendRight };
    case "approaching":
      return { tone: "sun", big: slack, words: slack === 0 ? "right on it" : nightsWord(slack, "spare"), pill: "FITS YOUR DATES", bar, legendLeft, legendRight };
    case "over":
      return { tone: "coral", big: -slack, words: nightsWord(-slack, "over"), pill: "RUNS OVER", bar, legendLeft, legendRight };
    case "unset":
      return { tone: "card", big: null, words: "Set a home-by date", pill: null, bar: null, legendLeft, legendRight: null };
    default:
      return { tone: "card", big: null, words: "Set a start date to check this", pill: null, bar: null, legendLeft, legendRight: null };
  }
}
