export interface HomeBase { name: string; lat: number | null; lng: number | null; countryCode: string | null }
export interface EndpointView { label: string | null; lat: number | null; lng: number | null; isHome: boolean }

export function tripHomeBase(trip: {
  homeName: string | null; homeLat: number | null; homeLng: number | null; homeCountryCode: string | null;
}): HomeBase | null {
  if (!trip.homeName) return null;
  return { name: trip.homeName, lat: trip.homeLat, lng: trip.homeLng, countryCode: trip.homeCountryCode };
}

export function resolveEndpoint(opts: {
  isHome: boolean;
  stopId?: string | null;
  place?: string | null;
  lat?: number | null;
  lng?: number | null;
  home: HomeBase | null;
  stopsById: Record<string, { name: string; lat: number | null; lng: number | null }>;
}): EndpointView {
  if (opts.isHome && opts.home) {
    return { label: opts.home.name, lat: opts.home.lat, lng: opts.home.lng, isHome: true };
  }
  if (opts.stopId && opts.stopsById[opts.stopId]) {
    const s = opts.stopsById[opts.stopId];
    return { label: s.name, lat: s.lat, lng: s.lng, isHome: false };
  }
  if (opts.place) {
    return { label: opts.place, lat: opts.lat ?? null, lng: opts.lng ?? null, isHome: false };
  }
  return { label: null, lat: null, lng: null, isHome: false };
}

export function findOutboundLeg<T extends { depIsHome?: boolean | null; toStopId?: string | null }>(
  transports: readonly T[],
  firstStopId: string | null,
): T | null {
  if (!firstStopId) return null;
  return transports.find((t) => Boolean(t.depIsHome) && t.toStopId === firstStopId) ?? null;
}

export function findReturnLeg<T extends { arrIsHome?: boolean | null; fromStopId?: string | null }>(
  transports: readonly T[],
  lastStopId: string | null,
): T | null {
  if (!lastStopId) return null;
  return transports.find((t) => Boolean(t.arrIsHome) && t.fromStopId === lastStopId) ?? null;
}

export function hasOutboundLeg(
  transports: readonly { depIsHome?: boolean | null; toStopId?: string | null }[],
  firstStopIdOrHome: string | HomeBase | null,
): boolean {
  if (firstStopIdOrHome === null || typeof firstStopIdOrHome === "string") {
    return findOutboundLeg(transports, firstStopIdOrHome) !== null;
  }
  // HomeBase overload: any transport departing from home counts
  return transports.some((t) => Boolean(t.depIsHome));
}

export function hasReturnLeg(
  transports: readonly { arrIsHome?: boolean | null; fromStopId?: string | null }[],
  lastStopIdOrHome: string | HomeBase | null,
  roundTrip?: boolean,
): boolean {
  if (roundTrip === false) return true; // no return leg expected for one-way trips
  if (lastStopIdOrHome === null || typeof lastStopIdOrHome === "string") {
    return findReturnLeg(transports, lastStopIdOrHome) !== null;
  }
  // HomeBase overload: any transport arriving home counts
  return transports.some((t) => Boolean(t.arrIsHome));
}
