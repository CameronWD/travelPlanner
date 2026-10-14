import "server-only";
import { db } from "@/lib/db";
import type { TransportMode } from "@/lib/enum-values";
import { orderPlanStops } from "@/lib/plan-order";
import { planScope } from "@/lib/plan-scope";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { resolveEndpointZones } from "@/lib/time-display";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { currentTripTimezone, instantToZonedDateISO, todayISOInZone } from "@/lib/tz";
import type { MatchContext } from "./build";
import type { ImportContext } from "./types";

/**
 * What matching needs to know about the plan being viewed (the real plan or
 * the Fork), as the importing Traveller may see it (Surprise, CONTEXT.md).
 */
export async function loadImportContext(
  tripId: string,
  forkId: string | null,
  viewerId: string,
): Promise<{ match: MatchContext; context: ImportContext }> {
  const scope = { tripId, ...planScope(forkId) };
  const [trip, stopRows, v] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { homeName: true, homeCountryCode: true, homeTimezone: true, homeCurrency: true } }),
    db.stop.findMany({
      where: scope,
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, country: true, countryCode: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
    loadSurpriseVisibility(tripId, viewerId),
  ]);
  const [transports, accommodations, items] = await Promise.all([
    db.transport.findMany({
      where: { ...scope, reference: { not: null } },
      select: { id: true, mode: true, reference: true, depAt: true, fromStopId: true, toStopId: true, depIsHome: true, arrIsHome: true },
    }),
    db.accommodation.findMany({ where: { ...scope, confirmation: { not: null }, ...v.where.accommodation }, select: { id: true, name: true, confirmation: true } }),
    db.item.findMany({ where: { ...scope, booking: { not: null }, ...v.where.item }, select: { id: true, title: true, booking: true } }),
  ]);

  const stops = orderPlanStops(stopRows);
  const zoneOf = new Map(stops.map((s) => [s.id, s.timezone]));
  const homeTimezone = trip?.homeTimezone ?? null;

  const match: MatchContext = {
    home: { name: trip?.homeName ?? null, countryCode: trip?.homeCountryCode?.toLowerCase() ?? null, timezone: homeTimezone },
    stops,
    blockedStopIds: new Set(v.hiddenStopIds),
    today: todayISOInZone(currentTripTimezone(stops)),
    existing: {
      transports: transports.map((t) => {
        const { depTz } = resolveEndpointZones(
          t.fromStopId ? (zoneOf.get(t.fromStopId) ?? null) : null,
          t.toStopId ? (zoneOf.get(t.toStopId) ?? null) : null,
          { depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone },
        );
        const modeLabel = TRANSPORT_MODE_META[t.mode as TransportMode]?.label ?? "Transport";
        return {
          id: t.id,
          mode: t.mode,
          reference: t.reference ?? "",
          depLocalDate: t.depAt ? instantToZonedDateISO(t.depAt, depTz) : null,
          label: `${modeLabel} ${t.reference ?? ""}`.trim(),
        };
      }),
      accommodations: accommodations.map((a) => ({ id: a.id, confirmation: a.confirmation ?? "", label: a.name })),
      items: items.map((i) => ({ id: i.id, booking: i.booking ?? "", label: i.title })),
    },
  };

  const context: ImportContext = {
    homeName: trip?.homeName ?? null,
    homeTimezone,
    homeCurrency: trip?.homeCurrency ?? "AUD",
    stops: stops.map((s) => ({
      id: s.id,
      name: s.name,
      country: s.country,
      timezone: s.timezone,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      sortOrder: s.sortOrder,
    })),
  };
  return { match, context };
}
