/**
 * "Your travels" — Travel stats (spec §M, CONTEXT.md "Your travels").
 *
 * PURE — no Prisma, no React, no network. Fully unit-testable. Aggregates
 * across EVERY Trip a Traveller is on (real plan only — the loader,
 * `lib/travel-stats-loader.ts`, is what enforces that scope and does the
 * Prisma queries; this module just crunches plain data).
 *
 * ---------------------------------------------------------------------------
 * Done vs planned — the one rule this whole module follows
 * ---------------------------------------------------------------------------
 * Every StatPair splits its total into what has already **happened** ("done")
 * and what is still **to come** ("planned"), relative to a single `today`
 * (a "YYYY-MM-DD" calendar date, passed in rather than read from the clock so
 * this stays pure). Concretely:
 *
 * - A **Stop** is done when it has a date and `arriveDate <= today`. A rough
 *   Stop (no dates at all) counts as planned — it hasn't happened, and never
 *   can until it's given a date.
 * - A **Trip** is done when it has a `startDate` and `startDate <= today`. A
 *   dateless Trip (no `startDate`) counts as planned — nothing about it has
 *   happened yet — and contributes no nights (there's nothing to split).
 * - A **Transport** leg is done when it has a `depAt` (a calendar date — the
 *   loader resolves the Stop-local day, mirroring `lib/flags.ts`) and
 *   `depAt <= today`. A leg with no `depAt` counts as planned (not yet
 *   booked/dated). Mode `OTHER` is excluded from the per-mode `transport`
 *   counts but its distance still counts (both are "a leg", the mode record
 *   just doesn't have an `OTHER` bucket).
 * - **Nights** (`nightsAway`, `accommodationNights`) split a date RANGE at
 *   `today` rather than classifying the whole range done/planned: done =
 *   nights from the start up to `min(end, today)`, planned = nights from
 *   `max(start, today)` to the end. `nightsBetween` already clamps a
 *   negative span to 0, so a wholly-past range naturally yields 0 planned
 *   nights and a wholly-future one 0 done nights, with no special-casing
 *   needed beyond skipping ranges missing a date.
 * - **Distance** sums `haversineKm` over Transport legs that have both
 *   endpoints resolved (the loader resolves an endpoint to either a Stop's
 *   coordinates or the Trip's Home base per `depIsHome`/`arrIsHome`); a leg
 *   missing either endpoint is skipped entirely, for both done and planned.
 * - **Countries**: `done` is the sorted, deduped, lowercased set of
 *   `countryCode`s of done Stops; `planned` is the same over planned Stops,
 *   with anything already in `done` removed — once a country's been visited
 *   it stops being "still to see", even if another (planned) Stop revisits it.
 *
 * The three fun facts (`longestTrip`, `mostVisitedCountry`,
 * `farthestFromHome`) all read from what's **already happened** — matching
 * the spec's "counting only what has happened" framing for stats generally —
 * so each only considers done Trips/Stops:
 * - `longestTrip`: the done Trip (has a `startDate <= today`, and an
 *   `endDate`) with the most nights (`nightsBetween(startDate, endDate)` —
 *   its full length, not just the done portion, since a Trip's length is
 *   known once it's started even if it runs past today).
 * - `mostVisitedCountry`: the country with the most done Stops.
 * - `farthestFromHome`: the done Stop farthest (great-circle) from ITS Trip's
 *   Home base, only across Trips that have one (`home` is non-null); Trips
 *   with no Home base are simply not candidates.
 * Ties in all three are won by whichever candidate is encountered first in
 * input order (a strictly-greater comparison, never `>=`).
 */

import { haversineKm } from "@/lib/geo-cluster";
import { nightsBetween } from "@/lib/dates";

export interface TravelTrip {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  home: { lat: number; lng: number } | null;
  stops: Array<{
    id: string;
    name: string;
    countryCode: string | null;
    lat: number | null;
    lng: number | null;
    arriveDate: string | null;
    departDate: string | null;
  }>;
  transports: Array<{
    mode: string;
    depAt: string | null;
    from: { lat: number; lng: number } | null;
    to: { lat: number; lng: number } | null;
  }>;
  accommodations: Array<{ checkIn: string; checkOut: string }>;
}

export interface StatPair {
  done: number;
  planned: number;
}

/** Transport modes that get their own bucket in `TravelStats.transport` — every mode but OTHER. */
const COUNTED_TRANSPORT_MODES = ["FLIGHT", "TRAIN", "BUS", "FERRY", "CAR"] as const;
type CountedTransportMode = (typeof COUNTED_TRANSPORT_MODES)[number];

