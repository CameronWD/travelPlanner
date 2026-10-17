/**
 * get_day (spec 2026-10-16 F7): one dated day as the Day view shows it. It
 * reads through the Day view's own rows and assembly (`readDayRows` +
 * `buildDayModel`, lib/day-reads.ts / lib/day-view-model.ts), so the two
 * agree by construction, Surprise masking included: a hidden Surprise Item
 * is a "Surprise" placeholder at its time, and a hidden Stop is its shell.
 * Real plan only: readDayRows never reads a Fork.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { readDayRows } from "@/lib/day-reads";
import { buildDayModel, nightOfStay } from "@/lib/day-view-model";
import { orderDayEntries, type ItemEntry } from "@/lib/itinerary";
import { fail, type ActionFailure } from "@/lib/action-result";
import { REAL_PLAN } from "@/lib/plan-scope";
import type { BookingState } from "@/lib/enum-values";
import { toMcpDayItem, toMcpSurprise, type McpDayItem, type McpSurprise } from "./plan-shapes";

/** CONTEXT.md "Booking state", as get_trip_plan's legs and stays carry it. */
interface McpBooking {
  /** NONE (no booking needed), TO_BOOK or BOOKED. Booked is not paid (that's the Cost). */
  bookingState: BookingState;
  /** YYYY-MM-DD it should be booked by; only while TO_BOOK. */
  bookBy: string | null;
}

/** One entry of a day's timeline, in the Day view's order (`orderDayEntries`). */
type McpDayEntry =
  | { kind: "item"; item: McpDayItem }
  | ({
      kind: "departure"; transportId: string; mode: string;
      /** HH:MM in the departure end's zone; null while untimed. */
      time: string | null; from: string | null; to: string | null;
      /** YYYY-MM-DD the leg arrives (this date when it lands the same day); null while untimed. */
      arrivesOn: string | null;
      /** HH:MM in the arrival end's zone, only when it lands the same day. */
      arrivesAt: string | null;
    } & McpBooking)
  | ({ kind: "arrival"; transportId: string; mode: string; time: string | null; from: string | null; to: string | null } & McpBooking)
  | ({ kind: "check-out" | "check-in"; accommodationId: string; name: string; time: string | null } & McpBooking);

/** get_day: one dated day of the real plan, as the Day view shows it to the acting Traveller. */
export interface McpDay {
  /** YYYY-MM-DD */
  date: string;
  dayNumber: number;
  totalDays: number;
  dayTitle: string | null;
  /** The Stop the day is at (the arriving one on a Changeover day); null on a gap day. */
  stop: { id: string; name: string; timezone: string | null; arriveDate: string; departDate: string; surprise: McpSurprise | null } | null;
  /** True when a Transport leg departs or arrives this day. */
  travelDay: boolean;
  /** Tonight's bed (checkIn <= date < checkOut). */
  tonight: ({
    id: string; name: string; address: string | null; checkIn: string; checkOut: string;
    confirmation: string | null; notes: string | null; nightOf: { night: number; of: number } | null;
  } & McpBooking) | null;
  timeline: McpDayEntry[];
  /** The day's untimed things to do. */
  anytime: McpDayItem[];
}

