import { MAX_SPANS_PER_DAY, WEEKDAYS, type HoursSpan, type OpeningHours } from "@/lib/opening-hours";
import { openingHoursSchema } from "@/lib/validations/opening-hours";

interface GoogleTime {
  day: number;
  hour: number;
  minute: number;
}

export interface GooglePeriod {
  open: GoogleTime;
  close?: GoogleTime;
}

const DAY_MIN = 1440;
const WEEK_MIN = 7 * DAY_MIN;

const clock = (min: number): string =>
  min === DAY_MIN ? "24:00" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const weekMinute = (t: GoogleTime): number => t.day * DAY_MIN + t.hour * 60 + t.minute;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseTime(raw: unknown): GoogleTime | null {
  if (!isRecord(raw)) return null;
  const { day = 0, hour = 0, minute = 0 } = raw;
  if (typeof day !== "number" || typeof hour !== "number" || typeof minute !== "number") return null;
  if (!Number.isInteger(day) || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (day < 0 || day > 6 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { day, hour, minute };
}

// Places API (New) is proto3 JSON: zero-valued day/hour/minute may be omitted.
export function parseGooglePeriods(raw: unknown): GooglePeriod[] | null {
  if (!Array.isArray(raw)) return null;
  const periods: GooglePeriod[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const open = parseTime(entry.open);
    if (!open) return null;
    if (entry.close === undefined || entry.close === null) {
      periods.push({ open });
      continue;
    }
    const close = parseTime(entry.close);
    if (!close) return null;
    periods.push({ open, close });
  }
  return periods;
}

export function openingHoursFromGoogle(periods: GooglePeriod[] | null | undefined, source?: string): OpeningHours | null {
  if (!periods || periods.length === 0) return null;

  const days: [number, number][][] = WEEKDAYS.map(() => []);
  for (const period of periods) {
    const start = weekMinute(period.open);
    let end: number;
    if (period.close) {
      end = weekMinute(period.close);
      if (end === start) return null;
      if (end < start) end += WEEK_MIN;
    } else if (start === 0) {
      end = WEEK_MIN;
    } else {
      return null;
    }
    for (let at = start; at < end; ) {
      const dayEnd = (Math.floor(at / DAY_MIN) + 1) * DAY_MIN;
      const cut = Math.min(end, dayEnd);
      days[Math.floor(at / DAY_MIN) % 7].push([at % DAY_MIN, cut - Math.floor(at / DAY_MIN) * DAY_MIN]);
      at = cut;
    }
  }

  const week: Partial<Record<(typeof WEEKDAYS)[number], HoursSpan[]>> = {};
  for (let d = 0; d < 7; d++) {
    const merged: [number, number][] = [];
    for (const span of days[d].sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
      else merged.push([span[0], span[1]]);
    }
    if (merged.length > MAX_SPANS_PER_DAY) return null;
    week[WEEKDAYS[d]] = merged.map(([o, c]) => [clock(o), clock(c)]);
  }

  const result = openingHoursSchema.safeParse({ week, seasons: [], closed: [], ...(source ? { source } : {}) });
  return result.success ? result.data : null;
}