function isCountedTransportMode(mode: string): mode is CountedTransportMode {
  return (COUNTED_TRANSPORT_MODES as readonly string[]).includes(mode);
}

export interface TravelStats {
  countries: { done: string[]; planned: string[] }; // lowercase codes; planned excludes done
  places: StatPair;
  trips: StatPair;
  nightsAway: StatPair;
  accommodationNights: StatPair;
  transport: Record<CountedTransportMode, StatPair>;
  distanceKm: StatPair;
  longestTrip: { tripId: string; name: string; nights: number } | null;
  mostVisitedCountry: { code: string; stops: number } | null;
  farthestFromHome: { stopName: string; km: number } | null;
}

function emptyStatPair(): StatPair {
  return { done: 0, planned: 0 };
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

/** Done/planned nights for one [start, end] range split at `today`. */
function splitRangeNights(start: string, end: string, today: string): StatPair {
  return {
    done: nightsBetween(start, minDate(end, today)),
    planned: nightsBetween(maxDate(start, today), end),
  };
}

export function computeTravelStats(trips: TravelTrip[], today: string): TravelStats {
  const countriesDone = new Set<string>();
  const countriesPlanned = new Set<string>();
  const places = emptyStatPair();
  const tripsPair = emptyStatPair();
  const nightsAway = emptyStatPair();
  const accommodationNights = emptyStatPair();
  const transport: Record<CountedTransportMode, StatPair> = {
    FLIGHT: emptyStatPair(),
    TRAIN: emptyStatPair(),
    BUS: emptyStatPair(),
    FERRY: emptyStatPair(),
    CAR: emptyStatPair(),
  };
  const distanceKm = emptyStatPair();

  let longestTrip: { tripId: string; name: string; nights: number } | null = null;
  const countryStopCounts = new Map<string, number>();
  let mostVisitedCountry: { code: string; stops: number } | null = null;
  let farthestFromHome: { stopName: string; km: number } | null = null;

  for (const trip of trips) {
    const tripDone = Boolean(trip.startDate && trip.startDate <= today);
    if (tripDone) tripsPair.done += 1;
    else tripsPair.planned += 1;

    if (trip.startDate && trip.endDate) {
      const nights = splitRangeNights(trip.startDate, trip.endDate, today);
      nightsAway.done += nights.done;
      nightsAway.planned += nights.planned;

      if (tripDone) {
        const fullNights = nightsBetween(trip.startDate, trip.endDate);
        if (longestTrip === null || fullNights > longestTrip.nights) {
          longestTrip = { tripId: trip.id, name: trip.name, nights: fullNights };
        }
      }
    }

    for (const stop of trip.stops) {
      const stopDone = Boolean(stop.arriveDate && stop.arriveDate <= today);
      if (stopDone) places.done += 1;
      else places.planned += 1;

      const code = stop.countryCode ? stop.countryCode.toLowerCase() : null;
      if (code) {
        if (stopDone) countriesDone.add(code);
        else countriesPlanned.add(code);
      }

      if (stopDone && code) {
        const count = (countryStopCounts.get(code) ?? 0) + 1;
        countryStopCounts.set(code, count);
        if (mostVisitedCountry === null || count > mostVisitedCountry.stops) {
          mostVisitedCountry = { code, stops: count };
        }
      }

      if (stopDone && trip.home && stop.lat != null && stop.lng != null) {
        const km = haversineKm(trip.home, { lat: stop.lat, lng: stop.lng });
        if (farthestFromHome === null || km > farthestFromHome.km) {
          farthestFromHome = { stopName: stop.name, km };
        }
      }
    }

    for (const accommodation of trip.accommodations) {
      const nights = splitRangeNights(accommodation.checkIn, accommodation.checkOut, today);
      accommodationNights.done += nights.done;
      accommodationNights.planned += nights.planned;
    }

    for (const t of trip.transports) {
      const transportDone = Boolean(t.depAt && t.depAt <= today);
      if (isCountedTransportMode(t.mode)) {
        if (transportDone) transport[t.mode].done += 1;
        else transport[t.mode].planned += 1;
      }

      if (t.from && t.to) {
        const km = haversineKm(t.from, t.to);
        if (transportDone) distanceKm.done += km;
        else distanceKm.planned += km;
      }
    }
  }

  const doneList = [...countriesDone].sort();
  const plannedList = [...countriesPlanned].filter((c) => !countriesDone.has(c)).sort();

  return {
    countries: { done: doneList, planned: plannedList },
    places,
    trips: tripsPair,
    nightsAway,
    accommodationNights,
    transport,
    distanceKm,
    longestTrip,
    mostVisitedCountry,
    farthestFromHome,
  };
}
