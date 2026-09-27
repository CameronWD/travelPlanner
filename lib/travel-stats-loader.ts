/**
 * "Your travels" — Travel stats loader (spec §M). Plain lib module — NOT a
 * Server Action — because it takes `userId` from the caller (the /trips
 * page, which already has the session from its own `requireUser()` call)
 * rather than establishing its own. Loads every Trip the user is a
 * TripMember of, real plan only (`REAL_PLAN` — Stops/Transports/
 * Accommodations are Fork-scoped; Trip itself isn't), and hands the result to
 * the pure `computeTravelStats` (`lib/travel-stats.ts`) so the aggregation
 * rules live in exactly one, framework-free place.
 */
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { instantToZonedDateISO } from "@/lib/tz";
import { computeTravelStats, type TravelTrip, type TravelStats } from "@/lib/travel-stats";

/** Load Travel stats for every Trip `userId` is a TripMember of. */
export async function loadTravelStats(userId: string, today: string): Promise<TravelStats> {
  const memberships = await db.tripMember.findMany({
    where: { userId },
    select: { tripId: true },
  });
  const tripIds = memberships.map((m) => m.tripId);
  if (tripIds.length === 0) return computeTravelStats([], today);

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

    const stops = (stopsByTrip.get(trip.id) ?? []).map((s) => ({
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
    };
  });

  return computeTravelStats(trips, today);
}
