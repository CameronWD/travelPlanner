import { addDays, addMonths, endOfMonthISO, parseISODate } from "@/lib/dates";

export interface DateRange {
  start?: string;
  end?: string;
}

export type DayState = "none" | "start" | "end" | "single" | "in" | "preview";

export function monthCells(ym: string): (string | null)[] {
  const first = `${ym}-01`;
  const lead = (parseISODate(first).getUTCDay() + 6) % 7;
  const days = Number(endOfMonthISO(first).slice(8, 10));
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function nextRange(r: DateRange, day: string): DateRange {
  if (!r.start || r.end || day < r.start) return { start: day };
  return { start: r.start, end: day };
}

export function dayState(day: string, r: DateRange, hover?: string): DayState {
  const { start, end } = r;
  if (!start) return "none";
  if (end) {
    if (day === start && day === end) return "single";
    if (day === start) return "start";
    if (day === end) return "end";
    return day > start && day < end ? "in" : "none";
  }
  const previewing = hover !== undefined && hover > start;
  if (day === start) return previewing ? "start" : "single";
  return previewing && day > start && day <= hover ? "preview" : "none";
}

export function isDayDisabled(day: string, disableBefore?: string, disableAfter?: string): boolean {
  return (disableBefore !== undefined && day < disableBefore) || (disableAfter !== undefined && day > disableAfter);
}

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export function shiftDay(day: string, key: string): string | null {
  const n = STEP[key];
  return n === undefined ? null : addDays(day, n);
}

export function addMonthKey(ym: string, n: number): string {
  return addMonths(`${ym}-01`, n).slice(0, 7);
}
