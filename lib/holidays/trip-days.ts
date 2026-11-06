import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { transportEndZones } from "@/lib/itinerary";
import { REAL_PLAN } from "@/lib/plan-scope";
import { instantToZonedDateISO } from "@/lib/tz";
import { readHolidayFeeds, scheduleHolidayFeeds } from "./cache";
import { holidayLine, holidaysOnDay, placesOnDay, type DayPlace, type PlacesOnDayInput } from "./day";

type TripHolidayInput = {
  tripStart: string;
  tripEnd: string;
  home: DayPlace | null;
  stops: PlacesOnDayInput["stops"];
  transportEnds: PlacesOnDayInput["transportEnds"];
};

const readTripInput = cache(async (tripId: string): Promise<TripHolidayInput | null> => {
  const [trip, stops, transports] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true, homeTimezone: true, homeCountryCode: true, homeRegion: true } }),
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, timezone: true, arriveDate: true, departDate: true, countryCode: true, region: true },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        fromStopId: true, toStopId: true, depAt: true, arrAt: true, depIsHome: true, arrIsHome: true,
        depCountryCode: true, depRegion: true, arrCountryCode: true, arrRegion: true,
      },
    }),
  ]);
  if (!trip?.startDate) return null;

  const stopById = new Map(stops.map((s) => [s.id, s]));
  const transportEnds: TripHolidayInput["transportEnds"] = [];
  for (const t of transports) {
    if (!t.depAt) continue;
    const fromStop = t.fromStopId ? stopById.get(t.fromStopId) : undefined;
    const toStop = t.toStopId ? stopById.get(t.toStopId) : undefined;
    const { depTz, arrTz } = transportEndZones(t, trip.homeTimezone, fromStop, toStop);
    const placeOf = (code: string | null, region: string | null, stop: typeof fromStop) => {
      const countryCode = code ?? stop?.countryCode;
      return countryCode ? { countryCode, region: code ? region : (stop?.region ?? null) } : null;
    };
    transportEnds.push({
      date: instantToZonedDateISO(t.depAt, depTz),
      isHome: t.depIsHome,
      place: placeOf(t.depCountryCode, t.depRegion, fromStop),
    });
    if (t.arrAt) {
      transportEnds.push({
        date: instantToZonedDateISO(t.arrAt, arrTz),
        isHome: t.arrIsHome,
        place: placeOf(t.arrCountryCode, t.arrRegion, toStop),
      });
    }
  }

  return {
    tripStart: trip.startDate,
    tripEnd: trip.endDate ?? trip.startDate,
    home: trip.homeCountryCode ? { countryCode: trip.homeCountryCode, region: trip.homeRegion } : null,
    stops: stops.filter((s) => s.arriveDate),
    transportEnds,
  };
});

export async function loadHolidayLines(tripId: string, dates: string[]): Promise<Map<string, string[]>> {
  const lines = new Map<string, string[]>();
  const input = await readTripInput(tripId);
  if (!input) return lines;

  const perDate = new Map(dates.map((date) => [date, placesOnDay({ ...input, date })]));
  const countries = [...new Set([...perDate.values()].flat().map((p) => p.countryCode.toLowerCase()))];
  if (countries.length === 0) return lines;

  const feeds = await readHolidayFeeds(countries);
  scheduleHolidayFeeds(countries);

  for (const [date, places] of perDate) {
    const found = holidaysOnDay(places, date, feeds).map(holidayLine);
    if (found.length > 0) lines.set(date, found);
  }
  return lines;
}
