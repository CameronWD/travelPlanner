/**
 * Pure plan-page model helpers: stay status, ranges, header meta, the
 * add-stop consequence line and the Fit tile. No Prisma/React.
 * See PLAN.md §1.1, §3/§4.1, §6.2, §7.4.
 */
import { uncoveredNightDates, uncoveredNights } from "@/lib/accommodation-coverage";
import { addDays, daysBetween, formatDayLabel, nightsBetween, parseISODate } from "@/lib/dates";
import { flowDates, type FlowStop, type ProjectionStop } from "@/lib/firm-up";
import { formatMoney, sumMinorToHome } from "@/lib/money";
import { orderPlanStops } from "@/lib/plan-order";
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

/** Spec 2026-10-04 §B: the stay panel's coverage line, under its Accommodation blocks. */
export type StayCoverage =
  | { kind: "rough" }
  | { kind: "day-visit" }
  | { kind: "none"; totalNights: number }
  | { kind: "covered"; totalNights: number }
  | { kind: "partial"; totalNights: number; coveredNights: number; openNights: string[] };

/** Unlike stayStatus, a same-day Stop is its own case ("day-visit"), not null. */
export function stayCoverage(
  stop: { arriveDate: string | null; departDate: string | null },
  accs: readonly { checkIn: string; checkOut: string }[],
): StayCoverage {
  if (!stop.arriveDate || !stop.departDate) return { kind: "rough" };
  const totalNights = nightsBetween(stop.arriveDate, stop.departDate);
  if (totalNights === 0) return { kind: "day-visit" };
  if (accs.length === 0) return { kind: "none", totalNights };
  const openNights = uncoveredNightDates({ arriveDate: stop.arriveDate, departDate: stop.departDate }, [...accs]);
  if (openNights.length === 0) return { kind: "covered", totalNights };
  return { kind: "partial", totalNights, coveredNights: totalNights - openNights.length, openNights };
}

/** "All 5 nights covered" / "3 of 5 nights — no bed Fri 11 Dec" / "No bed yet" / "Day visit — no nights to cover". */
export function stayCoverageLine(c: Exclude<StayCoverage, { kind: "rough" }>): string {
  switch (c.kind) {
    case "day-visit":
      return "Day visit — no nights to cover";
    case "none":
      return "No bed yet";
    case "covered":
      return `All ${plural(c.totalNights, "night")} covered`;
    case "partial":
      return `${c.coveredNights} of ${plural(c.totalNights, "night")} — no bed ${formatNightRuns(c.openNights)}`;
  }
}

/** "Fri 11 Dec, Sun 13 – Mon 14 Dec": sorted night dates folded into consecutive runs. */
export function formatNightRuns(nights: readonly string[]): string {
  const runs: [string, string][] = [];
  for (const night of nights) {
    const last = runs[runs.length - 1];
    if (last && addDays(last[1], 1) === night) last[1] = night;
    else runs.push([night, night]);
  }
  return runs.map(([a, b]) => (a === b ? formatDayLabel(a) : formatStayRange(a, b))).join(", ");
}

/** "Fri 11 Dec 15:00 → Mon 14 Dec 11:00" — each time only where set (spec 2026-10-04 §B). */
export function stayWindowLabel(a: {
  checkIn: string;
  checkOut: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}): string {
  const end = (date: string, time?: string | null) => (time ? `${formatDayLabel(date)} ${time}` : formatDayLabel(date));
  return `${end(a.checkIn, a.checkInTime)} → ${end(a.checkOut, a.checkOutTime)}`;
}

/**
 * Spec 2026-10-05 §D: one Accommodation's nights inside its Stop's window,
 * out of the Stop's nights — the stay detail view's "3 of 5 nights". A stay
 * running past either end is clipped to the Stop. Null for a rough Stop.
 */
