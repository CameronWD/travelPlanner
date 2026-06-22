/**
 * Pure RFC-5545 (iCalendar) serializer for a trip's timeline.
 * No React/Prisma/network. Timed events are emitted in UTC; all-day events use
 * VALUE=DATE. Deterministic given `generatedAt`.
 */

import { addDays } from "@/lib/dates";
import { zonedWallTimeToInstant } from "@/lib/tz";

export interface IcsStop {
  id: string;
  name: string;
  timezone: string;
}
export interface IcsItem {
  id: string;
  title: string;
  category: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  stopId?: string | null;
  address?: string | null;
  link?: string | null;
  booking?: string | null;
  notes?: string | null;
}
export interface IcsTransport {
  id: string;
  mode: string;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | string | null;
  arrAt?: Date | string | null;
  reference?: string | null;
}
export interface IcsAccommodation {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  address?: string | null;
  confirmation?: string | null;
  notes?: string | null;
}
export interface IcsInput {
  tripName: string;
  stops: IcsStop[];
  items: IcsItem[];
  transports: IcsTransport[];
  accommodations: IcsAccommodation[];
  generatedAt: Date;
}

const CRLF = "\r\n";

/** Escape RFC-5545 TEXT values. */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** YYYYMMDD for all-day dates. */
function dateValue(dateISO: string): string {
  return dateISO.replace(/-/g, "");
}

/** YYYYMMDDTHHMMSSZ from a UTC instant. */
function utcStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fold a content line at 75 octets per RFC-5545 (continuations begin with a space). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return chunks.join(CRLF);
}

function buildDescription(parts: (string | null | undefined)[]): string | null {
  const joined = parts.filter((p) => p && p.trim()).join("\n");
  return joined ? joined : null;
}

export function buildICS(input: IcsInput): string {
  const { tripName, stops, items, transports, accommodations, generatedAt } = input;
  const tzById = new Map(stops.map((s) => [s.id, s.timezone] as const));
  const stamp = utcStamp(generatedAt);
  const lines: string[] = [];

  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Trip Planner//Calendar Feed//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${esc(tripName)}`);

  const event = (
    uid: string,
    summary: string,
    dtStartLine: string,
    dtEndLine: string,
    location?: string | null,
    description?: string | null,
    category?: string | null,
  ) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(dtStartLine);
    lines.push(dtEndLine);
    lines.push(`SUMMARY:${esc(summary)}`);
    if (location) lines.push(`LOCATION:${esc(location)}`);
    if (description) lines.push(`DESCRIPTION:${esc(description)}`);
    if (category) lines.push(`CATEGORIES:${esc(category)}`);
    lines.push("END:VEVENT");
  };

  // Items
  for (const it of items) {
    if (!it.date) continue;
    const desc = buildDescription([it.notes, it.link, it.booking ? `Booking: ${it.booking}` : null]);
    if (it.startTime) {
      const tz = (it.stopId && tzById.get(it.stopId)) || "UTC";
      const start = zonedWallTimeToInstant(it.date, it.startTime, tz);
      const end = it.endTime
        ? zonedWallTimeToInstant(it.date, it.endTime, tz)
        : new Date(start.getTime() + 60 * 60 * 1000); // default 1h
      event(`item-${it.id}@trip-planner`, it.title, `DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`, it.address, desc, it.category);
    } else {
      event(
        `item-${it.id}@trip-planner`,
        it.title,
        `DTSTART;VALUE=DATE:${dateValue(it.date)}`,
        `DTEND;VALUE=DATE:${dateValue(addDays(it.date, 1))}`,
        it.address,
        desc,
        it.category,
      );
    }
  }

  // Transport
  for (const t of transports) {
    const dep = toDate(t.depAt);
    if (!dep) continue;
    const arr = toDate(t.arrAt) ?? new Date(dep.getTime() + 60 * 60 * 1000);
    const route = [t.depPlace, t.arrPlace].filter(Boolean).join(" → ") || "Transport";
    const summary = `✈ ${route}${t.reference ? ` ${t.reference}` : ""}`;
    event(`transport-${t.id}@trip-planner`, summary, `DTSTART:${utcStamp(dep)}`, `DTEND:${utcStamp(arr)}`, null, null, "Transport");
  }

  // Accommodation (multi-day all-day block)
  for (const a of accommodations) {
    const desc = buildDescription([a.notes, a.confirmation ? `Confirmation: ${a.confirmation}` : null]);
    event(
      `accom-${a.id}@trip-planner`,
      `🛏 Stay: ${a.name}`,
      `DTSTART;VALUE=DATE:${dateValue(a.checkIn)}`,
      `DTEND;VALUE=DATE:${dateValue(a.checkOut)}`,
      a.address,
      desc,
      "Accommodation",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}
