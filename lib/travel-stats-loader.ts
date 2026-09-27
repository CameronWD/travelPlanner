/**
 * "Your travels" — Travel stats + Travel map loader (spec §M). Plain lib
 * module — NOT a Server Action — because it takes `userId` from the caller
 * (the /trips page, which already has the session from its own
 * `requireUser()` call) rather than establishing its own. Loads every Trip
 * the user is a TripMember of, real plan only (`REAL_PLAN` — Stops/
 * Transports/Accommodations are Fork-scoped; Trip itself isn't).
 *
 * `loadYourTravels` is the one entry point that does the actual queries: it
 * feeds the SAME fetched rows to both the pure `computeTravelStats`
 * (`lib/travel-stats.ts`) — Travel stats — and to the Travel map's per-Trip
 * route points, so the "Your travels" section never queries the database
 * twice for the same data. `loadTravelStats` stays as a thin wrapper around
 * it (same signature as before) for any caller that only wants the stats.
 */
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { instantToZonedDateISO } from "@/lib/tz";
import { orderPlanStops } from "@/lib/plan-order";
import { formatDateRange, formatDayLabel, todayISO } from "@/lib/dates";
import { tripTodayISO } from "@/lib/trip-today";
import { computeTripPhase } from "@/lib/trip-phase";
import { computeTravelStats, type TravelTrip, type TravelStats } from "@/lib/travel-stats";

/** A located point on the Travel map's route for one Trip. */
export interface TravelMapPoint {
  lat: number;
  lng: number;
  name: string;
}

/** One Trip's route on the Travel map (spec §M / components/trips/travel-map.tsx). */
export interface TravelMapTrip {
  id: string;
  name: string;
  /** e.g. "12–20 Jun 2026" (formatDateRange) or "Not dated yet". */
  dateLabel: string;
  when: "past" | "now" | "upcoming";
  /** Canonical plan order (ADR 0038), located Stops only. */
  points: TravelMapPoint[];
}

export interface YourTravels {
  stats: TravelStats;
  mapTrips: TravelMapTrip[];
}

function dateLabelFor(startDate: string | null, endDate: string | null): string {
  if (startDate && endDate) return formatDateRange(startDate, endDate);
  if (startDate) return formatDayLabel(startDate);
  return "Not dated yet";
}

function whenFor(startDate: string | null, endDate: string | null, today: string): TravelMapTrip["when"] {
  const phase = computeTripPhase({ startDate, endDate, today });
  if (phase === "travelling") return "now";
  if (phase === "past") return "past";
  return "upcoming"; // sketching | planning | final-prep
}

/**
 * Load both Travel stats and the Travel map's per-Trip routes for every Trip
 * `userId` is on.
 *
 * Each Trip is judged against its OWN local today (`tripTodayISO`, final
 * review #12) — never one global UTC date. `today`, when given, pins every
 * Trip to that one date instead (tests; deterministic callers).
 */