export function stayNightsOfStop(
  stop: { arriveDate: string | null; departDate: string | null },
  a: { checkIn: string; checkOut: string },
): { nights: number; total: number } | null {
  if (!stop.arriveDate || !stop.departDate) return null;
  const total = nightsBetween(stop.arriveDate, stop.departDate);
  const from = a.checkIn > stop.arriveDate ? a.checkIn : stop.arriveDate;
  const to = a.checkOut < stop.departDate ? a.checkOut : stop.departDate;
  return { nights: to > from ? nightsBetween(from, to) : 0, total };
}

/** "3 of 5 nights" / "1 of 1 night" / "Same-day" (a day-visit Stop has no nights). */
export function stayNightsLabel(c: { nights: number; total: number }): string {
  if (c.total === 0) return "Same-day";
  return `${c.nights} of ${plural(c.total, "night")}`;
}

/**
 * Paid state at a glance (AccommodationRow and the stay panel): "paid" once
 * any cost is marked paid, "unpaid" while costs exist but none is, null when
 * no cost is recorded.
 */
export function costPaidState(costs: readonly { paidAt: Date | null }[] | undefined): "paid" | "unpaid" | null {
  if (!costs || costs.length === 0) return null;
  return costs.some((c) => c.paidAt != null) ? "paid" : "unpaid";
}

/**
 * An Accommodation's total cost: summed in its currency when there's one;
 * converted to the home currency when mixed (a currency with no rate drops
 * out, as daySummary does); each currency listed when mixed with no home.
 */
