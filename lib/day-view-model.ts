import { addDays, daysBetween, formatDayLabel, formatLongDate, nightsBetween } from "@/lib/dates";

export function dayHeading(dateISO: string, tripStart: string, tripEnd: string): string {
  const spansYears = tripStart.slice(0, 4) !== tripEnd.slice(0, 4);
  return spansYears && dateISO.slice(0, 4) !== tripStart.slice(0, 4) ? formatLongDate(dateISO) : formatDayLabel(dateISO);
}

export function dayEyebrow(i: { dayNumber: number; totalDays: number; chapterName: string | null; country: string | null; travelDay: boolean }): string {
  const head = `DAY ${i.dayNumber} OF ${i.totalDays}`;
  const tail = i.travelDay ? "TRAVEL DAY" : (i.chapterName ?? i.country);
  return tail ? `${head} · ${tail.toUpperCase()}` : head;
}

export interface SubLineInput { stopName: string | null; country: string | null; zone: string | null; nightOf: { night: number; of: number } | null; travel: { from: string; to: string; toZone: string | null } | null; compact: boolean }

export function daySubLine(i: SubLineInput): string {
  if (i.travel) {
    const zone = i.travel.toZone && i.zone && i.travel.toZone !== i.zone ? `${i.zone} → ${i.travel.toZone}` : (i.zone ?? i.travel.toZone);
    return [`${i.travel.from} → ${i.travel.to}`, zone].filter(Boolean).join(" · ");
  }
  if (!i.stopName) return "";
  const place = i.compact || !i.country ? i.stopName : `${i.stopName}, ${i.country}`;
  const night = i.nightOf ? `night ${i.nightOf.night} of ${i.nightOf.of}` : null;
  return [place, i.zone, night].filter(Boolean).join(" · ");
}

export function nightOfStay(dateISO: string, checkIn: string, checkOut: string): { night: number; of: number } | null {
  if (dateISO < checkIn || dateISO >= checkOut) return null;
  return { night: daysBetween(checkIn, dateISO) + 1, of: nightsBetween(checkIn, checkOut) };
}

export function dayStripWindow(dateISO: string, tripStart: string, tripEnd: string, count: number): string[] {
  const total = daysBetween(tripStart, tripEnd) + 1;
  const n = Math.min(count, total);
  let first = daysBetween(tripStart, dateISO) - Math.floor(n / 2);
  first = Math.max(0, Math.min(first, total - n));
  return Array.from({ length: n }, (_, k) => addDays(tripStart, first + k));
}

export const dotsFor = (count: number) => Math.min(count, 3);

export interface CitySegment { name: string; startIndex: number; span: number; hueIndex: number }

export function citySegments(window: string[], stops: Array<{ name: string; arriveDate: string; departDate: string; sortOrder: number }>): CitySegment[] {
  const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const out: CitySegment[] = [];
  sorted.forEach((s, hueIndex) => {
    let startIndex = -1; let span = 0;
    window.forEach((d, idx) => {
      if (d >= s.arriveDate && d < s.departDate) { if (startIndex < 0) startIndex = idx; span += 1; }
    });
    if (span > 0) out.push({ name: s.name, startIndex, span, hueIndex });
  });
  return out;
}

export const planCountLabel = (n: number) => (n === 0 ? "Nothing planned yet" : n === 1 ? "1 thing" : `${n} things`);

export interface IdeaRow { id: string; title: string; category: string; hint: string | null; pool: "todo" | "wishlist" }

function distanceHint(km: number): string { return km < 1 ? `≈${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`; }

export function dayIdeasRows(i: { stopName: string; thingsToDo: Array<{ id: string; title: string; category: string; startTime: string | null }>; wishlist: Array<{ id: string; title: string; category: string; distanceKm: number | null; reason: "nearby" | "country" | "unlocated" }>; limit?: number }): { rows: IdeaRow[]; more: number; eyebrow: string | null } {
  const limit = i.limit ?? 3;
  const all: IdeaRow[] = [
    ...i.thingsToDo.map((t) => ({ id: t.id, title: t.title, category: t.category, hint: t.startTime ? `from ${t.startTime}` : null, pool: "todo" as const })),
    ...i.wishlist.map((w) => ({ id: w.id, title: w.title, category: w.category, hint: w.reason === "nearby" && w.distanceKm != null ? distanceHint(w.distanceKm) : w.reason === "country" ? "same country" : null, pool: "wishlist" as const })),
  ];
  const rows = all.slice(0, limit);
  if (rows.length === 0) return { rows, more: 0, eyebrow: null };
  const onlyWishlist = rows.every((r) => r.pool === "wishlist");
  const stop = i.stopName.toUpperCase();
  return { rows, more: all.length - rows.length, eyebrow: onlyWishlist ? `FROM YOUR WISHLIST IN ${stop}` : `IDEAS FOR ${stop}` };
}

export const forecastOpensOn = (dateISO: string) => formatDayLabel(addDays(dateISO, -15));
