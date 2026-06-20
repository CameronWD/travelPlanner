/**
 * Trip itinerary projection — PURE, framework-free day-by-day planner.
 *
 * Takes raw trip data (stops, items, transports, accommodations) and
 * projects it onto a per-day timeline. No network calls, no Prisma, no
 * React — completely unit-testable.
 */

import { addDays, daysBetween } from "@/lib/dates";
import { instantToZonedDateISO } from "@/lib/tz";

// ---------------------------------------------------------------------------
// Minimal input shapes
// (These intentionally mirror the Prisma shapes but without Prisma's runtime,
//  so the projection stays framework-free and fully testable in Vitest.)
// ---------------------------------------------------------------------------

export interface ItineraryStop {
  id: string;
  name: string;
  country?: string | null;
  timezone: string; // IANA timezone
  arriveDate: string; // YYYY-MM-DD
  departDate: string; // YYYY-MM-DD
  sortOrder: number;
}

export interface ItineraryItem {
  id: string;
  title: string;
  category: string;
  date?: string | null; // YYYY-MM-DD — null/undefined = unscheduled
  startTime?: string | null; // HH:MM
  endTime?: string | null; // HH:MM
  stopId?: string | null;
  address?: string | null;
  link?: string | null;
  booking?: string | null;
  notes?: string | null;
}

export interface ItineraryTransport {
  id: string;
  mode: string;
  fromStopId?: string | null;
  toStopId?: string | null;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | string | null; // DateTime instant
  arrAt?: Date | string | null; // DateTime instant
  reference?: string | null;
  notes?: string | null;
}

export interface ItineraryAccommodation {
  id: string;
  stopId: string;
  name: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  address?: string | null;
  confirmation?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Day entry types
// ---------------------------------------------------------------------------

export type TransportDepartureEntry = {
  kind: "transport-departure";
  transport: ItineraryTransport;
  /** True when the arrival falls on the SAME calendar day as the departure. */
  arrivesSameDay: boolean;
  /**
   * The YYYY-MM-DD arrival date (in the toStop/fromStop timezone) when it
   * differs from the departure day. Undefined when arrivesSameDay is true or
   * when there is no arrAt.
   */
  arrivalDateISO?: string;
};

export type TransportArrivalEntry = {
  kind: "transport-arrival";
  transport: ItineraryTransport;
};

export type AccommodationCheckinEntry = {
  kind: "accommodation-checkin";
  accommodation: ItineraryAccommodation;
};

export type AccommodationCheckoutEntry = {
  kind: "accommodation-checkout";
  accommodation: ItineraryAccommodation;
};

export type ItemEntry = {
  kind: "item";
  item: ItineraryItem;
};

export type DayEntry =
  | TransportDepartureEntry
  | TransportArrivalEntry
  | AccommodationCheckinEntry
  | AccommodationCheckoutEntry
  | ItemEntry;

// ---------------------------------------------------------------------------
// DayPlan
// ---------------------------------------------------------------------------

export interface DayPlan {
  /** YYYY-MM-DD */
  dateISO: string;
  /** Which stop you are based at on this day; null for gap days. */
  stop: ItineraryStop | null;
  /** Items that have a startTime — sorted ascending by startTime. */
  timedItems: ItemEntry[];
  /** Items without a startTime (date set, but no time). */
  untimedItems: ItemEntry[];
  /** Transport entries (departures + arrivals landing on this day). */
  transportEntries: (TransportDepartureEntry | TransportArrivalEntry)[];
  /** Accommodation check-in / check-out entries for this day. */
  accommodationEntries: (AccommodationCheckinEntry | AccommodationCheckoutEntry)[];
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Returns an inclusive list of YYYY-MM-DD strings from startDate to endDate.
 */
export function enumerateTripDays(
  startDate: string,
  endDate: string,
): string[] {
  const count = daysBetween(startDate, endDate);
  const days: string[] = [];
  for (let i = 0; i <= count; i++) {
    days.push(addDays(startDate, i));
  }
  return days;
}

/**
 * Returns the stop that covers `dateISO` (arriveDate <= date <= departDate).
 *
 * When multiple stops match (rare edge-case overlap), the one with the latest
 * arriveDate <= date wins (most recent arrival). Returns null for gap days.
 */
export function stopForDate(
  stops: ItineraryStop[],
  dateISO: string,
): ItineraryStop | null {
  const candidates = stops.filter(
    (s) => s.arriveDate <= dateISO && s.departDate >= dateISO,
  );
  if (candidates.length === 0) return null;

  // Pick the most-recently-arrived stop (latest arriveDate that is <= dateISO)
  return candidates.reduce((best, s) =>
    s.arriveDate > best.arriveDate ? s : best,
  );
}

/**
 * Safely coerce a Date | string | null | undefined to a Date, or null.
 */
function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Return the timezone of a stop, or 'UTC' if none.
 */
function tzOf(stop: ItineraryStop | undefined | null): string {
  return stop?.timezone || "UTC";
}

// ---------------------------------------------------------------------------
// Main projection
// ---------------------------------------------------------------------------

export interface BuildItineraryInput {
  startDate: string;
  endDate: string;
  stops: ItineraryStop[];
  items: ItineraryItem[];
  transports: ItineraryTransport[];
  accommodations: ItineraryAccommodation[];
}

/**
 * Build one DayPlan per calendar day in [startDate, endDate] (inclusive).
 *
 * - Items: scheduled items (date != null) slotted on their date; split into
 *   timedItems (have startTime, sorted asc) and untimedItems.
 * - Transport: departure entry on depAt's calendar date (in fromStop tz);
 *   arrival entry on arrAt's calendar date (in toStop tz) when it differs.
 * - Accommodation: check-in entry on checkIn day, checkout on checkOut day
 *   (only when those days fall within [startDate, endDate]).
 */
export function buildItinerary({
  startDate,
  endDate,
  stops,
  items,
  transports,
  accommodations,
}: BuildItineraryInput): DayPlan[] {
  const days = enumerateTripDays(startDate, endDate);

  // Index stops by id for quick lookup
  const stopById = new Map<string, ItineraryStop>(stops.map((s) => [s.id, s]));

  // Build lookup maps keyed by YYYY-MM-DD for O(1) assignment
  const itemsByDate = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    if (!item.date) continue; // unscheduled — excluded from projection
    const existing = itemsByDate.get(item.date) ?? [];
    existing.push(item);
    itemsByDate.set(item.date, existing);
  }

