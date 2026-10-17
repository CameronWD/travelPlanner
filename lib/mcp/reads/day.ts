/**
 * get_day (spec 2026-10-16 F7): one dated day as the Day view shows it. It
 * reads through the Day view's own rows and assembly (`readDayRows` +
 * `buildDayModel`, lib/day-reads.ts / lib/day-view-model.ts), so the two
 * agree by construction, Surprise masking included: a hidden Surprise Item
 * is a "Surprise" placeholder at its time, and a hidden Stop is its shell.
 * Real plan only: readDayRows never reads a Fork.
 */
import { notFound } from "next/navigation";
import { requireTripAccess } from "@/lib/guards";
import { readDayRows } from "@/lib/day-reads";
import { buildDayModel, nightOfStay } from "@/lib/day-view-model";
import { orderDayEntries, type ItemEntry } from "@/lib/itinerary";
import { fail, type ActionFailure } from "@/lib/action-result";
import { toMcpDayItem, toMcpSurprise, type McpDayItem, type McpSurprise } from "./plan-shapes";

/** One entry of a day's timeline, in the Day view's order (`orderDayEntries`). */
type McpDayEntry =
  | { kind: "item"; item: McpDayItem }
  | {
      kind: "departure"; transportId: string; mode: string;
      /** HH:MM in the departure end's zone; null while untimed. */
      time: string | null; from: string | null; to: string | null;
      /** YYYY-MM-DD the leg arrives (this date when it lands the same day); null while untimed. */
      arrivesOn: string | null;
      /** HH:MM in the arrival end's zone, only when it lands the same day. */
      arrivesAt: string | null;
    }
  | { kind: "arrival"; transportId: string; mode: string; time: string | null; from: string | null; to: string | null }
  | { kind: "check-out" | "check-in"; accommodationId: string; name: string; time: string | null };

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
  tonight: {
    id: string; name: string; address: string | null; checkIn: string; checkOut: string;
    confirmation: string | null; notes: string | null; nightOf: { night: number; of: number } | null;
  } | null;
  timeline: McpDayEntry[];
  /** The day's untimed things to do. */
  anytime: McpDayItem[];
}

export async function loadDayForMcp(tripId: string, date: string): Promise<McpDay | ActionFailure> {
  const { user } = await requireTripAccess(tripId);
  const read = await readDayRows(tripId, user.id, async () => null);
  if (read === "missing") notFound();
  // A start with no end is still "no dates yet" for get_day: readDayRows
  // reads it as a one-day Trip, which would offer Claude a day that isn't.
  if (read === "dateless" || read.rows.trip.endDate === null) {
    return fail({ date: ["This trip has no dates yet, so it has no days. Read it with get_trip_plan."] });
  }
  const { rows } = read;
  if (date < rows.startDate || date > rows.endDate) {
    return fail({ date: [`${date} is outside the trip, which runs ${rows.startDate} to ${rows.endDate}.`] });
  }

  const model = buildDayModel(rows, date);
  const dayPlan = model.dayPlan!; // non-null for a date inside the Trip
  const ordered = orderDayEntries(dayPlan);

  const filesFor = (_kind: string, id: string) =>
    (model.attachmentsByTarget[id] ?? []).map((a) => ({ id: a.id, title: a.title ?? a.filename }));
  const stopName = new Map(rows.stops.map((s) => [s.id, s.name]));
  const item = (e: ItemEntry): McpDayItem => toMcpDayItem(e.item, filesFor, stopName);
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
        };
      case "transport-arrival":
        return {
          kind: "arrival", transportId: e.transport.id, mode: e.transport.mode, time: e.arrTimeLabel ?? null,
          from: endName(e.transport.depIsHome, e.transport.fromStopId, e.transport.depPlace),
          to: endName(e.transport.arrIsHome, e.transport.toStopId, e.transport.arrPlace),
        };
      case "accommodation-checkout":
        return { kind: "check-out", accommodationId: e.accommodation.id, name: e.accommodation.name, time: e.accommodation.checkOutTime ?? null };
      case "accommodation-checkin":
        return { kind: "check-in", accommodationId: e.accommodation.id, name: e.accommodation.name, time: e.accommodation.checkInTime ?? null };
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
      ? { id: bed.id, name: bed.name, address: bed.address, checkIn: bed.checkIn, checkOut: bed.checkOut, confirmation: bed.confirmation, notes: bed.notes, nightOf: nightOfStay(date, bed.checkIn, bed.checkOut) }
      : null,
    timeline,
    anytime: ordered.anytime.map(item),
  };
}