export async function loadYourTravels(userId: string, today?: string): Promise<YourTravels> {
  const memberships = await db.tripMember.findMany({
    where: { userId },
    select: { tripId: true },
  });
  const tripIds = memberships.map((m) => m.tripId);
  if (tripIds.length === 0) return { stats: computeTravelStats([], today ?? todayISO()), mapTrips: [] };

  const [tripRows, stopRows, transportRows, accommodationRows] = await Promise.all([
    db.trip.findMany({
      where: { id: { in: tripIds } },
      select: { id: true, name: true, startDate: true, endDate: true, homeLat: true, homeLng: true },
    }),
    db.stop.findMany({
      where: { tripId: { in: tripIds }, ...REAL_PLAN },
      select: {
        id: true,
        tripId: true,
        name: true,
        countryCode: true,
        lat: true,
        lng: true,
        timezone: true,
        sortOrder: true,
        arriveDate: true,
        departDate: true,
      },
    }),
    db.transport.findMany({
      where: { tripId: { in: tripIds }, ...REAL_PLAN },
      select: {
        tripId: true,
        mode: true,
        depAt: true,
        fromStopId: true,
        toStopId: true,
        depIsHome: true,
        arrIsHome: true,
      },
    }),
    db.accommodation.findMany({
      where: { tripId: { in: tripIds }, ...REAL_PLAN },
      select: { tripId: true, checkIn: true, checkOut: true },
    }),
  ]);

  const stopsById = new Map(stopRows.map((s) => [s.id, s]));

  const stopsByTrip = new Map<string, typeof stopRows>();
  for (const stop of stopRows) {
    const list = stopsByTrip.get(stop.tripId) ?? [];
    list.push(stop);
    stopsByTrip.set(stop.tripId, list);
  }
  const transportsByTrip = new Map<string, typeof transportRows>();
  for (const t of transportRows) {
    const list = transportsByTrip.get(t.tripId) ?? [];
    list.push(t);
    transportsByTrip.set(t.tripId, list);
  }
  const accommodationsByTrip = new Map<string, typeof accommodationRows>();
  for (const a of accommodationRows) {
    const list = accommodationsByTrip.get(a.tripId) ?? [];
    list.push(a);
    accommodationsByTrip.set(a.tripId, list);
  }

  const trips: TravelTrip[] = tripRows.map((trip) => {
    const home =
      trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null;

    const tripStops = stopsByTrip.get(trip.id) ?? [];
    const tripToday = today ?? tripTodayISO(tripStops);

    const stops = tripStops.map((s) => ({
      id: s.id,
      name: s.name,
      countryCode: s.countryCode,
      lat: s.lat,
      lng: s.lng,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
    }));

    const transports = (transportsByTrip.get(trip.id) ?? []).map((t) => {
      const fromStop = t.fromStopId ? stopsById.get(t.fromStopId) : undefined;
      const toStop = t.toStopId ? stopsById.get(t.toStopId) : undefined;

      const from = t.depIsHome
        ? home
        : fromStop?.lat != null && fromStop?.lng != null
          ? { lat: fromStop.lat, lng: fromStop.lng }
          : null;
      const to = t.arrIsHome
        ? home
        : toStop?.lat != null && toStop?.lng != null
          ? { lat: toStop.lat, lng: toStop.lng }
          : null;

      // Calendar date of departure, in the departing Stop's timezone —
      // mirrors lib/flags.ts's tzOf/instantToZonedDateISO pairing. A home
      // departure has no Stop of its own, so falls back to "UTC" like an
      // absent fromStop does there.
      const depAt = t.depAt ? instantToZonedDateISO(t.depAt, fromStop?.timezone ?? "UTC") : null;

      return { mode: t.mode, depAt, from, to };
    });

    const accommodations = (accommodationsByTrip.get(trip.id) ?? []).map((a) => ({
      checkIn: a.checkIn,
      checkOut: a.checkOut,
    }));

    return {
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      home,
      stops,
      transports,
      accommodations,
      today: tripToday,
    };
  });
  const todayByTrip = new Map(trips.map((t) => [t.id, t.today!] as const));

  const stats = computeTravelStats(trips, today ?? todayISO());

  // Travel map: canonical plan order (ADR 0038) per Trip, located Stops only.
  const mapTrips: TravelMapTrip[] = tripRows.map((trip) => {
    const tripStops = stopsByTrip.get(trip.id) ?? [];
    const points = orderPlanStops(tripStops)
      .filter((s): s is (typeof tripStops)[number] & { lat: number; lng: number } => s.lat != null && s.lng != null)
      .map((s) => ({ lat: s.lat, lng: s.lng, name: s.name }));

    return {
      id: trip.id,
      name: trip.name,
      dateLabel: dateLabelFor(trip.startDate, trip.endDate),
      when: whenFor(trip.startDate, trip.endDate, todayByTrip.get(trip.id) ?? today ?? todayISO()),
      points,
    };
  });

  return { stats, mapTrips };
}

/** Load Travel stats alone (thin wrapper around `loadYourTravels`). */
export async function loadTravelStats(userId: string, today?: string): Promise<TravelStats> {
  const { stats } = await loadYourTravels(userId, today);
  return stats;
}