  // Transport: compute which day each departure / arrival lands on
  type TransportDateEntry = {
    dateISO: string;
    entry: TransportDepartureEntry | TransportArrivalEntry;
  };
  const transportDateEntries: TransportDateEntry[] = [];

  for (const transport of transports) {
    const depDate = toDate(transport.depAt);
    if (!depDate) continue; // no depAt → skip from day projection

    const fromStop = transport.fromStopId
      ? stopById.get(transport.fromStopId)
      : undefined;
    const toStop = transport.toStopId
      ? stopById.get(transport.toStopId)
      : undefined;

    const depTz = tzOf(fromStop);
    const depDayISO = instantToZonedDateISO(depDate, depTz);

    let arrDayISO: string | undefined;
    const arrDate = toDate(transport.arrAt);
    if (arrDate) {
      const arrTz = tzOf(toStop ?? fromStop);
      arrDayISO = instantToZonedDateISO(arrDate, arrTz);
    }

    const arrivesSameDay = Boolean(arrDayISO && arrDayISO === depDayISO);
    const arrivalDateISO =
      arrDayISO && !arrivesSameDay ? arrDayISO : undefined;

    // Departure entry
    transportDateEntries.push({
      dateISO: depDayISO,
      entry: {
        kind: "transport-departure",
        transport,
        arrivesSameDay,
        arrivalDateISO,
      },
    });

    // Arrival entry on a different day
    if (arrDayISO && arrDayISO !== depDayISO) {
      transportDateEntries.push({
        dateISO: arrDayISO,
        entry: {
          kind: "transport-arrival",
          transport,
        },
      });
    }
  }

  // Group transport entries by date
  const transportByDate = new Map<
    string,
    (TransportDepartureEntry | TransportArrivalEntry)[]
  >();
  for (const { dateISO, entry } of transportDateEntries) {
    const existing = transportByDate.get(dateISO) ?? [];
    existing.push(entry);
    transportByDate.set(dateISO, existing);
  }

  // Accommodation: index check-in / check-out by date
  type AccomDateEntry = {
    dateISO: string;
    entry: AccommodationCheckinEntry | AccommodationCheckoutEntry;
  };
  const accomDateEntries: AccomDateEntry[] = [];

  for (const acc of accommodations) {
    if (acc.checkIn >= startDate && acc.checkIn <= endDate) {
      accomDateEntries.push({
        dateISO: acc.checkIn,
        entry: { kind: "accommodation-checkin", accommodation: acc },
      });
    }
    if (acc.checkOut >= startDate && acc.checkOut <= endDate) {
      accomDateEntries.push({
        dateISO: acc.checkOut,
        entry: { kind: "accommodation-checkout", accommodation: acc },
      });
    }
  }

  const accomByDate = new Map<
    string,
    (AccommodationCheckinEntry | AccommodationCheckoutEntry)[]
  >();
  for (const { dateISO, entry } of accomDateEntries) {
    const existing = accomByDate.get(dateISO) ?? [];
    existing.push(entry);
    accomByDate.set(dateISO, existing);
  }

  // Build one DayPlan per day
  return days.map((dateISO) => {
    const stop = stopForDate(stops, dateISO);

    // Items for this day
    const dayItems = itemsByDate.get(dateISO) ?? [];
    const timedItems: ItemEntry[] = dayItems
      .filter((item) => Boolean(item.startTime))
      .sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1))
      .map((item) => ({ kind: "item" as const, item }));

    const untimedItems: ItemEntry[] = dayItems
      .filter((item) => !item.startTime)
      .map((item) => ({ kind: "item" as const, item }));

    return {
      dateISO,
      stop,
      timedItems,
      untimedItems,
      transportEntries: transportByDate.get(dateISO) ?? [],
      accommodationEntries: accomByDate.get(dateISO) ?? [],
    };
  });
}
