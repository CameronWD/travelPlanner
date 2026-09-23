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
  // A rough Stop has no arriveDate and so no stored timezone. Both consumers
  // below already handle it: the Item branch falls back to "UTC" for a
  // timed event's DTSTART/DTEND (`|| "UTC"`, safe — an all-day/timed event
  // still needs SOME zone to compute an instant), and the Accommodation
  // check-out Alarm treats a missing zone as "skip the Alarm" (`&& tz`,
  // deliberately no fallback — see the comment at that call site for why a
  // wrong Alarm is worse than none). Typed `string | null`, not defaulted to
  // "UTC" by a caller, so a truthy-but-wrong default can never slip past the
  // `&& tz` guard again (that was reachable only by three separate
  // invariants holding, before this type made it impossible outright).
  timezone: string | null;
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
}
export interface IcsTransport {
  id: string;
  mode: string;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | string | null;
  arrAt?: Date | string | null;
}
export interface IcsAccommodation {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  address?: string | null;
  checkOutTime?: string | null;
  stopId?: string | null;
}

export interface IcsAlarmOptions {
  transport: boolean;
  checkOut: boolean;
}

export interface IcsInput {
  tripName: string;
  stops: IcsStop[];
  items: IcsItem[];
  transports: IcsTransport[];
  accommodations: IcsAccommodation[];
  generatedAt: Date;
  /** Absent means no Alarms are published at all. */
  alarms?: IcsAlarmOptions;
}

const CRLF = "\r\n";

/** Lead times for Alarms published into the feed (ADR 0047). */
export const FLIGHT_ALARM_LEAD_MINUTES = 180;
export const TRANSPORT_ALARM_LEAD_MINUTES = 120;
/** Local wall-clock time a check-out Alarm fires on the check-out day. */
export const CHECK_OUT_ALARM_LOCAL_TIME = "08:00";

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

/** A DISPLAY VALARM block. `triggerLine` is the full TRIGGER content line. */
function alarmBlock(triggerLine: string, description: string): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    triggerLine,
    `DESCRIPTION:${esc(description)}`,
    "END:VALARM",
  ];
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
    alarmLines?: string[],
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
    if (alarmLines) lines.push(...alarmLines);
    lines.push("END:VEVENT");
  };

  // Items
  for (const it of items) {
    if (!it.date) continue;
    // ARCH-TEN-7: notes/booking are never fed in from the route's select
    // (dropped upstream) — link is the only text left to describe an item.
    const desc = buildDescription([it.link]);
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
    // ARCH-TEN-7: no ticket/booking reference here — it used to be appended
    // to SUMMARY, which is worse than DESCRIPTION: a booking ref in the
    // event *title* propagates into calendar previews, notifications and
    // lock screens. Dropped upstream by the route's select.
    const summary = `✈ ${route}`;
    const alarm =
      input.alarms?.transport === true
        ? alarmBlock(
            // Minutes, not hours: an RFC-5545 duration takes whole numbers
            // only, so dividing by 60 emits "-PT1.5H" — which no calendar app
            // has to honour — the moment a lead stops being a multiple of 60.
            // The constants are already declared in minutes; say so.
            `TRIGGER:-PT${t.mode === "FLIGHT" ? FLIGHT_ALARM_LEAD_MINUTES : TRANSPORT_ALARM_LEAD_MINUTES}M`,
            `${route} departs soon`,
          )
        : undefined;
    event(`transport-${t.id}@trip-planner`, summary, `DTSTART:${utcStamp(dep)}`, `DTEND:${utcStamp(arr)}`, null, null, "Transport", alarm);
  }

  // Accommodation (multi-day all-day block)
  for (const a of accommodations) {
    // ARCH-TEN-7: notes/confirmation are never fed in from the route's
    // select (dropped upstream) — an Accommodation VEVENT has no
    // DESCRIPTION left to build. The confirmation stays in the app, offline,
    // behind the Traveller's account.
    const desc: string | null = null;
    // A rough Stop (no arriveDate) has no stored timezone and is excluded
    // from `stops`/`tzById` by the route's query, even though its
    // Accommodation is still fetched and published below. Falling back to
    // UTC — as DTSTART/DTEND safely do, since those are all-day VALUE=DATE
    // dates with no zone to get wrong — would instead resolve the alarm's
    // wall-clock trigger against the wrong zone and fire it at a confidently
    // incorrect hour (08:00Z lands mid-morning in Europe, mid-afternoon in
    // Australia). TEEPEE never sends the Alarm itself and cannot learn
    // whether the Traveller's own calendar app fired it (CONTEXT.md's Alarm
    // entry), so a wrong Alarm is never caught — it either wakes them at the
    // wrong time or is trusted past a check-out they had to make. No Alarm
    // is safer than a wrong one: skip it here, but still publish the event.
    const tz = a.stopId ? tzById.get(a.stopId) : undefined;
    const alarm =
      input.alarms?.checkOut === true && tz
        ? alarmBlock(
            `TRIGGER;VALUE=DATE-TIME:${utcStamp(
              zonedWallTimeToInstant(a.checkOut, CHECK_OUT_ALARM_LOCAL_TIME, tz),
            )}`,
            `Check out of ${a.name}${a.checkOutTime ? ` by ${a.checkOutTime}` : ""}`,
          )
        : undefined;
    event(
      `accom-${a.id}@trip-planner`,
      `🛏 Stay: ${a.name}`,
      `DTSTART;VALUE=DATE:${dateValue(a.checkIn)}`,
      `DTEND;VALUE=DATE:${dateValue(a.checkOut)}`,
      a.address,
      desc,
      "Accommodation",
      alarm,
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}