export async function loadDayForMcp(tripId: string, date: string): Promise<McpDay | ActionFailure> {
  const { user } = await requireTripAccess(tripId);
  // Fix round 1 (controller ruling): readDayRows' own `rows.stops` holds only
  // dated real-plan Stops (its stopRows query excludes rough ones), which
  // made a rough Stop's owningStop.name resolve to nothing. Fetch every
  // real-plan Stop's name here instead — the same query readMcpStops makes
  // (entities.ts) — so a thing owned by a rough Stop still gets its real name.
  const read = await readDayRows(tripId, user.id, async () =>
    db.stop.findMany({ where: { tripId, ...REAL_PLAN }, select: { id: true, name: true } }),
  );
  if (read === "missing") notFound();
  // A start with no end is still "no dates yet" for get_day: readDayRows
  // reads it as a one-day Trip, which would offer Claude a day that isn't.
  if (read === "dateless" || read.rows.trip.endDate === null) {
    return fail({ date: ["This trip has no dates yet, so it has no days. Read it with get_trip_plan."] });
  }
  const { rows, alongside: stopRows } = read;
  if (date < rows.startDate || date > rows.endDate) {
    return fail({ date: [`${date} is outside the trip, which runs ${rows.startDate} to ${rows.endDate}.`] });
  }

  const model = buildDayModel(rows, date);
  const dayPlan = model.dayPlan!; // non-null for a date inside the Trip
  const ordered = orderDayEntries(dayPlan);

  const filesFor = (_kind: string, id: string) =>
    (model.attachmentsByTarget[id] ?? []).map((a) => ({ id: a.id, title: a.title ?? a.filename }));
  const stopName = new Map(stopRows.map((s) => [s.id, s.name]));
  const item = (e: ItemEntry): McpDayItem => toMcpDayItem(e.item, filesFor, stopName);
  // The timeline's legs and stays are itinerary entries; their Booking state
  // comes from the day's own rows, as stored (get_trip_plan's rule).
  const booking = new Map<string, McpBooking>(
    [...rows.transports, ...rows.accommodations].map((r) => [r.id, { bookingState: r.bookingState, bookBy: r.bookBy }]),
  );
  const bookingOf = (id: string): McpBooking => booking.get(id)!;
  const home = rows.trip.homeName ?? "Home";
  const endName = (isHome: boolean | null | undefined, stopId: string | null | undefined, place: string | null | undefined) =>
    isHome ? home : ((stopId ? stopName.get(stopId) : undefined) ?? place ?? null);

  const timeline: McpDayEntry[] = ordered.entries.map((e): McpDayEntry => {
    switch (e.kind) {
      case "item":
        return { kind: "item", item: item(e) };
      case "transport-departure":
        return {
          kind: "departure", transportId: e.transport.id, mode: e.transport.mode, time: e.depTimeLabel ?? null,
          from: endName(e.transport.depIsHome, e.transport.fromStopId, e.transport.depPlace),
          to: endName(e.transport.arrIsHome, e.transport.toStopId, e.transport.arrPlace),
          arrivesOn: e.arrivesSameDay ? date : (e.arrivalDateISO ?? null),
          arrivesAt: e.arrivesSameDay ? (e.arrTimeLabel ?? null) : null,
          ...bookingOf(e.transport.id),
        };
      case "transport-arrival":
        return {
          kind: "arrival", transportId: e.transport.id, mode: e.transport.mode, time: e.arrTimeLabel ?? null,
          from: endName(e.transport.depIsHome, e.transport.fromStopId, e.transport.depPlace),
          to: endName(e.transport.arrIsHome, e.transport.toStopId, e.transport.arrPlace),
          ...bookingOf(e.transport.id),
        };
      case "accommodation-checkout":
        return { kind: "check-out", accommodationId: e.accommodation.id, name: e.accommodation.name, time: e.accommodation.checkOutTime ?? null, ...bookingOf(e.accommodation.id) };
      case "accommodation-checkin":
        return { kind: "check-in", accommodationId: e.accommodation.id, name: e.accommodation.name, time: e.accommodation.checkInTime ?? null, ...bookingOf(e.accommodation.id) };
    }
  });

  const s = model.dayStop;
  const bed = model.tonight;
  return {
    date,
    dayNumber: model.dayNumber,
    totalDays: model.totalDays,
    dayTitle: model.dayTitle?.title ?? null,
    stop: s ? { id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate!, departDate: s.departDate!, surprise: toMcpSurprise(s.surprise) } : null,
    travelDay: dayPlan.transportEntries.length > 0, // the Day view's own rule (lib/day-view-loader.ts)
    tonight: bed
      ? { id: bed.id, name: bed.name, address: bed.address, checkIn: bed.checkIn, checkOut: bed.checkOut, confirmation: bed.confirmation, notes: bed.notes, nightOf: nightOfStay(date, bed.checkIn, bed.checkOut), bookingState: bed.bookingState, bookBy: bed.bookBy }
      : null,
    timeline,
    anytime: ordered.anytime.map(item),
  };
}
