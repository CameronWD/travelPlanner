import { addMonths, monthKey, todayISO } from "@/lib/dates";

/**
 * CONTEXT.md "Rough month": a Trip's loose "when" ("Sometime in April"),
 * stored as "YYYY-MM". A wish, never a date — nothing here feeds the date
 * engine, Flags or the Phase.
 */

const LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isRoughMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function roughMonthOptions(today: string, count = 12): string[] {
  const first = `${monthKey(today)}-01`;
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(first, i)));
}

function monthIndex(ym: string): number {
  return Number(ym.slice(5, 7)) - 1;
}

export function formatRoughMonth(ym: string, today: string = todayISO()): string {
  const month = LONG[monthIndex(ym)];
  return roughMonthOptions(today).includes(ym) ? month : `${month} ${ym.slice(0, 4)}`;
}

export function roughMonthStamp(ym: string): string {
  return `${SHORT[monthIndex(ym)].toUpperCase()} ${ym.slice(2, 4)}`;
}

export function roughMonthChip(ym: string, today: string): string {
  const short = SHORT[monthIndex(ym)];
  return ym.slice(0, 4) === today.slice(0, 4) ? short : `${short} ’${ym.slice(2, 4)}`;
}
