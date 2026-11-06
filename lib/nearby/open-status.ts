import { hoursOn, type OpeningHours } from "@/lib/opening-hours";
import type { NearbyPlace } from "./search";

const DAY_MIN = 1440;
const MINUTE_MS = 60_000;

const minutes = (clock: string): number => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

const clockOf = (min: number): string => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

type Status = { openNow: boolean | null; closesAt: string | null };

export function openStatusAt(hours: OpeningHours | null, utcOffsetMinutes: number | null, nowMs: number): Status {
  if (!hours || utcOffsetMinutes === null) return { openNow: null, closesAt: null };
  const local = nowMs + utcOffsetMinutes * MINUTE_MS;
  const today = hoursOn(hours, isoOf(local));
  if (!today) return { openNow: null, closesAt: null };
  const nowMin = Math.floor((local % (DAY_MIN * MINUTE_MS)) / MINUTE_MS);
  const span = today.spans.find(([open, close]) => minutes(open) <= nowMin && nowMin < minutes(close));
  if (!span) return { openNow: false, closesAt: null };

  let close = minutes(span[1]);
  for (let ahead = 1; close % DAY_MIN === 0 && ahead <= 7; ahead++) {
    const next = hoursOn(hours, isoOf(local + ahead * DAY_MIN * MINUTE_MS));
    const first = next?.spans[0];
    if (!first || minutes(first[0]) !== 0) return { openNow: true, closesAt: clockOf(close) };
    close = ahead * DAY_MIN + minutes(first[1]);
  }
  return { openNow: true, closesAt: close % DAY_MIN === 0 && close >= 8 * DAY_MIN ? null : clockOf(close) };
}

export function withOpenStatus(places: NearbyPlace[], nowMs: number): NearbyPlace[] {
  return places.map((p) => ({ ...p, ...openStatusAt(p.openingHours, p.utcOffsetMinutes ?? null, nowMs) }));
}