export function stayCostLabel(
  costs: readonly { costMinor: number; currency: string; rateToHome: number | null }[] | undefined,
  homeCurrency?: string,
): string | null {
  if (!costs || costs.length === 0) return null;
  const currencies = [...new Set(costs.map((c) => c.currency.toUpperCase()))];
  const sumIn = (cur: string) => costs.filter((c) => c.currency.toUpperCase() === cur).reduce((s, c) => s + c.costMinor, 0);
  if (currencies.length === 1) return formatMoney(sumIn(currencies[0]), currencies[0]);
  if (homeCurrency) {
    const { totalMinor } = sumMinorToHome(
      costs.map((c) => ({ amountMinor: c.costMinor, currency: c.currency })),
      homeCurrency,
      (cur) => costs.find((c) => c.currency.toUpperCase() === cur)?.rateToHome ?? undefined,
    );
    return formatMoney(totalMinor, homeCurrency);
  }
  return currencies.map((cur) => formatMoney(sumIn(cur), cur)).join(" + ");
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

const NEW_STOP_ID = "__plan-model/add-stop-preview__";

/**
 * Where a hypothetical new stop's sortOrder should sit: right after `afterId`
 * (or first, when null), splitting the gap to the next stop so insertion
 * never collides with a real sortOrder. Falls back to the end when `afterId`
 * isn't found (defensive — callers pass a real stop id from the same list).
 */
function insertionSortOrder(stops: readonly ProjectionStop[], afterId: string | null): number {
  const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  if (afterId === null) return sorted.length ? sorted[0].sortOrder - 1 : 0;
  const idx = sorted.findIndex((s) => s.id === afterId);
  if (idx === -1) return sorted.length ? sorted[sorted.length - 1].sortOrder + 1 : 0;
  const afterOrder = sorted[idx].sortOrder;
  const nextOrder = sorted[idx + 1]?.sortOrder;
  return nextOrder === undefined ? afterOrder + 1 : (afterOrder + nextOrder) / 2;
}

/**
 * PLAN.md §7.4 live consequence line for the add-stop sheet.
 *
 * Splices a hypothetical stop into the real, ordered plan (right after
 * `afterId`, or first when null) and runs the *same* engine
 * `computeProjectedEnd` uses — `orderPlanStops` then `flowDates`
 * (lib/firm-up.ts) — over the whole spliced list. Both the new stop's own
 * landing dates ("Lands on…") and the plan's resulting end come out of that
 * one flow, so a downstream pinned/scheduled stop correctly absorbs (or
 * fails to absorb) the change instead of every stop being assumed to shift
 * by a flat N nights.
 */
export function addStopConsequence(i: {
  mode: "exact" | "rough";
  nights: number;
  range?: { arrive: string; depart: string } | null;
  /** The plan's stops (same shape `summarizePlan`/`computeProjectedEnd` take), NOT including the new one. */
  stops: readonly ProjectionStop[];
  /** id of the stop the new one goes after, or null to insert first. */
  afterId: string | null;
  startDate: string | null;
  hardEndDate: string | null;
}): { text: string; over: boolean } | null {
  const range = i.mode === "exact" ? (i.range ?? null) : null;
  // Rough mode always has a nights count to place; exact mode needs a picked
  // range first — with neither, there's no new stop to splice in yet.
  const newStop: ProjectionStop | null =
    i.mode === "rough" || range
      ? {
          id: NEW_STOP_ID,
          sortOrder: insertionSortOrder(i.stops, i.afterId),
          nights: i.mode === "rough" ? i.nights : null,
          pinned: false,
          arriveDate: range?.arrive ?? null,
          departDate: range?.depart ?? null,
        }
      : null;
  const withNew = newStop ? [...i.stops, newStop] : i.stops;
  const ordered = orderPlanStops([...withNew].sort((a, b) => a.sortOrder - b.sortOrder));

  // Same anchor rule as computeProjectedEnd: earliest of the provided anchor
  // and any scheduled arrive, so a boundary stop never rewinds the cursor.
  let earliestArrive: string | null = null;
  for (const s of ordered) {
    if (s.arriveDate && (earliestArrive === null || s.arriveDate < earliestArrive)) earliestArrive = s.arriveDate;
  }
  let anchor = i.startDate;
  if (anchor === null) anchor = earliestArrive;
  else if (earliestArrive !== null && earliestArrive < anchor) anchor = earliestArrive;
  if (!anchor) return null;

  const flowStops: FlowStop[] = ordered.map((s) => {
    const scheduled = Boolean(s.arriveDate && s.departDate);
    return {
      id: s.id,
      nights: scheduled ? nightsBetween(s.arriveDate as string, s.departDate as string) : Math.max(0, s.nights ?? 1),
      pinned: scheduled || s.pinned,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
    };
  });
  const { results } = flowDates(flowStops, anchor);

  let end: string | null = null;
  for (const r of results) if (end === null || r.departDate > end) end = r.departDate;

  const mine = newStop ? (results.find((r) => r.id === NEW_STOP_ID) ?? null) : null;
  const lands = mine ? { arrive: mine.arriveDate, depart: mine.departDate } : null;
  const landsText = lands ? `Lands on ${formatStayRange(lands.arrive, lands.depart)}.` : "";

  const slack = i.hardEndDate && end ? daysBetween(end, i.hardEndDate) : null;
  if (slack !== null && slack < 0) {
    return { text: `Pushes you ${plural(-slack, "night")} past ${formatDayLabel(i.hardEndDate!)}.`, over: true };
  }
  if (slack !== null) return { text: `${landsText} ${plural(slack, "night")} spare after this.`.trim(), over: false };
  return landsText ? { text: landsText, over: false } : null;
}

/** Unweighted average lat/lng of the stops that have coordinates; null with none (Add a stop ranks place results near it). */
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
  const of = s.spanStart && s.deadline ? daysBetween(s.spanStart, s.deadline.date) : null;
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
      // R7: a return leg at slack 0 ("ends right on your flight home") is
      // still the ok/teal tone, not the approaching/amber one — only the
      // wording borrows "right on it" from the approaching case below.
      return { tone: "teal", big: slack, words: slack === 0 ? "right on it" : nightsWord(slack, "spare"), pill: "FITS YOUR DATES", bar, legendLeft, legendRight };
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
