import { findShareLink, loadShareStops } from "@/lib/share-lookup";
import { nightsBetween } from "@/lib/dates";

// Deliberately NOT "use server": only createTrip calls this, after its own
// requireUser(). As a server action it would be a second, unguarded endpoint.

export interface SharedRouteStop {
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  nights: number;
}

/**
 * Route copy (CONTEXT.md; spec §E.3): the stops a Share link shows, reduced
 * to what a new Trip's rough Stops carry. Through the same lookup as the
 * page, so a revoked or rotated token resolves to nothing and is refused.
 * No dates, Items, stays, transport or Journal.
 */
export async function routeStopsFromShare(
  token: string,
): Promise<{ linkId: string; tripName: string; stops: SharedRouteStop[] } | null> {
  const link = copyableLink(await findShareLink(token));
  if (!link) return null;
  const stops = await loadShareStops(link.trip.id);
  return {
    linkId: link.id,
    tripName: link.trip.name,
    stops: stops.map((s) => ({
      name: s.name,
      country: s.country,
      lat: s.lat,
      lng: s.lng,
      nights: nightsBetween(s.arriveDate, s.departDate),
    })),
  };
}

/**
 * Just the shared Trip's name, for New trip's "{name} (my version)" pre-fill —
 * null exactly when routeStopsFromShare would refuse the token. The stops are
 * left to createTrip, which re-derives them server-side.
 */
export async function sharedRouteName(token: string): Promise<string | null> {
  return copyableLink(await findShareLink(token))?.trip.name ?? null;
}

type ShareLinkRow = Awaited<ReturnType<typeof findShareLink>>;

/** A date-less trip's Share page 404s, so it has no route to copy either. */
function copyableLink(link: ShareLinkRow): NonNullable<ShareLinkRow> | null {
  return link && link.trip.startDate && link.trip.endDate ? link : null;
}
