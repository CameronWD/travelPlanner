/**
 * CONTEXT.md "Opening hours": how a thing's hours read to a Traveller. Pure
 * and zod-free, like lib/opening-hours.ts: the Timeline, ItemCard and the
 * Item dialog import it. The Item's date is already the Stop's local date,
 * so no zone conversion is needed.
 *
 * Task D.1 brief vs Section S (see d-as-built.md — authoritative): the brief
 * assumed a numeric `Weekday` (0-6), a `WeeklyHours` with every key present
 * (`null` = closed) and field names `weekly`/`closedDates`/`sourceUrl`. S
 * built `Weekday` as one of `WEEKDAYS` ("sun".."sat"), a `WeekHours` where an
 * ABSENT weekday means "not known" and `[]` means closed, and field names
 * `week`/`closed`/`source`. S's `hoursOn` already resolves seasons and
 * closed dates for one date, returning `DayHours | null` (null = not known),
 * so this module only has to turn that result into words.
 */
import { parseISODate } from "@/lib/dates";
import { hoursOn, WEEKDAYS, type HoursSpan, type OpeningHours, type Weekday, type WeekHours } from "@/lib/opening-hours";

/** Long weekday names, keyed like `WeekHours` (not index = Weekday, since Weekday is a string here). */
export const WEEKDAY_LONG: Readonly<Record<Weekday, string>> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

const WEEKDAY_SHORT: Readonly<Record<Weekday, string>> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

/** Monday-first order, for a weekly summary. */
export const MONDAY_FIRST: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** "09:00–12:00, 14:00–18:00": spans joined with a comma, open–close with an en dash. */
export function formatSpans(spans: readonly HoursSpan[]): string {
  return spans.map(([open, close]) => `${open}–${close}`).join(", ");
}

/**
 * The card / Timeline line for a thing scheduled on `dateISO`: "Open
 * 10:00–18:00" (+ " today" when it is today), "Closed on Tuesdays" for a shut
 * weekday (or a season's weekday), "Closed that day" for a closed date. Null
 * when the hours are not known for that date (no hours at all, or the
 * weekday is entered nowhere — S's `hoursOn` returning null).
 */
export function openingLine(
  hours: OpeningHours | null | undefined,
  dateISO: string,
  opts: { today?: boolean } = {},
): { text: string; closed: boolean } | null {
  const day = hoursOn(hours, dateISO);
  if (!day) return null;
  if (!day.closed) {
    return { text: `Open ${formatSpans(day.spans)}${opts.today ? " today" : ""}`, closed: false };
  }
  if (opts.today) return { text: "Closed today", closed: true };
  if (day.by === "closed-date") return { text: "Closed that day", closed: true };
  const weekday = WEEKDAYS[parseISODate(dateISO).getUTCDay()];
  return { text: `Closed on ${WEEKDAY_LONG[weekday]}s`, closed: true };
}

/** "Mon–Fri 10:00–18:00 · Sat 09:00–12:00, 14:00–18:00 · Sun closed": runs of equal days, Monday first. Days entered nowhere read "not set". */
export function weeklySummary(week: WeekHours): string {
  const labelOf = (d: Weekday): string => {
    const spans = week[d];
    if (spans === undefined) return "not set";
    return spans.length > 0 ? formatSpans(spans) : "closed";
  };
  const groups: { from: Weekday; to: Weekday; label: string }[] = [];
  for (const d of MONDAY_FIRST) {
    const label = labelOf(d);
    const last = groups.at(-1);
    if (last && last.label === label) last.to = d;
    else groups.push({ from: d, to: d, label });
  }
  if (groups.length === 1) {
    const { label } = groups[0];
    if (label === "closed") return "Closed every day";
    if (label === "not set") return "Hours not set";
    return `Every day ${label}`;
  }
  return groups
    .map((g) => `${g.from === g.to ? WEEKDAY_SHORT[g.from] : `${WEEKDAY_SHORT[g.from]}–${WEEKDAY_SHORT[g.to]}`} ${g.label}`)
    .join(" · ");
}

/**
 * One line for the whole set: the usual week, then how many seasons and
 * closed dates. Fix round 1 (controller ruling): nothing entered for the
 * week ("not known") is only worth saying when there is nothing else to
 * say — a seasons-only or closed-dates-only set leads with those instead of
 * reading "Hours not set · 1 season".
 */
export function openingHoursSummary(hours: OpeningHours): string {
  const weekKnown = Object.keys(hours.week).length > 0;
  const parts: string[] = [];
  if (weekKnown || (hours.seasons.length === 0 && hours.closed.length === 0)) {
    parts.push(weeklySummary(hours.week));
  }
  const n = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);
  if (hours.seasons.length > 0) parts.push(n(hours.seasons.length, "season", "seasons"));
  if (hours.closed.length > 0) parts.push(n(hours.closed.length, "closed date", "closed dates"));
  return parts.join(" · ");
}
